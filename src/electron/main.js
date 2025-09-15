import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Store from 'electron-store';

// Importar servicios del core
import ConfigManager from '../core/config/ConfigManager.js';
import DatabaseManager from '../core/database/DatabaseManager.js';
import AdsPowerManager from '../core/adspower/AdsPowerManager.js';
import NavigationController from '../core/navigation/NavigationController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Proceso principal de Electron para Nexos Cookies Tool
 * Maneja la ventana principal, autenticación y coordinación con el core
 */
class ElectronApp {
    constructor() {
        this.mainWindow = null;
        this.isAuthenticated = false;
        this.userToken = null;
        this.userData = null;
        
        // Store para persistir configuración
        this.store = new Store({
            schema: {
                authToken: { type: 'string' },
                lastEmail: { type: 'string' },
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
            console.log('🚀 Iniciando Nexos Cookies Tool...');

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

        // Cuando todas las ventanas se cierran
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        // Cuando la app se activa (macOS)
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createMainWindow();
            }
        });

        // Antes de cerrar la aplicación
        app.on('before-quit', async () => {
            await this.cleanup();
        });
    }

    /**
     * Crea la ventana principal
     */
    createMainWindow() {
        // Recuperar bounds guardados o usar valores por defecto
        const defaultBounds = { width: 1200, height: 800, x: undefined, y: undefined };
        const savedBounds = this.store.get('windowBounds', defaultBounds);

        this.mainWindow = new BrowserWindow({
            ...savedBounds,
            minWidth: 800,
            minHeight: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: join(__dirname, 'preload.js')
            },
            icon: join(__dirname, '../assets/icon.png'),
            show: false,
            titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'
        });

        // Cargar interfaz de usuario
        this.mainWindow.loadFile(join(__dirname, '../ui/index.html'));

        // Mostrar cuando esté listo
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
            
