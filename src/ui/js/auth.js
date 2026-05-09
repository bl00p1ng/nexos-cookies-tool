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

        // Flags para prevenir llamadas duplicadas
        this.isRequestingCode = false;
        this.isVerifyingCode = false;

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
        // Limpiar listeners existentes si los hay
        this.removeExistingListeners();

        // Formulario de email 
        this.elements.emailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleEmailSubmit();
        }, { once: false });

        // Formulario de código
        this.elements.codeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleCodeSubmit();
        }, { once: false });

        // Botón volver al email
        if (this.elements.backToEmailBtn) {
            this.elements.backToEmailBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showEmailForm();
            });
        }

        // Botón reenviar código
        if (this.elements.resendCodeBtn) {
            this.elements.resendCodeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleResendCode();
            });
        }

        // Validación en tiempo real del email
        this.elements.emailInput.addEventListener('input', () => {
            this.clearError('email');
        });

        // Enter key handlers
        this.elements.emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleEmailSubmit();
            }
        });

        this.elements.codeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleCodeSubmit();
            }
        });

        // Pegado desde portapapeles
        this.elements.codeInput.addEventListener('paste', (e) => {
            e.preventDefault();

            console.log('Pegando desde portapapeles');
            const pasteData = (e.clipboardData || window.clipboardData).getData('text');
            const formatted = pasteData.replace(/[^A-Z0-9]/gi, '').toUpperCase().substring(0, 8);
            this.elements.codeInput.value = formatted;
            this.clearError('code');
        });
    }

    /**
     * Remueve listeners existentes para evitar duplicados
     */
    removeExistingListeners() {
        // Clonar elementos para remover todos los listeners
        if (this.elements.emailForm) {
            const newEmailForm = this.elements.emailForm.cloneNode(true);
            this.elements.emailForm.parentNode.replaceChild(newEmailForm, this.elements.emailForm);
            this.elements.emailForm = newEmailForm;
        }

        if (this.elements.codeForm) {
            const newCodeForm = this.elements.codeForm.cloneNode(true);
            this.elements.codeForm.parentNode.replaceChild(newCodeForm, this.elements.codeForm);
            this.elements.codeForm = newCodeForm;
        }

        // Actualizar referencias después del clonado
        this.initializeElements();
    }

    /**
     * Maneja el envío del formulario de email
     */
    async handleEmailSubmit() {
        // Prevenir llamadas duplicadas
        if (this.isRequestingCode) {
            console.log('Solicitud de código ya en progreso');
            return;
        }

        try {
            const email = this.elements.emailInput.value.trim();

            // Validar email
            if (!this.validateEmail(email)) {
                this.showError('email', 'Por favor ingresa un email válido');
                return;
            }

            this.clearError('email');
            this.isRequestingCode = true;
            this.setButtonLoading(this.elements.requestCodeBtn, true);

            console.log('Solicitando código para:', email);

            // Llamar al backend a través de Electron
            const result = await window.electronAPI.auth.requestCode(email);

            if (result.success) {
                this.currentEmail = email;
                this.showCodeForm();
                this.startResendTimer();
                this.app.showSuccess(result.message || 'Código enviado a tu email');
            } else {
                // Verificar si es un error de múltiples dispositivos
                if (result.code === 'MULTIPLE_SESSIONS_BLOCKED') {
                    this.showMultipleDevicesDialog(result);
                } else {
                    this.showError('email', result.error || 'Error enviando código');
                }
            }

        } catch (error) {
            console.error('Error solicitando código:', error);

            // Manejar error de múltiples dispositivos
            if (error.code === 'MULTIPLE_SESSIONS_BLOCKED') {
                this.showMultipleDevicesDialog(error);
            } else {
                this.showError('email', 'Se ha presentado un error. Intenta nuevamente.');
            }
        } finally {
            this.isRequestingCode = false;
            this.setButtonLoading(this.elements.requestCodeBtn, false);
        }
    }

    /**
     * Maneja el envío del formulario de código
     */
    async handleCodeSubmit() {
        // Prevenir llamadas duplicadas
        if (this.isVerifyingCode) {
            console.log('Verificación de código ya en progreso');
            return;
        }

        try {
            const code = this.elements.codeInput.value.trim();

            // Validar código
            // if (!this.validateCode(code)) {
            //     this.showError('code', 'El código debe tener 8 caracteres');
            //     return;
            // }

            this.clearError('code');
            this.isVerifyingCode = true;
            this.setButtonLoading(this.elements.verifyCodeBtn, true);

            console.log('Verificando código para:', this.currentEmail);

            // Llamar al backend a través de Electron
            const result = await window.electronAPI.auth.verifyCode(this.currentEmail, code);

            if (result.success) {
                this.app.showSuccess('¡Autenticación exitosa!');
                this.showSuccessScreen(result.user);
                
                // Notificar a la app principal que la autenticación fue exitosa
                this.app.handleAuthenticationSuccess({
                    email: this.currentEmail,
                    token: result.token,
                    user: result.user
                });
            } else {
                this.showError('code', result.error || 'Código inválido');
                this.elements.codeInput.select(); // Seleccionar texto para fácil reemplazo
            }

        } catch (error) {
            console.error('Error verificando código:', error);
            this.showError('code', 'Se ha presentado un error. Intenta nuevamente.');
        } finally {
            this.isVerifyingCode = false;
            this.setButtonLoading(this.elements.verifyCodeBtn, false);
        }
    }

    /**
     * Maneja el reenvío de código
     */
    async handleResendCode() {
        if (!this.currentEmail) {
            this.showEmailForm();
            return;
        }

        try {
            this.setButtonLoading(this.elements.resendCodeBtn, true);
            
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
        } finally {
            this.setButtonLoading(this.elements.resendCodeBtn, false);
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
    }

    /**
     * Oculta todos los formularios
     */
    hideAllForms() {
        this.elements.emailForm.classList.add('hidden');
        this.elements.codeForm.classList.add('hidden');
        if (this.elements.authSuccess) {
            this.elements.authSuccess.classList.add('hidden');
        }
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
        this.resendCountdown = 0;
        this.updateResendButton();
    }

    /**
     * Actualiza el botón de reenvío
     */
    updateResendButton() {
        if (!this.elements.resendCodeBtn) return;

        if (this.resendCountdown > 0) {
            this.elements.resendCodeBtn.disabled = true;
            this.elements.resendCodeBtn.textContent = `Reenviar en ${this.resendCountdown}s`;
        } else {
            this.elements.resendCodeBtn.disabled = false;
            this.elements.resendCodeBtn.textContent = 'Reenviar código';
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
        this.isRequestingCode = false;
        this.isVerifyingCode = false;
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
     * Muestra diálogo especializado para bloqueo multi-dispositivo
     */
    showMultipleDevicesDialog(error) {
        const minutesText = error.retryAfterMinutes === 1 ? 'minuto' : 'minutos';

        const message = `🚫 MÚLTIPLES DISPOSITIVOS DETECTADOS

Ya existe una sesión activa en otro dispositivo.

¿Qué puedes hacer?
• Esperar ${error.retryAfterMinutes} ${minutesText}
• Cerrar sesión en el otro dispositivo
• Contactar soporte para licencias adicionales

El sistema detectó que estás intentando usar tu cuenta en múltiples dispositivos simultáneamente.
Por seguridad, solo se permite una sesión activa por cuenta.`;

        // Mostrar error en el formulario
        this.showError('email', `Múltiples dispositivos detectados. Espera ${error.retryAfterMinutes} ${minutesText}.`);

        // Mostrar diálogo del sistema
        if (this.app && this.app.showWarning) {
            this.app.showWarning(message);
        } else {
            alert(message);
        }
    }

    /**
     * Destruye el gestor y limpia recursos
     */
    destroy() {
        this.stopResendTimer();
        this.reset();
    }
}