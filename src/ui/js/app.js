/**
 * Maneja eventos de teclado globales del renderer.
 * Extraído como función pura para facilitar testing aislado.
 * @param {KeyboardEvent} event
 * @param {{closeAllModals: Function}} ctx - Contexto inyectado (la app instance).
 */
export function handleGlobalKeydown(event, ctx) {
    if (event.key === 'Escape') {
        ctx.closeAllModals();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();
    }
}

/**
 * Aplicación principal de Cookies Hexzor
 * Maneja la inicialización y coordinación de todos los módulos
 */
class HexzorApp {
    constructor() {
        this.isElectron = window.electronAPI && window.electronAPI.utils.isElectron;
        this.currentUser = null;
        this.isAuthenticated = false;
        
        // Estados de la aplicación
        this.appState = {
            adspower: {
                connected: false,
                profiles: [],
                status: 'checking'
            },
            navigation: {
                running: false,
                sessions: [],
                stats: {
                    totalCookies: 0,
                    totalSites: 0,
                    startTime: null
                }
            },
            database: {
                stats: {},
                sites: []
            }
        };

        // Gestores de módulos
        this.authManager = null;
        this.dashboardManager = null;
        this.navigationManager = null;
        this.toastManager = null;

        // Referencias a elementos DOM
        this.elements = {
            loadingScreen: null,
            authScreen: null,
            dashboardScreen: null
        };
    }

    /**
     * Inicializa la aplicación
     */
    async initialize() {
        try {
            console.log('Inicializando Cookies Hexzor...');

            // Inicializar referencias DOM
            this.initializeElements();

            // Inicializar gestores
            this.initializeManagers();

            // Configurar eventos globales
            this.setupGlobalEvents();

            // Verificar si estamos en Electron
            if (!this.isElectron) {
                this.showError('Esta aplicación debe ejecutarse desde Electron');
                return;
            }

            // Mostrar pantalla de carga por 2 segundos
            await this.delay(2000);

            // Verificar autenticación existente
            await this.checkAuthentication();

            console.log('Aplicación inicializada correctamente');

        } catch (error) {
            console.error('Error inicializando aplicación:', error);
            this.showError('Error inicializando la aplicación: ' + error.message);
        }
    }

    /**
     * Inicializa referencias a elementos DOM
     */
    initializeElements() {
        this.elements = {
            loadingScreen: document.getElementById('loading-screen'),
            authScreen: document.getElementById('auth-screen'),
            dashboardScreen: document.getElementById('dashboard-screen'),
            toastContainer: document.getElementById('toast-container')
        };

        // Verificar que todos los elementos existen
        for (const [key, element] of Object.entries(this.elements)) {
            if (!element) {
                throw new Error(`Elemento requerido no encontrado: ${key}`);
            }
        }
    }

    /**
     * Inicializa los gestores de módulos
     */
    initializeManagers() {
        // Toast Manager para notificaciones
        this.toastManager = new ToastManager(this.elements.toastContainer);

        // Auth Manager
        this.authManager = new AuthManager(this);

        // Dashboard Manager
        this.dashboardManager = new DashboardManager(this);

        // Navigation Manager
        this.navigationManager = new NavigationManager(this);

        // Reports Manager
        this.reportsManager = new ReportsManager(this);
        window.reportsManager = this.reportsManager;
    }

    /**
     * Configura eventos globales de la aplicación
     */
    setupGlobalEvents() {
        // Eventos de teclado globales
        document.addEventListener('keydown', (event) => handleGlobalKeydown(event, this));

        // Prevenir navegación accidental
        window.addEventListener('beforeunload', (event) => {
            if (this.appState.navigation.running) {
                event.preventDefault();
                event.returnValue = 'Hay navegación en progreso. ¿Estás seguro de cerrar?';
                return event.returnValue;
            }
        });

        // Configurar eventos de Electron si está disponible
        if (this.isElectron) {
            this.setupElectronEvents();
        }
    }

