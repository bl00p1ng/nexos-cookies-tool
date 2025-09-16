/**
 * Gestor de Autenticación para Cookies Hexzor
 * Maneja el flujo de login con email y código de verificación
 */
class AuthManager {
    constructor(app) {
        this.app = app;
        this.currentStep = 'email'; // 'email', 'code', 'success'
        this.currentEmail = '';
        this.resendTimer = null;
        this.resendCountdown = 60;

        // Referencias a elementos DOM
        this.elements = {
            emailForm: null,
            codeForm: null,
            authSuccess: null,
            emailInput: null,
            codeInput: null,
            emailError: null,
            codeError: null,
            requestCodeBtn: null,
            verifyCodeBtn: null,
            backToEmailBtn: null,
            resendCodeBtn: null,
            resendTimer: null,
            welcomeMessage: null
        };
    }

    /**
     * Inicializa el gestor de autenticación
     */
    initialize() {
        this.initializeElements();
        this.setupEventListeners();
        this.showEmailForm();
        this.loadSavedEmail();
    }

    /**
     * Inicializa referencias a elementos DOM
     */
    initializeElements() {
        this.elements = {
            emailForm: document.getElementById('email-form'),
            codeForm: document.getElementById('code-form'),
            authSuccess: document.getElementById('auth-success'),
            emailInput: document.getElementById('email'),
            codeInput: document.getElementById('verification-code'),
            emailError: document.getElementById('email-error'),
            codeError: document.getElementById('code-error'),
            requestCodeBtn: document.getElementById('request-code-btn'),
            verifyCodeBtn: document.getElementById('verify-code-btn'),
            backToEmailBtn: document.getElementById('back-to-email'),
            resendCodeBtn: document.getElementById('resend-code'),
            resendTimer: document.getElementById('resend-timer'),
            welcomeMessage: document.getElementById('welcome-message')
        };

        // Verificar elementos críticos
        const required = ['emailForm', 'codeForm', 'emailInput', 'codeInput'];
        for (const key of required) {
            if (!this.elements[key]) {
                throw new Error(`Elemento de autenticación requerido no encontrado: ${key}`);
            }
        }
    }

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Formulario de email
        this.elements.emailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleEmailSubmit();
        });

        // Formulario de código
        this.elements.codeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCodeSubmit();
        });

        // Botón volver al email
        if (this.elements.backToEmailBtn) {
            this.elements.backToEmailBtn.addEventListener('click', () => {
                this.showEmailForm();
            });
        }

        // Botón reenviar código
        if (this.elements.resendCodeBtn) {
            this.elements.resendCodeBtn.addEventListener('click', () => {
                this.handleResendCode();
            });
        }

        // Auto-formateo del código de verificación
        this.elements.codeInput.addEventListener('input', (e) => {
            this.formatVerificationCode(e.target);
        });

        // Validación en tiempo real del email
        this.elements.emailInput.addEventListener('input', () => {
            this.clearError('email');
        });

        // Validación en tiempo real del código
        this.elements.codeInput.addEventListener('input', () => {
            this.clearError('code');
        });

        // Enter en código pasa al siguiente campo o submit
        this.elements.codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.handleCodeSubmit();
            }
        });
    }

    /**
     * Carga email guardado del localStorage de Electron
     */
    loadSavedEmail() {
        // En Electron, el email se guarda automáticamente por el proceso principal
        // Solo configuramos placeholder si no hay valor
        if (!this.elements.emailInput.value) {
            this.elements.emailInput.focus();
        }
    }

    /**
     * Maneja envío del formulario de email
     */
    async handleEmailSubmit() {
        const email = this.elements.emailInput.value.trim();
        
        if (!this.validateEmail(email)) {
            this.showError('email', 'Por favor ingresa un email válido');
            return;
        }

        this.currentEmail = email;
        this.setButtonLoading(this.elements.requestCodeBtn, true);
        this.clearError('email');

        try {
            const result = await window.electronAPI.auth.requestCode(email);
            
            if (result.success) {
                this.showCodeForm();
                this.app.showSuccess('Código enviado a tu email');
                this.startResendTimer();
            } else {
                this.showError('email', result.error || 'Error solicitando código');
            }

        } catch (error) {
            console.error('Error solicitando código:', error);
            this.showError('email', 'Error de conexión. Verifica tu internet y que el servidor esté ejecutándose.');
            
        } finally {
            this.setButtonLoading(this.elements.requestCodeBtn, false);
        }
    }

    /**
     * Maneja envío del formulario de código
     */
    async handleCodeSubmit() {
        const code = this.elements.codeInput.value.trim();
        
        if (!this.validateCode(code)) {
            this.showError('code', 'El código debe tener 8 caracteres');
            return;
        }

        this.setButtonLoading(this.elements.verifyCodeBtn, true);
        this.clearError('code');

        try {
            const result = await window.electronAPI.auth.verifyCode(this.currentEmail, code);
            
            if (result.success) {
                this.showSuccessScreen(result.user);
                this.stopResendTimer();
                
                // La autenticación exitosa será manejada por el evento desde el proceso principal
                // que llamará a app.handleAuthenticationSuccess()
                
            } else {
                this.showError('code', result.error || 'Código inválido o expirado');
                this.elements.codeInput.value = '';
                this.elements.codeInput.focus();
            }

        } catch (error) {
            console.error('Error verificando código:', error);
            this.showError('code', 'Error de conexión con el servidor de autenticación');
            
        } finally {
            this.setButtonLoading(this.elements.verifyCodeBtn, false);
        }
    }

    /**
     * Maneja reenvío de código
     */
    async handleResendCode() {
        if (this.resendTimer) return; // Timer activo

        try {
            const result = await window.electronAPI.auth.requestCode(this.currentEmail);
            
            if (result.success) {
                this.app.showSuccess('Código reenviado');
                this.startResendTimer();
            } else {
                this.app.showError('Error reenviando código');
            }

        } catch (error) {
            console.error('Error reenviando código:', error);
            this.app.showError('Error de conexión');
        }
    }

    /**
     * Muestra el formulario de email
     */
    showEmailForm() {
        this.currentStep = 'email';
        this.hideAllForms();
        this.elements.emailForm.classList.remove('hidden');
        this.elements.emailInput.focus();
        this.clearAllErrors();
    }

    /**
     * Muestra el formulario de código
     */
    showCodeForm() {
        this.currentStep = 'code';
        this.hideAllForms();
        this.elements.codeForm.classList.remove('hidden');
        this.elements.codeInput.focus();
        this.clearAllErrors();
    }

    /**
     * Muestra la pantalla de éxito
     */
    showSuccessScreen(user) {
        this.currentStep = 'success';
        this.hideAllForms();
        this.elements.authSuccess.classList.remove('hidden');
        
        if (this.elements.welcomeMessage && user) {
            this.elements.welcomeMessage.textContent = `Bienvenido, ${user.name || user.email}`;
        }
    }

    /**
     * Oculta todos los formularios
     */
    hideAllForms() {
        this.elements.emailForm.classList.add('hidden');
        this.elements.codeForm.classList.add('hidden');
        this.elements.authSuccess.classList.add('hidden');
    }

    /**
     * Inicia timer de reenvío
     */
    startResendTimer() {
        this.resendCountdown = 60;
        this.updateResendButton();
        
        this.resendTimer = setInterval(() => {
            this.resendCountdown--;
            this.updateResendButton();
            
            if (this.resendCountdown <= 0) {
                this.stopResendTimer();
            }
        }, 1000);
    }

    /**
     * Detiene timer de reenvío
     */
    stopResendTimer() {
        if (this.resendTimer) {
            clearInterval(this.resendTimer);
            this.resendTimer = null;
        }
        this.updateResendButton();
    }

    /**
     * Actualiza estado del botón de reenvío
     */
    updateResendButton() {
        if (!this.elements.resendCodeBtn || !this.elements.resendTimer) return;

        if (this.resendCountdown > 0) {
            this.elements.resendCodeBtn.disabled = true;
            this.elements.resendCodeBtn.textContent = `Reenviar código (${this.resendCountdown}s)`;
            this.elements.resendTimer.textContent = this.resendCountdown;
        } else {
            this.elements.resendCodeBtn.disabled = false;
            this.elements.resendCodeBtn.textContent = 'Reenviar código';
            this.elements.resendTimer.textContent = '0';
        }
    }

    /**
     * Formatea el código de verificación mientras se escribe
     */
    formatVerificationCode(input) {
        // Permitir solo números y letras, máximo 8 caracteres
        let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        if (value.length > 8) {
            value = value.slice(0, 8);
        }

        input.value = value;

        // Auto-enviar cuando se completen 8 caracteres
        if (value.length === 8) {
            setTimeout(() => {
                this.handleCodeSubmit();
            }, 500);
        }
    }

    /**
     * Valida formato de email
     */
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Valida código de verificación
     */
    validateCode(code) {
        return code && code.length === 8;
    }

    /**
     * Muestra error en un campo específico
     */
    showError(field, message) {
        const errorElement = this.elements[`${field}Error`];
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
        }

        // Agregar clase de error al input
        const input = this.elements[`${field}Input`];
        if (input) {
            input.classList.add('error');
            input.focus();
        }
    }

    /**
     * Limpia error de un campo específico
     */
    clearError(field) {
        const errorElement = this.elements[`${field}Error`];
        if (errorElement) {
            errorElement.classList.add('hidden');
        }

        // Remover clase de error del input
        const input = this.elements[`${field}Input`];
        if (input) {
            input.classList.remove('error');
        }
    }

    /**
     * Limpia todos los errores
     */
    clearAllErrors() {
        this.clearError('email');
        this.clearError('code');
    }

    /**
     * Configura estado de loading en botón
     */
    setButtonLoading(button, loading) {
        if (!button) return;

        const spinner = button.querySelector('.btn-spinner');
        const text = button.querySelector('.btn-text');

        if (loading) {
            button.disabled = true;
            if (spinner) spinner.classList.remove('hidden');
            if (text) text.style.opacity = '0';
        } else {
            button.disabled = false;
            if (spinner) spinner.classList.add('hidden');
            if (text) text.style.opacity = '1';
        }
    }

    /**
     * Limpia el estado del gestor
     */
    reset() {
        this.currentStep = 'email';
        this.currentEmail = '';
        this.stopResendTimer();
        this.clearAllErrors();
        
        // Limpiar valores de formularios
        if (this.elements.emailInput) this.elements.emailInput.value = '';
        if (this.elements.codeInput) this.elements.codeInput.value = '';
        
        // Resetear estado de botones
        this.setButtonLoading(this.elements.requestCodeBtn, false);
        this.setButtonLoading(this.elements.verifyCodeBtn, false);
    }

    /**
     * Destruye el gestor y limpia recursos
     */
    destroy() {
        this.stopResendTimer();
        this.reset();
    }
}