            // Verificar autenticación al inicio
            this.checkExistingAuth();
        });

        // Guardar posición de ventana al cerrar
        this.mainWindow.on('close', () => {
            const bounds = this.mainWindow.getBounds();
            this.store.set('windowBounds', bounds);
        });

        // Abrir enlaces externos en navegador por defecto
        this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });

        // Configurar para desarrollo
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
                        label: 'Cerrar Sesión',
                        accelerator: 'CmdOrCtrl+L',
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

        // Configuración
        ipcMain.handle('config:get', this.getConfiguration.bind(this));
        ipcMain.handle('config:update', this.updateConfiguration.bind(this));

        // Sistema
        ipcMain.handle('system:show-folder', this.showDataFolder.bind(this));
        ipcMain.handle('system:export-logs', this.exportLogs.bind(this));
    }

    /**
     * Inicializa servicios del core
     */
    async initializeCoreServices() {
        try {
            // Cargar configuración
            await this.configManager.loadConfig();

            // Inicializar base de datos
            this.databaseManager = new DatabaseManager(this.configManager);
            await this.databaseManager.initialize();

            // Inicializar Ads Power Manager
            this.adsPowerManager = new AdsPowerManager(this.configManager);

            // Inicializar Navigation Controller
            this.navigationController = new NavigationController(
                this.databaseManager,
                this.configManager
            );

            console.log('🔧 Servicios del core inicializados');

        } catch (error) {
            console.error('❌ Error inicializando servicios:', error.message);
            throw error;
        }
    }

    /**
     * Verifica autenticación existente al inicio
     */
    async checkExistingAuth() {
        try {
            const token = this.store.get('authToken');
            const lastEmail = this.store.get('lastEmail');

            if (token) {
                // Validar token con el backend
                const isValid = await this.validateToken(token);
                if (isValid) {
                    this.isAuthenticated = true;
                    this.userToken = token;
                    this.mainWindow.webContents.send('auth:authenticated', {
                        email: lastEmail,
                        token: token
                    });
                    return;
                }
            }

            // Si no hay token válido, mostrar pantalla de login
            this.mainWindow.webContents.send('auth:show-login');

        } catch (error) {
            console.error('Error verificando autenticación:', error.message);
            this.mainWindow.webContents.send('auth:show-login');
        }
    }

    /**
     * Maneja solicitud de código de acceso
     */
    async handleRequestCode(event, email) {
        try {
            console.log(`📧 Solicitando código para: ${email}`);

            // Hacer petición al backend de autenticación
            const response = await fetch('http://localhost:3001/api/auth/request-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email })
            });

            const result = await response.json();

            if (response.ok) {
                // Guardar email para recordar
                this.store.set('lastEmail', email);
                return { success: true, message: result.message };
            } else {
                return { success: false, error: result.error };
            }

        } catch (error) {
            console.error('Error solicitando código:', error.message);
            return { 
                success: false, 
                error: 'Error de conexión. Verifica que el servidor de autenticación esté ejecutándose.' 
            };
        }
    }

    /**
     * Maneja verificación de código
     */
    async handleVerifyCode(event, email, code) {
        try {
            console.log(`🔑 Verificando código para: ${email}`);

            // TODO: Reemplazar URL con la del backend real
            const response = await fetch('http://localhost:3001/api/auth/verify-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, code })
            });

            const result = await response.json();

            if (response.ok) {
                // Guardar token y datos de usuario
                this.isAuthenticated = true;
                this.userToken = result.data.token;
                this.userData = result.data.user;
                
                this.store.set('authToken', result.data.token);
                this.store.set('lastEmail', email);

                return { 
                    success: true, 
                    user: result.data.user,
                    token: result.data.token
                };
            } else {
                return { success: false, error: result.error };
            }

        } catch (error) {
            console.error('Error verificando código:', error.message);
            return { 
                success: false, 
                error: 'Error de conexión con el servidor de autenticación.' 
            };
        }
    }

    /**
     * Valida token con el backend
     */
    async validateToken(token) {
        try {
            // TODO: Reemplazar URL con la del backend real
            const response = await fetch('http://localhost:3001/api/auth/validate-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token })
            });

            return response.ok;

        } catch (error) {
            console.error('Error validando token:', error.message);
            return false;
        }
    }

    /**
     * Maneja logout
     */
    async handleLogout() {
        this.isAuthenticated = false;
        this.userToken = null;
        this.userData = null;
        
        this.store.delete('authToken');
        
        this.mainWindow.webContents.send('auth:logged-out');
    }

    /**
     * Obtiene estado de autenticación
     */
    getAuthStatus() {
        return {
            isAuthenticated: this.isAuthenticated,
            user: this.userData
        };
    }

    /**
     * Verifica estado de Ads Power
     */
    async checkAdsPowerStatus() {
        try {
            const status = await this.adsPowerManager.checkApiStatus();
            return { success: true, status };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Lista perfiles de Ads Power
     */
    async listAdsPowerProfiles() {
        try {
            const profiles = await this.adsPowerManager.listProfiles();
            return { success: true, profiles };
        } catch (error) {
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

    /**
     * Inicia navegación
     */
    async startNavigation(event, config) {
        try {
            if (!this.isAuthenticated) {
                throw new Error('Usuario no autenticado');
            }

            console.log('🚀 Iniciando navegación con configuración:', config);

            const result = await this.navigationController.startMultipleNavigationSessions(
                config.profileIds,
                config.targetCookies
            );

            return { success: true, result };

        } catch (error) {
            console.error('Error iniciando navegación:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Detiene navegación
     */
    async stopNavigation() {
        try {
            await this.navigationController.stopAllSessions();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Obtiene estado de navegación
     */
    getNavigationStatus() {
        try {
            const status = this.navigationController.getGlobalStats();
            return { success: true, status };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

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

    /**
     * Obtiene configuración
     */
    getConfiguration() {
        return this.configManager.getConfig();
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
                defaultPath: `nexos-logs-${new Date().toISOString().split('T')[0]}.txt`,
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
            title: 'Acerca de Nexos Cookies Tool',
            message: 'Nexos Cookies Tool v1.0.0',
            detail: 'Sistema automatizado para calentar contingencias\n© 2025 Todos los derechos reservados.'
        });
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