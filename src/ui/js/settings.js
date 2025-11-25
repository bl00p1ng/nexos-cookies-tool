/**
 * Módulo de configuración
 * Maneja la UI de configuración de la aplicación
 */

class SettingsManager {
    constructor() {
        // AdsPower URL elements
        this.adsPowerUrlInput = null;
        this.adsPowerUrlForm = null;
        this.adsPowerSaveButton = null;
        this.adsPowerResetButton = null;
        this.adsPowerStatusMessage = null;
        this.adsPowerDefaultUrl = 'http://local.adspower.com:50325';

        // Backend URL elements
        this.backendUrlInput = null;
        this.backendUrlForm = null;
        this.backendSaveButton = null;
        this.backendResetButton = null;
        this.backendStatusMessage = null;
        this.backendDefaultUrl = 'https://38c69d16ca36.ngrok-free.app/';

        this.initialized = false;
    }

    /**
     * Inicializa el módulo de configuración
     */
    async initialize() {
        if (this.initialized) return;

        console.log('🔧 Inicializando SettingsManager...');

        // Obtener referencias a elementos del DOM - AdsPower
        this.adsPowerUrlInput = document.getElementById('adspower-url');
        this.adsPowerUrlForm = document.getElementById('adspower-url-form');
        this.adsPowerSaveButton = document.getElementById('save-adspower-url-btn');
        this.adsPowerResetButton = document.getElementById('reset-adspower-url');
        this.adsPowerStatusMessage = document.getElementById('adspower-url-status');

        // Obtener referencias a elementos del DOM - Backend
        this.backendUrlInput = document.getElementById('backend-url');
        this.backendUrlForm = document.getElementById('backend-url-form');
        this.backendSaveButton = document.getElementById('save-backend-url-btn');
        this.backendResetButton = document.getElementById('reset-backend-url');
        this.backendStatusMessage = document.getElementById('backend-url-status');

        // Configurar event listeners
        this.setupEventListeners();

        // Cargar URLs actuales
        await this.loadCurrentUrls();

        this.initialized = true;
        console.log('✅ SettingsManager inicializado');
    }