    /**
     * Configura eventos específicos de Electron
     */
    setupElectronEvents() {
        // Eventos de autenticación
        window.electronAPI.auth.onAuthenticated((event, data) => {
            console.log('Usuario autenticado:', data);
            this.handleAuthenticationSuccess(data);
        });

        window.electronAPI.auth.onLoggedOut(() => {
            console.log('Usuario desconectado');
            this.handleLogout();
        });

        window.electronAPI.auth.onShowLogin(() => {
            console.log('Mostrar pantalla de login');
            this.showAuthScreen();
        });

        // Eventos de navegación
        window.electronAPI.navigation.onProgressUpdate((event, data) => {
            console.log(`[DEBUG] Evento recibido en UI: navigation:progress`, data);
            this.navigationManager.updateProgress(data);
        });

        window.electronAPI.navigation.onStatusChange((event, data) => {
            console.log(`[DEBUG] Evento recibido en UI: navigation:status-change`, data);
            this.navigationManager.updateStatus(data);
        });

        window.electronAPI.navigation.onError((event, error) => {
            this.showError('Error en navegación: ' + error.message);
        });
    }

    /**
     * Verifica autenticación existente
     */
    async checkAuthentication() {
        try {
            const authStatus = await window.electronAPI.auth.getStatus();
            
            if (authStatus.isAuthenticated && authStatus.user) {
                this.handleAuthenticationSuccess({
                    user: authStatus.user,
                    token: 'existing' // Token existente válido
                });
            } else {
                this.showAuthScreen();
            }

        } catch (error) {
            console.error('Error verificando autenticación:', error);
            this.showAuthScreen();
        }
    }

    /**
     * Maneja autenticación exitosa
     */
    async handleAuthenticationSuccess(data) {
        try {
            this.currentUser = data.user;
            this.isAuthenticated = true;

            // Ocultar pantallas anteriores
            this.hideAllScreens();

            // Mostrar dashboard
            this.showDashboardScreen();

            // Inicializar dashboard
            await this.dashboardManager.initialize();
        } catch (error) {
            console.error('Error manejando autenticación exitosa:', error);
            this.showError('Error inicializando el dashboard');
        }
    }

    /**
     * Maneja logout
     */
    handleLogout() {
        this.currentUser = null;
        this.isAuthenticated = false;
        
        // Limpiar estado de la aplicación
        this.resetAppState();
        
        // Mostrar pantalla de autenticación
        this.showAuthScreen();
        
        this.showInfo('Sesión cerrada correctamente');
    }

    /**
     * Muestra la pantalla de autenticación
     */
    showAuthScreen() {
        this.hideAllScreens();
        this.elements.authScreen.classList.remove('hidden');
        this.authManager.initialize();

        // Inicializar el panel de configuración de auth si existe
        if (window.authSettingsManager) {
            window.authSettingsManager.initialize();
        }
    }

    /**
     * Muestra la pantalla del dashboard
     */
    showDashboardScreen() {
        this.hideAllScreens();
        this.elements.dashboardScreen.classList.remove('hidden');
    }

    /**
     * Oculta todas las pantallas
     */
    hideAllScreens() {
        this.elements.loadingScreen.classList.add('hidden');
        this.elements.authScreen.classList.add('hidden');
        this.elements.dashboardScreen.classList.add('hidden');
    }

    /**
     * Resetea el estado de la aplicación
     */
    resetAppState() {
        this.appState = {
            adspower: {
                connected: false,
                profiles: [],
                status: 'checking'
            },
            navigation: {
                running: false,
                sessions: [],
                stats: {
                    totalCookies: 0,
                    totalSites: 0,
                    startTime: null
                }
            },
            database: {
                stats: {},
                sites: []
            }
        };
    }

