/**
 * Módulo de configuración
 * Maneja la UI de configuración de la aplicación
 */

class SettingsManager {
    constructor() {
        this.adsPowerUrlInput = null;
        this.adsPowerUrlForm = null;
        this.saveButton = null;
        this.resetButton = null;
        this.statusMessage = null;
        this.defaultUrl = 'http://local.adspower.com:50325';
        this.initialized = false;
    }

    /**
     * Inicializa el módulo de configuración
     */
    async initialize() {
        if (this.initialized) return;

        console.log('🔧 Inicializando SettingsManager...');

        // Obtener referencias a elementos del DOM
        this.adsPowerUrlInput = document.getElementById('adspower-url');
        this.adsPowerUrlForm = document.getElementById('adspower-url-form');
        this.saveButton = document.getElementById('save-adspower-url-btn');
        this.resetButton = document.getElementById('reset-adspower-url');
        this.statusMessage = document.getElementById('adspower-url-status');

        // Configurar event listeners
        this.setupEventListeners();

        // Cargar URL actual
        await this.loadCurrentUrl();

        this.initialized = true;
        console.log('✅ SettingsManager inicializado');
    }

    /**
     * Configura los event listeners
     */
    setupEventListeners() {
        // Submit del formulario
        this.adsPowerUrlForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveUrl();
        });

        // Botón de reset
        this.resetButton?.addEventListener('click', () => {
            this.resetToDefault();
        });

        // Validación en tiempo real
        this.adsPowerUrlInput?.addEventListener('input', () => {
            this.clearStatus();
        });
    }

    /**
     * Carga la URL actual desde el store
     */
    async loadCurrentUrl() {
        try {
            const result = await window.electronAPI.config.getAdsPowerUrl();

            if (result.success) {
                this.adsPowerUrlInput.value = result.url;
                console.log('✅ URL actual cargada:', result.url);
            } else {
                console.error('❌ Error cargando URL:', result.error);
                this.showStatus('Error cargando configuración', 'error');
            }
        } catch (error) {
            console.error('❌ Error cargando URL:', error);
            this.showStatus('Error cargando configuración', 'error');
        }
    }

    /**
     * Guarda la nueva URL
     */
    async saveUrl() {
        const newUrl = this.adsPowerUrlInput.value.trim();

        // Validación básica
        if (!newUrl) {
            this.showStatus('La URL no puede estar vacía', 'error');
            return;
        }

        // Validar formato de URL
        try {
            new URL(newUrl);
        } catch (error) {
            this.showStatus('URL inválida. Debe ser una URL completa (ej: http://local.adspower.com:50325)', 'error');
            return;
        }

        // Mostrar spinner
        this.setLoading(true);
        this.clearStatus();

        try {
            const result = await window.electronAPI.config.setAdsPowerUrl(newUrl);

            if (result.success) {
                this.showStatus('URL actualizada correctamente. AdsPower Manager reiniciado.', 'success');
                // Actualizar el input con la URL limpia
                this.adsPowerUrlInput.value = result.url;
                console.log('✅ URL actualizada:', result.url);
            } else {
                this.showStatus(`Error: ${result.error}`, 'error');
                console.error('❌ Error guardando URL:', result.error);
            }
        } catch (error) {
            this.showStatus('Error al guardar la configuración', 'error');
            console.error('❌ Error guardando URL:', error);
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Resetea la URL al valor por defecto
     */
    resetToDefault() {
        this.adsPowerUrlInput.value = this.defaultUrl;
        this.clearStatus();
        this.showStatus('URL restablecida al valor por defecto. Haz clic en "Guardar URL" para aplicar.', 'info');
    }

    /**
     * Muestra un mensaje de estado
     * @param {string} message - Mensaje a mostrar
     * @param {string} type - Tipo: 'success', 'error', 'info'
     */
    showStatus(message, type = 'info') {
        if (!this.statusMessage) return;

        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message ${type}`;
        this.statusMessage.classList.remove('hidden');
    }

    /**
     * Limpia el mensaje de estado
     */
    clearStatus() {
        if (!this.statusMessage) return;

        this.statusMessage.textContent = '';
        this.statusMessage.classList.add('hidden');
    }

    /**
     * Activa/desactiva el estado de carga
     * @param {boolean} loading - True para mostrar spinner
     */
    setLoading(loading) {
        if (!this.saveButton) return;

        const btnText = this.saveButton.querySelector('.btn-text');
        const btnSpinner = this.saveButton.querySelector('.btn-spinner');

        if (loading) {
            this.saveButton.disabled = true;
            btnText?.classList.add('hidden');
            btnSpinner?.classList.remove('hidden');
        } else {
            this.saveButton.disabled = false;
            btnText?.classList.remove('hidden');
            btnSpinner?.classList.add('hidden');
        }
    }
}

// Exportar instancia global
window.settingsManager = new SettingsManager();