    /**
     * Configura los event listeners
     */
    setupEventListeners() {
        // AdsPower URL - Submit del formulario
        this.adsPowerUrlForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAdsPowerUrl();
        });

        // AdsPower URL - Botón de reset
        this.adsPowerResetButton?.addEventListener('click', () => {
            this.resetAdsPowerToDefault();
        });

        // AdsPower URL - Validación en tiempo real
        this.adsPowerUrlInput?.addEventListener('input', () => {
            this.clearAdsPowerStatus();
        });

        // Backend URL - Submit del formulario
        this.backendUrlForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveBackendUrl();
        });

        // Backend URL - Botón de reset
        this.backendResetButton?.addEventListener('click', () => {
            this.resetBackendToDefault();
        });

        // Backend URL - Validación en tiempo real
        this.backendUrlInput?.addEventListener('input', () => {
            this.clearBackendStatus();
        });
    }

    /**
     * Carga las URLs actuales desde el store
     */
    async loadCurrentUrls() {
        await Promise.all([
            this.loadAdsPowerUrl(),
            this.loadBackendUrl()
        ]);
    }

    /**
     * Carga la URL de AdsPower desde el store
     */
    async loadAdsPowerUrl() {
        try {
            const result = await window.electronAPI.config.getAdsPowerUrl();

            if (result.success) {
                this.adsPowerUrlInput.value = result.url;
                console.log('✅ URL de AdsPower cargada:', result.url);
            } else {
                console.error('❌ Error cargando URL de AdsPower:', result.error);
                this.showAdsPowerStatus('Error cargando configuración', 'error');
            }
        } catch (error) {
            console.error('❌ Error cargando URL de AdsPower:', error);
            this.showAdsPowerStatus('Error cargando configuración', 'error');
        }
    }

    /**
     * Carga la URL del Backend desde el store
     */
    async loadBackendUrl() {
        try {
            const result = await window.electronAPI.config.getBackendUrl();

            if (result.success) {
                this.backendUrlInput.value = result.url;
                console.log('✅ URL del Backend cargada:', result.url);
            } else {
                console.error('❌ Error cargando URL del Backend:', result.error);
                this.showBackendStatus('Error cargando configuración', 'error');
            }
        } catch (error) {
            console.error('❌ Error cargando URL del Backend:', error);
            this.showBackendStatus('Error cargando configuración', 'error');
        }
    }

    /**
     * Guarda la URL de AdsPower
     */
    async saveAdsPowerUrl() {
        const newUrl = this.adsPowerUrlInput.value.trim();

        // Validación básica
        if (!newUrl) {
            this.showAdsPowerStatus('La URL no puede estar vacía', 'error');
            return;
        }

        // Validar formato de URL
        try {
            new URL(newUrl);
        } catch (error) {
            this.showAdsPowerStatus('URL inválida. Debe ser una URL completa (ej: http://local.adspower.com:50325)', 'error');
            return;
        }

        // Mostrar spinner
        this.setAdsPowerLoading(true);
        this.clearAdsPowerStatus();

        try {
            const result = await window.electronAPI.config.setAdsPowerUrl(newUrl);

            if (result.success) {
                this.showAdsPowerStatus('URL actualizada correctamente. AdsPower Manager reiniciado.', 'success');
                this.adsPowerUrlInput.value = result.url;
                console.log('✅ URL de AdsPower actualizada:', result.url);
            } else {
                this.showAdsPowerStatus(`Error: ${result.error}`, 'error');
                console.error('❌ Error guardando URL de AdsPower:', result.error);
            }
        } catch (error) {
            this.showAdsPowerStatus('Error al guardar la configuración', 'error');
            console.error('❌ Error guardando URL de AdsPower:', error);
        } finally {
            this.setAdsPowerLoading(false);
        }
    }

    /**
     * Guarda la URL del Backend
     */
    async saveBackendUrl() {
        const newUrl = this.backendUrlInput.value.trim();

        // Validación básica
        if (!newUrl) {
            this.showBackendStatus('La URL no puede estar vacía', 'error');
            return;
        }

        // Validar formato de URL
        try {
            new URL(newUrl);
        } catch (error) {
            this.showBackendStatus('URL inválida. Debe ser una URL completa (ej: https://example.com/)', 'error');
            return;
        }

        // Mostrar spinner
        this.setBackendLoading(true);
        this.clearBackendStatus();

        try {
            const result = await window.electronAPI.config.setBackendUrl(newUrl);

            if (result.success) {
                this.showBackendStatus('URL actualizada correctamente. AuthService reiniciado.', 'success');
                this.backendUrlInput.value = result.url;
                console.log('✅ URL del Backend actualizada:', result.url);
            } else {
                this.showBackendStatus(`Error: ${result.error}`, 'error');
                console.error('❌ Error guardando URL del Backend:', result.error);
            }
        } catch (error) {
            this.showBackendStatus('Error al guardar la configuración', 'error');
            console.error('❌ Error guardando URL del Backend:', error);
        } finally {
            this.setBackendLoading(false);
        }
    }

    /**
     * Resetea la URL de AdsPower al valor por defecto
     */
    resetAdsPowerToDefault() {
        this.adsPowerUrlInput.value = this.adsPowerDefaultUrl;
        this.clearAdsPowerStatus();
        this.showAdsPowerStatus('URL restablecida al valor por defecto. Haz clic en "Guardar URL" para aplicar.', 'info');
    }

    /**
     * Resetea la URL del Backend al valor por defecto
     */
    resetBackendToDefault() {
        this.backendUrlInput.value = this.backendDefaultUrl;
        this.clearBackendStatus();
        this.showBackendStatus('URL restablecida al valor por defecto. Haz clic en "Guardar URL" para aplicar.', 'info');
    }

    /**
     * Muestra un mensaje de estado para AdsPower
     * @param {string} message - Mensaje a mostrar
     * @param {string} type - Tipo: 'success', 'error', 'info'
     */
    showAdsPowerStatus(message, type = 'info') {
        if (!this.adsPowerStatusMessage) return;

        this.adsPowerStatusMessage.textContent = message;
        this.adsPowerStatusMessage.className = `status-message ${type}`;
        this.adsPowerStatusMessage.classList.remove('hidden');
    }

    /**
     * Limpia el mensaje de estado de AdsPower
     */
    clearAdsPowerStatus() {
        if (!this.adsPowerStatusMessage) return;

        this.adsPowerStatusMessage.textContent = '';
        this.adsPowerStatusMessage.classList.add('hidden');
    }

    /**
     * Activa/desactiva el estado de carga para AdsPower
     * @param {boolean} loading - True para mostrar spinner
     */
    setAdsPowerLoading(loading) {
        if (!this.adsPowerSaveButton) return;

        const btnText = this.adsPowerSaveButton.querySelector('.btn-text');
        const btnSpinner = this.adsPowerSaveButton.querySelector('.btn-spinner');

        if (loading) {
            this.adsPowerSaveButton.disabled = true;
            btnText?.classList.add('hidden');
            btnSpinner?.classList.remove('hidden');
        } else {
            this.adsPowerSaveButton.disabled = false;
            btnText?.classList.remove('hidden');
            btnSpinner?.classList.add('hidden');
        }
    }

    /**
     * Muestra un mensaje de estado para Backend
     * @param {string} message - Mensaje a mostrar
     * @param {string} type - Tipo: 'success', 'error', 'info'
     */
    showBackendStatus(message, type = 'info') {
        if (!this.backendStatusMessage) return;

        this.backendStatusMessage.textContent = message;
        this.backendStatusMessage.className = `status-message ${type}`;
        this.backendStatusMessage.classList.remove('hidden');
    }

    /**
     * Limpia el mensaje de estado del Backend
     */
    clearBackendStatus() {
        if (!this.backendStatusMessage) return;

        this.backendStatusMessage.textContent = '';
        this.backendStatusMessage.classList.add('hidden');
    }

    /**
     * Activa/desactiva el estado de carga para Backend
     * @param {boolean} loading - True para mostrar spinner
     */
    setBackendLoading(loading) {
        if (!this.backendSaveButton) return;

        const btnText = this.backendSaveButton.querySelector('.btn-text');
        const btnSpinner = this.backendSaveButton.querySelector('.btn-spinner');

        if (loading) {
            this.backendSaveButton.disabled = true;
            btnText?.classList.add('hidden');
            btnSpinner?.classList.remove('hidden');
        } else {
            this.backendSaveButton.disabled = false;
            btnText?.classList.remove('hidden');
            btnSpinner?.classList.add('hidden');
        }
    }
}

// Exportar instancia global
window.settingsManager = new SettingsManager();
