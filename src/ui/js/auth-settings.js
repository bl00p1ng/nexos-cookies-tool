/**
 * Gestor de configuración en la pantalla de autenticación
 * Maneja el panel de configuración del backend URL antes del login
 */
class AuthSettingsManager {
    constructor() {
        this.settingsBtn = null;
        this.settingsPanel = null;
        this.closeBtn = null;
        this.backendUrlInput = null;
        this.backendUrlForm = null;
        this.saveButton = null;
        this.resetButton = null;
        this.statusMessage = null;
        this.defaultUrl = 'https://38c69d16ca36.ngrok-free.app/';
        this.initialized = false;
    }

    /**
     * Inicializa el gestor de configuración
     */
    async initialize() {
        if (this.initialized) return;

        console.log('🔧 Inicializando AuthSettingsManager...');

        // Obtener referencias a elementos del DOM
        this.settingsBtn = document.getElementById('auth-settings-btn');
        this.settingsPanel = document.getElementById('auth-settings-panel');
        this.closeBtn = document.getElementById('close-settings-btn');
        this.backendUrlInput = document.getElementById('auth-backend-url');
        this.backendUrlForm = document.getElementById('auth-backend-url-form');
        this.saveButton = document.getElementById('auth-save-backend-url-btn');
        this.resetButton = document.getElementById('auth-reset-backend-url');
        this.statusMessage = document.getElementById('auth-backend-url-status');

        // Configurar event listeners
        this.setupEventListeners();

        // Cargar URL actual
        await this.loadCurrentUrl();

        this.initialized = true;
        console.log('✅ AuthSettingsManager inicializado');
    }

    /**
     * Configura los event listeners
     */
    setupEventListeners() {
        // Botón de abrir panel
        this.settingsBtn?.addEventListener('click', () => {
            this.openPanel();
        });

        // Botón de cerrar panel
        this.closeBtn?.addEventListener('click', () => {
            this.closePanel();
        });

        // Click fuera del panel para cerrar
        this.settingsPanel?.addEventListener('click', (e) => {
            if (e.target === this.settingsPanel) {
                this.closePanel();
            }
        });

        // Submit del formulario
        this.backendUrlForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveUrl();
        });

        // Botón de reset
        this.resetButton?.addEventListener('click', () => {
            this.resetToDefault();
        });

        // Validación en tiempo real
        this.backendUrlInput?.addEventListener('input', () => {
            this.clearStatus();
        });

        // Cerrar con tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.settingsPanel?.classList.contains('visible')) {
                this.closePanel();
            }
        });
    }

    /**
     * Abre el panel de configuración
     */
    openPanel() {
        this.settingsPanel?.classList.remove('hidden');
        // Pequeño delay para la animación
        setTimeout(() => {
            this.settingsPanel?.classList.add('visible');
        }, 10);
    }

    /**
     * Cierra el panel de configuración
     */
    closePanel() {
        this.settingsPanel?.classList.remove('visible');
        // Esperar a que termine la animación antes de ocultar
        setTimeout(() => {
            this.settingsPanel?.classList.add('hidden');
        }, 300);
    }

    /**
     * Carga la URL actual desde el store
     */
    async loadCurrentUrl() {
        try {
            const result = await window.electronAPI.config.getBackendUrl();

            if (result.success) {
                this.backendUrlInput.value = result.url;
                console.log('✅ URL del Backend cargada:', result.url);
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
        const newUrl = this.backendUrlInput.value.trim();

        // Validación básica
        if (!newUrl) {
            this.showStatus('La URL no puede estar vacía', 'error');
            return;
        }

        // Validar formato de URL
        try {
            new URL(newUrl);
        } catch (error) {
            this.showStatus('URL inválida. Debe ser una URL completa (ej: https://example.com/)', 'error');
            return;
        }

        // Mostrar spinner
        this.setLoading(true);
        this.clearStatus();

        try {
            const result = await window.electronAPI.config.setBackendUrl(newUrl);

            if (result.success) {
                this.showStatus('URL actualizada correctamente. Reinicia la app para aplicar cambios.', 'success');
                // Actualizar el input con la URL limpia
                this.backendUrlInput.value = result.url;
                console.log('✅ URL actualizada:', result.url);

                // Cerrar el panel después de 2 segundos
                setTimeout(() => {
                    this.closePanel();
                }, 2000);
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
        this.backendUrlInput.value = this.defaultUrl;
        this.clearStatus();
        this.showStatus('URL restablecida al valor por defecto. Haz clic en "Guardar" para aplicar.', 'info');
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
window.authSettingsManager = new AuthSettingsManager();
