import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import path from 'path';
import Store from 'electron-store';
import dotenv from 'dotenv';

import ConfigStore from '../core/config/ConfigStore.js';
import DatabaseManager from '../core/database/DatabaseManager.js';
import AdsPowerManager from '../core/adspower/AdsPowerManager.js';
import NavigationController from '../core/navigation/NavigationController.js';
import { AuthService } from '../core/auth/AuthService.js';
import { createLogger, attachFileTransport } from '../core/utils/Logger.js';
import { registerAllIpcHandlers } from './ipc/index.js';
import { createApplicationMenu } from './menu.js';
import { setupAutoUpdater } from './autoUpdater.js';
import { migrateLegacyConfig } from './configMigration.js';
import {
    checkExistingAuth,
    clearStoredAuth,
    handleMenuLogout
} from './authBootstrap.js';
import { DEFAULT_APP_CONFIG } from '../core/config/defaults.js';

const log = createLogger('ElectronApp');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Leer versión desde package.json usando createRequire
const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');
const APP_VERSION = packageJson.version;

/**
 * Bootstrap de Electron para Cookies Hexzor.
 *
 * Responsabilidades:
 *   - Crear la BrowserWindow, el menú y el auto-updater.
 *   - Construir los servicios del core (DB, AdsPower, NavigationController, Auth).
 *   - Persistir configuración y sesión vía electron-store.
 *   - Migrar configuraciones de versiones viejas (config.json, claves top-level).
 *   - Delegar TODA la lógica de IPC a los routers de src/electron/ipc/.
 *
 * Lo que NO hace acá:
 *   - Manejar IPC requests: vive en src/electron/ipc/{auth,navigation,...}.js.
 *   - Lógica de negocio: vive en src/core/.
 */
class ElectronApp {
    constructor() {
        this.mainWindow = null;
        this.authBackendUrl = null;

        // Estado de autenticación compartido con el router de auth.
        // Los handlers IPC leen/escriben acá, igual que checkExistingAuth().
        this.authState = {
            isAuthenticated: false,
            userToken: null,
            userData: null
        };

        // Cargar variables de entorno
        dotenv.config();

        // Store para persistir configuración y autenticación
        this.store = new Store({
            schema: {
                authToken: { type: 'string' },
                lastEmail: { type: 'string' },
                subscriptionEnd: { type: 'string' },
                customerName: { type: 'string' },
                customerId: { type: 'string' },
                device_fingerprint: { type: 'string' },
                appConfig: {
                    type: 'object',
                    default: DEFAULT_APP_CONFIG
                },
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

        // Contenedor de servicios mutable que los routers IPC leen por
        // referencia. Cuando un handler de config recrea AdsPowerManager
        // o AuthService, asigna acá y todos los routers ven la instancia
        // nueva en su próxima invocación.
        this.services = {
            store: this.store,
            configStore: new ConfigStore(this.store),
            databaseManager: null,
            adsPowerManager: null,
            navigationController: null,
            authService: null
        };
    }

    // Atajos retrocompatibles para el código de bootstrap.
    get configStore() { return this.services.configStore; }
    get databaseManager() { return this.services.databaseManager; }
    set databaseManager(v) { this.services.databaseManager = v; }
    get adsPowerManager() { return this.services.adsPowerManager; }
    set adsPowerManager(v) { this.services.adsPowerManager = v; }
    get navigationController() { return this.services.navigationController; }
    set navigationController(v) { this.services.navigationController = v; }
    get authService() { return this.services.authService; }
    set authService(v) { this.services.authService = v; }

    async initialize() {
        try {
            await this._attachLogFile();

            log.info('Iniciando Cookies Hexzor');

            await migrateLegacyConfig({
                store: this.store,
                configStore: this.configStore
            });
            this.configStore.purgeLegacyBackendUrl();

            this.authBackendUrl = this.configStore.getSection('auth').backendUrl;
            log.info('Usando URL del backend', { url: this.authBackendUrl || '(no configurada)' });

            if (!this.authBackendUrl) {
                throw new Error(
                    'La URL del backend de autenticación no está configurada. ' +
                    'Configurala desde Ajustes o vía la variable de entorno AUTH_BACKEND_URL.'
                );
            }

            this.authService = new AuthService(this.authBackendUrl, this.store);
            log.info('AuthService inicializado');

            this.setupAppEvents();
            this.setupIpcHandlers();
            await this.initializeCoreServices();

            log.info('Aplicación inicializada correctamente');

        } catch (error) {
            log.error('Error inicializando aplicación', error);
            this.showErrorDialog('Error de Inicialización', error.message);
        }
    }

    /**
     * Habilita el transporte a archivo del logger. En dev (app no empacada)
     * no escribe a archivo — solo stdout.
     */
    async _attachLogFile() {
        if (!app || !app.isPackaged) return;
        try {
            const day = new Date().toISOString().slice(0, 10);
            const logPath = path.join(app.getPath('userData'), 'logs', `app-${day}.log`);
            this.logFileStream = await attachFileTransport(logPath);
            log.info('Logs persistiendo en archivo', { path: logPath });
        } catch (error) {
            log.warn('No se pudo abrir archivo de logs', { error: error.message });
        }
    }

    setupAppEvents() {
        app.whenReady().then(() => {
            this.createMainWindow();
            createApplicationMenu({
                onLogout: () => handleMenuLogout(this._authDeps()),
                onAbout: () => this.showAboutDialog()
            });
            this.autoUpdater = setupAutoUpdater({
                getMainWindow: () => this.mainWindow
            });
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createMainWindow();
            }
        });

        app.on('before-quit', async () => {
            await this.cleanup();
        });
    }

    createMainWindow() {
        const bounds = this.store.get('windowBounds', {
            width: 1200,
            height: 800,
            x: undefined,
            y: undefined
        });

        this.mainWindow = new BrowserWindow({
            ...bounds,
            minWidth: 800,
            minHeight: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: join(__dirname, 'preload.js'),
                webSecurity: true
            },
            titleBarStyle: 'default',
            show: false
        });

        this.mainWindow.loadFile(join(__dirname, '../ui/index.html'));

        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
            checkExistingAuth(this._authDeps());
        });

