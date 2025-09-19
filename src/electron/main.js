import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Store from 'electron-store';
import axios from 'axios';
import dotenv from 'dotenv';

// Importar servicios del core
import ConfigManager from '../core/config/ConfigManager.js';
import DatabaseManager from '../core/database/DatabaseManager.js';
import AdsPowerManager from '../core/adspower/AdsPowerManager.js';
import NavigationController from '../core/navigation/NavigationController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Proceso principal de Electron para Cookies Hexzor
 * Maneja la ventana principal, autenticación persistente y coordinación con el core
 */
class ElectronApp {
    constructor() {
        this.mainWindow = null;
        this.isAuthenticated = false;
        this.userToken = null;
        this.userData = null;

        // Cargar variables de entorno
        dotenv.config();
        this.authBackendUrl = process.env.AUTH_BACKEND_URL;
        
        // Store para persistir configuración y autenticación
        this.store = new Store({
            schema: {
                authToken: { type: 'string' },
                lastEmail: { type: 'string' },
                subscriptionEnd: { type: 'string' },
                tokenExpiry: { type: 'string' },
                customerName: { type: 'string' },
                customerId: { type: 'string' },
                windowBounds: {
                    type: 'object',
                    properties: {
                        x: { type: 'integer' },
                        y: { type: 'integer' },
                        width: { type: 'integer' },
                        height: { type: 'integer' }
                    }
                }
            }
        });

        // Inicializar servicios del core
        this.configManager = new ConfigManager();
        this.databaseManager = null;
        this.adsPowerManager = null;
        this.navigationController = null;
    }

    /**
     * Inicializa la aplicación Electron
     */
    async initialize() {
        try {
            console.log('🚀 Iniciando Cookies Hexzor...');

            // Verificar que la URL del backend esté configurada
            if (!this.authBackendUrl) {
                throw new Error('La URL del backend de autenticación no está configurada. Por favor revisa el archivo .env');
            }

            // Configurar eventos de la aplicación
            this.setupAppEvents();

            // Configurar IPC handlers
            this.setupIpcHandlers();

            // Inicializar servicios del core
            await this.initializeCoreServices();

            console.log('✅ Aplicación inicializada correctamente');

        } catch (error) {
            console.error('❌ Error inicializando aplicación:', error.message);
            this.showErrorDialog('Error de Inicialización', error.message);
        }
    }

