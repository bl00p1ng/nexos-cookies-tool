const { contextBridge, ipcRenderer } = require('electron');

/**
 * Script de preload para Cookies Hexzor
 * Expone APIs seguras del proceso principal al renderer
 */

// API segura para el renderer
const electronAPI = {
    // Autenticación
    auth: {
        requestCode: (email) => ipcRenderer.invoke('auth:request-code', email),
        verifyCode: (email, code) => ipcRenderer.invoke('auth:verify-code', email, code),
        logout: () => ipcRenderer.invoke('auth:logout'),
        getStatus: () => ipcRenderer.invoke('auth:get-status'),
        
        // Listeners para eventos de autenticación
        onAuthenticated: (callback) => ipcRenderer.on('auth:authenticated', callback),
        onLoggedOut: (callback) => ipcRenderer.on('auth:logged-out', callback),
        onShowLogin: (callback) => ipcRenderer.on('auth:show-login', callback)
    },

    // Ads Power
    adspower: {
        checkStatus: () => ipcRenderer.invoke('adspower:check-status')
    },

    // Navegación
    navigation: {
        start: (config) => ipcRenderer.invoke('navigation:start', config),
        stop: () => ipcRenderer.invoke('navigation:stop'),
        getStatus: () => ipcRenderer.invoke('navigation:get-status'),
        getActiveSessions: () => ipcRenderer.invoke('navigation:get-active-sessions'),
        
        // Listeners para eventos de navegación
        onProgressUpdate: (callback) => ipcRenderer.on('navigation:progress', callback),
        onStatusChange: (callback) => ipcRenderer.on('navigation:status-change', callback),
        onError: (callback) => ipcRenderer.on('navigation:error', callback),
        onSyncRequired: (callback) => ipcRenderer.on('navigation:sync-required', callback)
    },

    // Base de datos
    database: {
        getStats: () => ipcRenderer.invoke('database:get-stats'),
        getSites: (count) => ipcRenderer.invoke('database:get-sites', count)
    },

    // Configuración
    config: {
        get: () => ipcRenderer.invoke('config:get'),
        update: (updates) => ipcRenderer.invoke('config:update', updates),
        getAdsPowerUrl: () => ipcRenderer.invoke('config:get-adspower-url'),
        setAdsPowerUrl: (url) => ipcRenderer.invoke('config:set-adspower-url', url),
        getBackendUrl: () => ipcRenderer.invoke('config:get-backend-url'),
        setBackendUrl: (url) => ipcRenderer.invoke('config:set-backend-url', url),
        getDefaults: () => ipcRenderer.invoke('config:get-defaults')
    },

    // Sistema
    system: {
        getVersion: () => ipcRenderer.invoke('system:get-version')
    },

    // Utilidades
    utils: {
        isElectron: true,
        platform: process.platform,
        version: process.versions.electron
    },

    // Reportes
    reports: {
        get: (options) => ipcRenderer.invoke('reports:get', options),
        summary: (filters) => ipcRenderer.invoke('reports:summary', filters)
    }
};

// Exponer API al contexto del renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Exponer API del portapapeles al renderer
contextBridge.exposeInMainWorld('clipboard', {
    writeText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
    readText: () => ipcRenderer.invoke('clipboard:read-text')
});

// Logging seguro para desarrollo
if (process.env.NODE_ENV === 'development') {
    contextBridge.exposeInMainWorld('electronLogger', {
        log: (...args) => console.log(...args),
        error: (...args) => console.error(...args),
        warn: (...args) => console.warn(...args),
        info: (...args) => console.info(...args)
    });
}

// Prevenir navegación no autorizada y abrir enlaces externos en el navegador del sistema
window.addEventListener('DOMContentLoaded', () => {
    // Cancela la navegación dentro de la ventana de Electron y delega al main
    // process para que el OS abra la URL en el navegador por defecto.
    document.addEventListener('click', (event) => {
        const target = event.target.closest('a');
        if (target && target.href && target.href.startsWith('http')) {
            event.preventDefault();
            ipcRenderer.invoke('shell:open-external', target.href);
        }
    });

    // Prevenir drag and drop de archivos
    document.addEventListener('dragover', (event) => {
        event.preventDefault();
    });

    document.addEventListener('drop', (event) => {
        event.preventDefault();
    });
});