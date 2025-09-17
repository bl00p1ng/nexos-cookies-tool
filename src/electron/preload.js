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
        onShowLogin: (callback) => ipcRenderer.on('auth:show-login', callback),
        
        // Remover listeners
        removeAuthListeners: () => {
            ipcRenderer.removeAllListeners('auth:authenticated');
            ipcRenderer.removeAllListeners('auth:logged-out');
            ipcRenderer.removeAllListeners('auth:show-login');
        }
    },

    // Ads Power
    adspower: {
        checkStatus: () => ipcRenderer.invoke('adspower:check-status'),
        listProfiles: () => ipcRenderer.invoke('adspower:list-profiles'),
        getProfileInfo: (profileId) => ipcRenderer.invoke('adspower:profile-info', profileId)
    },

    // Navegación
    navigation: {
        start: (config) => ipcRenderer.invoke('navigation:start', config),
        stop: () => ipcRenderer.invoke('navigation:stop'),
        getStatus: () => ipcRenderer.invoke('navigation:get-status'),
        
        // Listeners para eventos de navegación
        onProgressUpdate: (callback) => ipcRenderer.on('navigation:progress', callback),
        onStatusChange: (callback) => ipcRenderer.on('navigation:status-change', callback),
        onError: (callback) => ipcRenderer.on('navigation:error', callback),
        
        // Remover listeners
        removeNavigationListeners: () => {
            ipcRenderer.removeAllListeners('navigation:progress');
            ipcRenderer.removeAllListeners('navigation:status-change');
            ipcRenderer.removeAllListeners('navigation:error');
        }
    },

    // Base de datos
    database: {
        getStats: () => ipcRenderer.invoke('database:get-stats'),
        getSites: (count) => ipcRenderer.invoke('database:get-sites', count)
    },

    // Configuración
    config: {
        get: () => ipcRenderer.invoke('config:get'),
        update: (updates) => ipcRenderer.invoke('config:update', updates)
    },

    // Sistema
    system: {
        showFolder: () => ipcRenderer.invoke('system:show-folder'),
        exportLogs: () => ipcRenderer.invoke('system:export-logs')
    },

    // Utilidades
    utils: {
        isElectron: true,
        platform: process.platform,
        version: process.versions.electron
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

// Prevenir navegación no autorizada
window.addEventListener('DOMContentLoaded', () => {
    // Prevenir navegación con enlaces
    document.addEventListener('click', (event) => {
        const target = event.target.closest('a');
        if (target && target.href && target.href.startsWith('http')) {
            event.preventDefault();
            // Los enlaces externos se manejan en el proceso principal
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