        this.mainWindow.on('close', () => {
            const b = this.mainWindow.getBounds();
            this.store.set('windowBounds', b);
        });

        this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith('http://') || url.startsWith('https://')) {
                shell.openExternal(url);
            }
            return { action: 'deny' };
        });

        if (process.env.NODE_ENV === 'development') {
            this.mainWindow.webContents.openDevTools();
        }
    }

    /**
     * Registra todos los handlers IPC delegando en los routers por dominio.
     * Los routers leen `this.services` por referencia, así que cualquier
     * cambio runtime (ej. setAdsPowerUrl recrea adsPowerManager) los
     * propaga automáticamente sin necesidad de re-registrar.
     */
    setupIpcHandlers() {
        registerAllIpcHandlers(ipcMain, {
            services: this.services,
            authState: this.authState,
            appVersion: APP_VERSION,
            shell,
            getMainWindow: () => this.mainWindow,
            clearStoredAuth: () => clearStoredAuth({
                store: this.store,
                authState: this.authState
            })
        });
    }

    /**
     * Bundle común que necesitan los helpers de authBootstrap.
     * Centralizado para evitar repetir la misma forma en 3 call sites.
     */
    _authDeps() {
        return {
            store: this.store,
            authState: this.authState,
            services: this.services,
            getMainWindow: () => this.mainWindow
        };
    }

    async initializeCoreServices() {
        try {
            this.databaseManager = new DatabaseManager();
            await this.databaseManager.initialize();

            const adsPowerBaseUrl = this.configStore.getAdsPowerUrl();
            log.info('Usando URL de AdsPower', { url: adsPowerBaseUrl });

            this.adsPowerManager = new AdsPowerManager(this.configStore, adsPowerBaseUrl);
            this.navigationController = new NavigationController(
                this.databaseManager,
                this.configStore,
                this.adsPowerManager
            );

            log.info('Servicios del core inicializados');
        } catch (error) {
            log.error('Error inicializando servicios', error);
            throw error;
        }
    }

    showErrorDialog(title, message) {
        dialog.showErrorBox(title, message);
    }

    showAboutDialog() {
        dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'Acerca de Cookies Hexzor',
            message: `Cookies Hexzor v${APP_VERSION}`,
            detail: 'Sistema automatizado para calentar contingencias\n© 2025 Todos los derechos reservados.'
        });
    }

    async cleanup() {
        try {
            log.info('Limpiando recursos');

            if (this.autoUpdater) {
                this.autoUpdater.stop();
                this.autoUpdater = null;
            }

            if (this.navigationController) {
                await this.navigationController.stopAllSessions();
            }

            if (this.adsPowerManager) {
                await this.adsPowerManager.cleanup();
            }

            if (this.databaseManager) {
                await this.databaseManager.close();
            }

            log.info('Limpieza completada');

            // Cerrar el archivo de logs al final para que las líneas previas
            // alcancen el disco antes de soltar el file descriptor.
            if (this.logFileStream) {
                this.logFileStream.end();
                this.logFileStream = null;
            }
        } catch (error) {
            log.error('Error en limpieza', error);
        }
    }
}

const electronApp = new ElectronApp();

// Prevenir creación de ventanas adicionales para URLs
app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
        shell.openExternal(navigationUrl);
    });
});

app.whenReady().then(() => {
    electronApp.initialize();
});