    /**
     * Configura eventos de la aplicación Electron
     */
    setupAppEvents() {
        // Cuando la app esté lista
        app.whenReady().then(() => {
            this.createMainWindow();
            this.createApplicationMenu();
        });

        // Cuando todas las ventanas estén cerradas
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        // Al activar (macOS)
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createMainWindow();
            }
        });

        // Antes de cerrar
        app.on('before-quit', async () => {
            await this.cleanup();
        });
    }

    /**
     * Crea la ventana principal
     */
    createMainWindow() {
        // Obtener bounds guardados o usar valores por defecto
        const bounds = this.store.get('windowBounds', {
            width: 1200,
            height: 800,
            x: undefined,
            y: undefined
        });

        // Crear ventana principal
        this.mainWindow = new BrowserWindow({
            ...bounds,
            minWidth: 800,
            minHeight: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: join(__dirname, 'preload.js'),
                webSecurity: false
            },
            titleBarStyle: 'default',
            show: false // No mostrar hasta que esté lista
        });

        // Cargar interfaz
        this.mainWindow.loadFile(join(__dirname, '../ui/index.html'));

        // Mostrar cuando esté lista
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
            this.checkExistingAuth();
        });

        // Guardar bounds al cerrar
        this.mainWindow.on('close', () => {
            const bounds = this.mainWindow.getBounds();
            this.store.set('windowBounds', bounds);
        });

        // Para desarrollo: abrir DevTools automáticamente
        if (process.env.NODE_ENV === 'development') {
            this.mainWindow.webContents.openDevTools();
        }
    }

    /**
     * Crea el menú de la aplicación
     */
    createApplicationMenu() {
        const template = [
            {
                label: 'Archivo',
                submenu: [
                    {
                        label: 'Cerrar sesión',
                        accelerator: process.platform === 'darwin' ? 'Cmd+L' : 'Ctrl+L',
                        click: () => this.handleLogout()
                    },
                    { type: 'separator' },
                    {
                        label: 'Salir',
                        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                        click: () => app.quit()
                    }
                ]
            },
            {
                label: 'Ver',
                submenu: [
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            {
                label: 'Ayuda',
                submenu: [
                    {
                        label: 'Acerca de',
                        click: () => this.showAboutDialog()
                    }
                ]
            }
        ];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    /**
     * Configura manejadores IPC
     */
    setupIpcHandlers() {
        // Autenticación
        ipcMain.handle('auth:request-code', this.handleRequestCode.bind(this));
        ipcMain.handle('auth:verify-code', this.handleVerifyCode.bind(this));
        ipcMain.handle('auth:logout', this.handleLogout.bind(this));
        ipcMain.handle('auth:get-status', this.getAuthStatus.bind(this));

        // Ads Power
        ipcMain.handle('adspower:check-status', this.checkAdsPowerStatus.bind(this));
        ipcMain.handle('adspower:list-profiles', this.listAdsPowerProfiles.bind(this));
        ipcMain.handle('adspower:profile-info', this.getProfileInfo.bind(this));

        // Navegación
        ipcMain.handle('navigation:start', this.startNavigation.bind(this));
        ipcMain.handle('navigation:stop', this.stopNavigation.bind(this));
        ipcMain.handle('navigation:get-status', this.getNavigationStatus.bind(this));

        // Base de datos
        ipcMain.handle('database:get-stats', this.getDatabaseStats.bind(this));
        ipcMain.handle('database:get-sites', this.getRandomSites.bind(this));
        ipcMain.handle('reports:get', this.getReports.bind(this));
        ipcMain.handle('reports:summary', this.getReportsSummary.bind(this));

        // Configuración
        ipcMain.handle('config:get', this.getConfiguration.bind(this));
        ipcMain.handle('config:update', this.updateConfiguration.bind(this));

        // Sistema
        ipcMain.handle('system:show-folder', this.showDataFolder.bind(this));
        ipcMain.handle('system:export-logs', this.exportLogs.bind(this));

        // Portapapeles
        ipcMain.handle('clipboard:read-text', () => {
            const { clipboard } = require('electron');
            return clipboard.readText();
        });

        ipcMain.handle('clipboard:write-text', (event, text) => {
            const { clipboard } = require('electron');
            clipboard.writeText(text);
        });
    }

    /**
     * Inicializa servicios del core
     */
    async initializeCoreServices() {
        try {
            // Cargar configuración
            await this.configManager.loadConfig();

            // Inicializar base de datos
            this.databaseManager = new DatabaseManager();
            await this.databaseManager.initialize();

            // Inicializar Ads Power Manager
            this.adsPowerManager = new AdsPowerManager(this.configManager);

            // Inicializar Navigation Controller
            this.navigationController = new NavigationController(
                this.databaseManager,
                this.configManager,
                this.adsPowerManager
            );

            console.log('🔧 Servicios del core inicializados');

        } catch (error) {
            console.error('❌ Error inicializando servicios:', error.message);
            throw error;
        }
    }

    /**
     * Verifica autenticación existente al inicio de la aplicación
     * Solo pide re-autenticación si es necesario
     */
    async checkExistingAuth() {
        try {
            console.log('🔐 Verificando autenticación existente...');

            const storedToken = this.store.get('authToken');
            const storedEmail = this.store.get('lastEmail');
            const tokenExpiry = this.store.get('tokenExpiry');
            const subscriptionEnd = this.store.get('subscriptionEnd');

            // Si no hay token guardado, mostrar login
            if (!storedToken || !storedEmail) {
                console.log('📝 No hay sesión guardada, mostrando login');
                this.mainWindow.webContents.send('auth:show-login');
                return;
            }

            // Verificar si el token ha expirado (tokens válidos por 30 días)
            if (tokenExpiry) {
                const expiryDate = new Date(tokenExpiry);
                const now = new Date();
                
                if (now > expiryDate) {
                    console.log('⏰ Token expirado, requiere nueva autenticación');
                    this.clearStoredAuth();
                    this.mainWindow.webContents.send('auth:show-login');
                    return;
                }
            }

            // Verificar si la suscripción ha expirado
            if (subscriptionEnd) {
                const subEndDate = new Date(subscriptionEnd);
                const now = new Date();
                
                if (now > subEndDate) {
                    console.log('📅 Suscripción expirada, requiere nueva autenticación');
                    this.clearStoredAuth();
                    this.mainWindow.webContents.send('auth:show-login');
                    return;
                }
            }

            // Validar token con el backend
            const isValidToken = await this.validateTokenWithBackend(storedToken, storedEmail);
            
            if (isValidToken.success) {
                // Token válido y suscripción activa
                this.isAuthenticated = true;
                this.userToken = storedToken;
                this.userData = {
                    email: storedEmail,
                    customerName: this.store.get('customerName'),
                    customerId: this.store.get('customerId'),
                    subscriptionEnd: subscriptionEnd
                };
                
                console.log('✅ Sesión restaurada automáticamente para:', storedEmail);
                
                this.mainWindow.webContents.send('auth:authenticated', {
                    email: storedEmail,
                    token: storedToken,
                    user: this.userData
                });
                
            } else {
                // Token inválido o suscripción inactiva
                console.log('❌ Token inválido o suscripción inactiva:', isValidToken.error);
                this.clearStoredAuth();
                this.mainWindow.webContents.send('auth:show-login');
            }

        } catch (error) {
            console.error('Error verificando autenticación:', error.message);
            this.clearStoredAuth();
            this.mainWindow.webContents.send('auth:show-login');
        }
    }

    /**
     * Valida un token guardado con el backend de autenticación
     */
    async validateTokenWithBackend(token, email) {
        try {
            const response = await axios.post(`${this.authBackendUrl}/api/auth/validate-token`, {
                token: token,
                email: email
            }, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.data.success) {
                // Actualizar información de suscripción si ha cambiado
                const subscriptionData = response.data.subscription;
                if (subscriptionData && subscriptionData.subscriptionEnd) {
                    this.store.set('subscriptionEnd', subscriptionData.subscriptionEnd);
                    this.store.set('customerName', subscriptionData.customerName);
                    this.store.set('customerId', subscriptionData.customerId);
                }
                
                return { success: true };
            } else {
                return { success: false, error: response.data.error || 'Token inválido' };
            }

        } catch (error) {
            if (error.response && error.response.status === 401) {
                return { success: false, error: 'Token expirado o inválido' };
            }
            
            console.error('Error validando token:', error.message);
            return { success: false, error: 'Error de conexión con servidor de autenticación' };
        }
    }

    /**
     * Limpia toda la información de autenticación guardada
     */
    clearStoredAuth() {
        // Usar delete() en lugar de set con undefined
        this.store.delete('authToken');
        this.store.delete('lastEmail');
        this.store.delete('subscriptionEnd');
        this.store.delete('tokenExpiry');
        this.store.delete('customerName');
        this.store.delete('customerId');
        
        this.isAuthenticated = false;
        this.userToken = null;
        this.userData = null;
    }

    //#region AUTENTICACIÓN
    /**
     * Solicita código de verificación al backend
     */
    async handleRequestCode(event, email) {
        try {
            console.log('📧 Solicitando código para:', email);

            const response = await axios.post(`${this.authBackendUrl}/api/auth/request-code`, {
                email: email
            }, {
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.success) {
                console.log('✅ Código enviado exitosamente');
                return { 
                    success: true, 
                    message: response.data.message || 'Código enviado a tu email' 
                };
            } else {
                return { 
                    success: false, 
                    error: response.data.error || 'Error enviando código'
                };
            }

        } catch (error) {
            console.error('Error solicitando código:', error.message);
            
            if (error.response) {
                const status = error.response.status;
                const errorMsg = error.response.data?.error || 'Error del servidor';
                
                if (status === 404) {
                    return { success: false, error: 'Email no encontrado o sin suscripción activa' };
                } else if (status === 429) {
                    return { success: false, error: 'Demasiados intentos. Intenta más tarde' };
                } else {
                    return { success: false, error: errorMsg };
                }
            }
            
            return { 
                success: false, 
                error: 'Se ha presentado un error. Por favor intenta nuevamente.' 
            };
        }
    }

    /**
     * Verifica código de acceso con el backend
     */
    async handleVerifyCode(event, email, code) {
        try {
            console.log('🔐 Verificando código para:', email);

            const requestData = { email: email, code: code };
            console.log('Enviando a backend:', requestData);

            const response = await axios.post(`${this.authBackendUrl}/api/auth/verify-code`, requestData, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('🔐 Respuesta del backend:', response.data);

            if (response.data.success) {
                const { data } = response.data;
                const token = data.token;
                const user = data.user;
                
                // Calcular fecha de expiración del token (30 días)
                const tokenExpiry = new Date();
                tokenExpiry.setDate(tokenExpiry.getDate() + 30);
                
                // Guardar en store usando set()
                this.store.set('authToken', token);
                this.store.set('lastEmail', email);
                this.store.set('tokenExpiry', tokenExpiry.toISOString());
                
                if (user.subscriptionEnd) {
                    this.store.set('subscriptionEnd', user.subscriptionEnd);
                }
                if (user.name) {
                    this.store.set('customerName', user.name);
                }
                
                // Actualizar estado
                this.isAuthenticated = true;
                this.userToken = token;
                this.userData = {
                    email: email,
                    customerName: user.name,
                    subscriptionEnd: user.subscriptionEnd
                };
                
                console.log('✅ Autenticación exitosa para:', email);
                
                return { 
                    success: true, 
                    token,
                    user: this.userData
                };
                
            } else {
                return { 
                    success: false, 
                    error: response.data.error || 'Código inválido' 
                };
            }

        } catch (error) {
            console.error('Error verificando código:', error.message);
            
            if (error.response) {
                const status = error.response.status;
                const errorMsg = error.response.data?.error || 'Error del servidor';
                
                if (status === 401) {
                    return { success: false, error: 'Código inválido o expirado' };
                } else if (status === 429) {
                    return { success: false, error: 'Demasiados intentos. Intenta más tarde' };
                } else {
                    return { success: false, error: errorMsg };
                }
            }
            
            return { 
                success: false, 
                error: 'Se ha presentado un error. Por favor intenta nuevamente.'
            };
        }
    }

    /**
     * Cierra sesión del usuario (manual)
     */
    async handleLogout() {
        try {
            console.log('👋 Cerrando sesión...');
            
            // Intentar notificar al backend (opcional, no falla si no se puede)
            try {
                if (this.userToken) {
                    await axios.post(`${this.authBackendUrl}/api/auth/logout`, {}, {
                        timeout: 5000,
                        headers: {
                            'Authorization': `Bearer ${this.userToken}`
                        }
                    });
                }
            } catch (error) {
                console.warn('No se pudo notificar logout al backend:', error.message);
            }
            
            // Limpiar estado local
            this.clearStoredAuth();
            
            // Notificar a la UI
            this.mainWindow.webContents.send('auth:logged-out');
            
            console.log('✅ Sesión cerrada exitosamente');
            
            return { success: true };

        } catch (error) {
            console.error('Error cerrando sesión:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtiene estado de autenticación actual
     */
    async getAuthStatus() {
        return {
            isAuthenticated: this.isAuthenticated,
            user: this.userData
        };
    }
    //#endregion AUTENTICACIÓN

    //#region ADS POWER
    /**
     * Verifica estado de Ads Power
     */
    async checkAdsPowerStatus() {
        try {
            const isAvailable = await this.adsPowerManager.checkAdsPowerStatus();
            return { success: true, available: isAvailable };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Lista perfiles disponibles de Ads Power
     */
    async listAdsPowerProfiles() {
        try {
            const profiles = await this.adsPowerManager.getAvailableProfiles();
            return { success: true, profiles };
        } catch (error) {
            console.error('Error listando perfiles:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtiene información de perfil específico
     */
    async getProfileInfo(event, profileId) {
        try {
            const info = await this.adsPowerManager.getProfileInfo(profileId);
            return { success: true, info };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    //#endregion ADS POWER

    //#region NAVEGACIÓN
    /**
     * Inicia navegación automatizada usando el NavigationController
     * @param {Object} event - Evento IPC
     * @param {Object} config - Configuración de navegación
     * @returns {Promise<Object>} Resultado de la operación
     */
    async startNavigation(event, config) {
        try {
            console.log('🚀 Recibida solicitud de navegación desde UI:', config);

            // Validar configuración recibida
            if (!config || !config.profileIds || !Array.isArray(config.profileIds)) {
                throw new Error('Configuración inválida: se requiere array de profileIds');
            }

            const { profileIds, targetCookies = 2500 } = config;

            if (profileIds.length === 0) {
                throw new Error('Se requiere al menos un perfil para iniciar navegación');
            }

            console.log(`📋 Configuración validada: ${profileIds.length} perfiles, ${targetCookies} cookies objetivo`);

            // Verificar disponibilidad del NavigationController
            if (!this.navigationController) {
                console.error('❌ NavigationController no está disponible');
                throw new Error('NavigationController no está inicializado');
            }

            // Verificar estado de Ads Power (opcional pero recomendado)
            if (this.adsPowerManager) {
                const adsPowerStatus = await this.adsPowerManager.checkAdsPowerStatus();
                if (!adsPowerStatus) {
                    console.warn('⚠️ Ads Power no está disponible');
                } else {
                    console.log('✅ Ads Power está disponible');
                }
            }

            // Validar perfiles si se solicita
            if (config.validateProfiles !== false) {
                console.log('🔍 Validando perfiles...');
                await this.validateProfilesForNavigation(profileIds);
            }

            // Verificar recursos del sistema
            this.checkSystemResourcesForNavigation(profileIds.length);

            // Configurar eventos de progreso para la UI
            this.setupNavigationProgressEvents();

            console.log('⏳ Iniciando NavigationController...');

            // Iniciar navegación usando el NavigationController
            const navigationPromise = this.navigationController.startMultipleNavigationSessions(
                profileIds,
                targetCookies
            );

            // Notificar a la UI que la navegación ha comenzado
            this.sendNavigationStatusUpdate({
                status: 'starting',
                profileIds: profileIds,
                targetCookies: targetCookies,
                timestamp: new Date().toISOString()
            });

            // Esperar el resultado en background y manejar la finalización
            this.handleNavigationCompletion(navigationPromise, profileIds);

            console.log('✅ Navegación iniciada exitosamente');

            return {
                success: true,
                message: 'Navegación iniciada correctamente',
                data: {
                    profileIds: profileIds,
                    targetCookies: targetCookies,
                    totalTarget: targetCookies * profileIds.length
                }
            };

        } catch (error) {
            console.error('❌ Error iniciando navegación:', error.message);
            console.error('Stack trace:', error.stack);
            
            // Notificar error a la UI
            this.sendNavigationStatusUpdate({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Detiene la navegación activa
     * @param {Object} event - Evento IPC
     * @returns {Promise<Object>} Resultado de la operación
     */
    async stopNavigation(event) {
        try {
            console.log('🛑 Deteniendo navegación desde UI...');

            if (!this.navigationController) {
                return {
                    success: false,
                    error: 'NavigationController no está disponible'
                };
            }

            // Llamar al método de cleanup del NavigationController
            await this.navigationController.stopAllSessions();

            // Notificar a la UI
            this.sendNavigationStatusUpdate({
                status: 'stopped',
                timestamp: new Date().toISOString()
            });

            console.log('✅ Navegación detenida correctamente');

            return {
                success: true,
                message: 'Navegación detenida correctamente'
            };

        } catch (error) {
            console.error('❌ Error deteniendo navegación:', error.message);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Obtiene el estado actual de la navegación
     * @param {Object} event - Evento IPC
     * @returns {Promise<Object>} Estado de la navegación
     */
    async getNavigationStatus(event) {
        try {
            if (!this.navigationController) {
                return {
                    success: false,
                    error: 'NavigationController no está disponible'
                };
            }

            const status = this.navigationController.getGlobalStatus();
            
            return {
                success: true,
                data: status
            };

        } catch (error) {
            console.error('❌ Error obteniendo estado de navegación:', error.message);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Configura eventos de progreso para comunicación con la UI
     */
    setupNavigationProgressEvents() {
        if (!this.navigationController) return;

        // Escuchar eventos del NavigationController y reenviarlos a la UI
        this.navigationController.on('session:started', (data) => {
            console.log(`🔔 [DEBUG] Evento recibido en main.js: session:started para ${data.profileId}`);

            this.sendNavigationProgressUpdate({
                type: 'session_started',
                sessionId: data.sessionId,
                profileId: data.profileId,
                timestamp: new Date().toISOString(),
                ...data
            });
        });

        this.navigationController.on('session:progress', (data) => {
            console.log(`🔔 [DEBUG] Evento recibido en main.js: session:progress para ${data.profileId}: ${data.cookiesCollected} cookies`);

            this.sendNavigationProgressUpdate({
                type: 'session_progress',
                sessionId: data.sessionId,
                profileId: data.profileId,
                progress: data.progress,
                cookies: data.cookiesCollected,
                sitesVisited: data.sitesVisited,
                currentSite: data.currentSite,
                timestamp: new Date().toISOString()
            });
        });

        this.navigationController.on('session:completed', (data) => {
            this.sendNavigationProgressUpdate({
                type: 'session_completed',
                sessionId: data.sessionId,
                profileId: data.profileId,
                finalStats: data.finalStats,
                timestamp: new Date().toISOString()
            });
        });

        this.navigationController.on('session:error', (data) => {
            this.sendNavigationProgressUpdate({
                type: 'session_error',
                sessionId: data.sessionId,
                profileId: data.profileId,
                error: data.error,
                timestamp: new Date().toISOString()
            });
        });

        this.navigationController.on('global:stats', (data) => {
            this.sendNavigationProgressUpdate({
                type: 'global_stats',
                stats: data,
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * Maneja la finalización de la navegación en background
     * @param {Promise} navigationPromise - Promesa de navegación
     * @param {Array} profileIds - IDs de perfiles
     */
    async handleNavigationCompletion(navigationPromise, profileIds) {
        try {
            const results = await navigationPromise;
            
            console.log('✅ Navegación completada:', results);

            // Enviar resumen final a la UI
            this.sendNavigationStatusUpdate({
                status: 'completed',
                results: results,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Error en navegación:', error.message);

            // Enviar error a la UI
            this.sendNavigationStatusUpdate({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });

            // Intentar cleanup en caso de error
            try {
                await this.navigationController.stopAllSessions();
            } catch (cleanupError) {
                console.error('Error en cleanup:', cleanupError.message);
            }
        }
    }

    /**
     * Envía actualización de estado de navegación a la UI
     * @param {Object} statusData - Datos de estado
     */
    sendNavigationStatusUpdate(statusData) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('navigation:status-change', statusData);
        }
    }

    /**
     * Envía actualización de progreso de navegación a la UI
     * @param {Object} progressData - Datos de progreso
     */
    sendNavigationProgressUpdate(progressData) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('navigation:progress', progressData);
        }
    }
    //#endregion NAVEGACIÓN

    //#region DB
    /**
     * Obtiene estadísticas de base de datos
     */
    async getDatabaseStats() {
        try {
            const stats = await this.databaseManager.getWebsiteStats();
            return { success: true, stats };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtiene sitios aleatorios
     */
    async getRandomSites(event, count = 10) {
        try {
            const sites = await this.databaseManager.getRandomWebsites(count);
            return { success: true, sites };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    //#endregion DB

    //#region REPORTES
    /**
     * Obtiene reportes de navegación con filtros y paginación
     * @param {Object} event - Evento IPC
     * @param {Object} options - Opciones de consulta
     * @returns {Promise<Object>} Reportes con paginación
     */
    async getReports(event, options = {}) {
        try {
            const {
                filters = {},
                page = 1,
                limit = 10
            } = options;

            console.log('📊 Obteniendo reportes con filtros:', filters);

            const result = await this.databaseManager.getNavigationReports(filters, page, limit);
            
            return {
                success: true,
                ...result
            };

        } catch (error) {
            console.error('❌ Error obteniendo reportes:', error.message);
            return {
                success: false,
                error: error.message,
                data: [],
                pagination: {
                    currentPage: 1,
                    totalPages: 0,
                    totalRecords: 0,
                    recordsPerPage: limit,
                    hasNextPage: false,
                    hasPreviousPage: false
                }
            };
        }
    }

    /**
     * Obtiene resumen estadístico de reportes
     * @param {Object} event - Evento IPC
     * @param {Object} filters - Filtros para el resumen
     * @returns {Promise<Object>} Resumen estadístico
     */
    async getReportsSummary(event, filters = {}) {
        try {
            console.log('📈 Obteniendo resumen de reportes con filtros:', filters);

            const result = await this.databaseManager.getReportsSummary(filters);
            
            return {
                success: true,
                ...result
            };

        } catch (error) {
            console.error('❌ Error obteniendo resumen de reportes:', error.message);
            return {
                success: false,
                error: error.message,
                summary: {}
            };
        }
    }
    //#endregion REPORTES

    //#region CONFIGURACIÓN
    /**
     * Obtiene configuración
     */
    async getConfiguration() {
        try {
            const config = this.configManager.getConfig();
            return { success: true, config };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Actualiza configuración
     */
    async updateConfiguration(event, updates) {
        try {
            Object.keys(updates).forEach(key => {
                this.configManager.set(key, updates[key]);
            });
            
            await this.configManager.saveConfig();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    //#endregion CONFIGURACIÓN

    //#region SISTEMA
    /**
     * Muestra carpeta de datos
     */
    async showDataFolder() {
        const dataPath = this.configManager.getDatabasePath();
        shell.showItemInFolder(dataPath);
    }

    /**
     * Exporta logs
     */
    async exportLogs() {
        try {
            const result = await dialog.showSaveDialog(this.mainWindow, {
                defaultPath: `hexzor-logs-${new Date().toISOString().split('T')[0]}.txt`,
                filters: [
                    { name: 'Archivos de texto', extensions: ['txt'] },
                    { name: 'Todos los archivos', extensions: ['*'] }
                ]
            });

            if (!result.canceled) {
                // Aquí implementarías la exportación de logs
                return { success: true, path: result.filePath };
            }

            return { success: false, error: 'Exportación cancelada' };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Muestra diálogo de error
     */
    showErrorDialog(title, message) {
        dialog.showErrorBox(title, message);
    }

    /**
     * Muestra diálogo "Acerca de"
     */
    showAboutDialog() {
        dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'Acerca de Cookies Hexzor',
            message: 'Cookies Hexzor v1.0.0',
            detail: 'Sistema automatizado para calentar contingencias\n© 2025 Todos los derechos reservados.'
        });
    }

    /**
     * Parsea y valida array de IDs de perfiles
     * Equivalente a parseProfileIds en main.js pero adaptado para UI
     * @param {Array} profileIds - Array de IDs de perfiles
     * @returns {Array} Array de IDs únicos validados
     */
    parseAndValidateProfiles(profileIds) {
        if (!Array.isArray(profileIds) || profileIds.length === 0) {
            throw new Error('Debe proporcionar al menos un ID de perfil');
        }

        // Filtrar IDs válidos y remover duplicados
        const validIds = profileIds
            .filter(id => id && typeof id === 'string' && id.trim().length > 0)
            .map(id => id.trim());

        const uniqueIds = [...new Set(validIds)];

        if (uniqueIds.length === 0) {
            throw new Error('No se encontraron IDs válidos de perfiles');
        }

        if (uniqueIds.length > 10) {
            console.warn('⚠️  Advertencia: Usar más de 10 perfiles puede consumir recursos excesivos');
        }

        return uniqueIds;
    }

    /**
     * Valida que todos los perfiles existen en Ads Power
     * @param {Array} profileIds - Array de IDs de perfiles
     */
    async validateProfilesForNavigation(profileIds) {
        console.log('🔍 Validando perfiles en Ads Power...');

        const availableProfiles = await this.adsPowerManager.getAvailableProfiles();
        const availableIds = availableProfiles.map(p => p.user_id || p.id);

        const invalidProfiles = profileIds.filter(id => !availableIds.includes(id));

        if (invalidProfiles.length > 0) {
            throw new Error(`Perfiles no encontrados en Ads Power: ${invalidProfiles.join(', ')}`);
        }

        console.log('✅ Todos los perfiles son válidos');
    }

    /**
     * Verifica recursos del sistema para la navegación
     * @param {number} profileCount - Cantidad de perfiles a usar
     */
    checkSystemResourcesForNavigation(profileCount) {
        const requiredRAM = profileCount * 512; // MB por perfil estimado
        
        console.log(`💾 Recursos estimados requeridos: ${requiredRAM}MB RAM para ${profileCount} perfil(es)`);
        
        if (profileCount > 5) {
            console.warn('⚠️  Advertencia: Muchos perfiles simultáneos pueden afectar el rendimiento');
        }
    }

    /**
     * Limpieza antes de cerrar
     */
    async cleanup() {
        try {
            console.log('🧹 Limpiando recursos...');
            
            if (this.navigationController) {
                await this.navigationController.stopAllSessions();
            }
            
            if (this.adsPowerManager) {
                await this.adsPowerManager.cleanup();
            }

            if (this.databaseManager) {
                await this.databaseManager.close();
            }

            console.log('✅ Limpieza completada');

        } catch (error) {
            console.error('Error en limpieza:', error.message);
        }
    }
}
//#endregion SISTEMA

// Inicializar aplicación
const electronApp = new ElectronApp();

// Prevenir creación de ventanas adicionales para URLs
app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
        shell.openExternal(navigationUrl);
    });
});

// Inicializar cuando la app esté lista
app.whenReady().then(() => {
    electronApp.initialize();
});