    /**
     * Cierra todos los modales abiertos
     */
    closeAllModals() {
        const modals = document.querySelectorAll('.modal-overlay');
        modals.forEach(modal => {
            modal.classList.add('hidden');
        });
    }

    /**
     * Actualiza el estado de la aplicación
     */
    updateState(path, value) {
        const keys = path.split('.');
        let current = this.appState;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
        
        // Emitir evento de cambio de estado
        this.emitStateChange(path, value);
    }

    /**
     * Obtiene valor del estado
     */
    getState(path) {
        const keys = path.split('.');
        let current = this.appState;
        
        for (const key of keys) {
            if (current[key] === undefined) {
                return undefined;
            }
            current = current[key];
        }
        
        return current;
    }

    /**
     * Emite evento de cambio de estado
     */
    emitStateChange(path, value) {
        const event = new CustomEvent('stateChange', {
            detail: { path, value, state: this.appState }
        });
        document.dispatchEvent(event);
    }

    /**
     * Métodos de notificación
     */
    showSuccess(message, title = '') {
        this.toastManager.show(message, 'success', title);
    }

    showError(message, title = '') {
        this.toastManager.show(message, 'error', title);
    }

    showWarning(message, title = '') {
        this.toastManager.show(message, 'warning', title);
    }

    showInfo(message, title = '') {
        this.toastManager.show(message, 'info', title);
    }

    /**
     * Utilidades
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    formatNumber(number) {
        return new Intl.NumberFormat('es-ES').format(number);
    }

    formatDate(date) {
        return new Intl.DateTimeFormat('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(date));
    }

    /**
     * Obtiene información de la plataforma
     */
    getPlatformInfo() {
        if (this.isElectron) {
            return {
                platform: window.electronAPI.utils.platform,
                version: window.electronAPI.utils.version,
                isElectron: true
            };
        }
        
        return {
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            isElectron: false
        };
    }
}

/**
 * Gestor de Notificaciones Toast
 */
class ToastManager {
    constructor(container) {
        this.container = container;
        this.toasts = new Map();
        this.nextId = 1;
    }

    show(message, type = 'info', title = '', duration = 5000) {
        const id = this.nextId++;
        const toast = this.createToast(id, message, type, title);
        
        this.container.appendChild(toast);
        this.toasts.set(id, toast);

        // Mostrar con animación
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });

        // Auto-cerrar después del tiempo especificado
        if (duration > 0) {
            setTimeout(() => {
                this.hide(id);
            }, duration);
        }

        return id;
    }

    createToast(id, message, type, title) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease-out';

        const icons = {
            success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        };

        toast.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <div style="flex-shrink: 0; margin-top: 2px;">
                    ${icons[type] || icons.info}
                </div>
                <div style="flex: 1;">
                    ${title ? `<div class="toast-title">${title}</div>` : ''}
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close" onclick="app.toastManager.hide(${id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        `;

        return toast;
    }

    hide(id) {
        const toast = this.toasts.get(id);
        if (!toast) return;

        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            this.toasts.delete(id);
        }, 300);
    }

    clear() {
        this.toasts.forEach((toast, id) => {
            this.hide(id);
        });
    }
}

// Instancia global de la aplicación
let app = null;

// Inicializar cuando el DOM esté listo (guard para entornos sin DOM, ej. Vitest)
if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', async () => {
    try {
        app = new HexzorApp();
        await app.initialize();
    } catch (error) {
        console.error('Error fatal inicializando aplicación:', error);
        
        // Mostrar error básico si no hay toast manager
        const errorElement = document.createElement('div');
        errorElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #fee2e2;
            border: 1px solid #dc2626;
            color: #dc2626;
            padding: 16px;
            border-radius: 8px;
            max-width: 400px;
            z-index: 9999;
        `;
        errorElement.textContent = `Error fatal: ${error.message}`;
        document.body.appendChild(errorElement);
    }
});

// Exponer app globalmente para debugging
window.app = app;
} // end if (typeof document !== 'undefined')