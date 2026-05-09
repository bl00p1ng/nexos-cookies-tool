import axios from 'axios';
import { getDeviceFingerprint } from './deviceFingerprint.js';

import { createLogger } from '../utils/Logger.js';

const log = createLogger('AuthService');
/**
 * Servicio de Autenticación para Cookies Hexzor
 * Maneja todas las operaciones de autenticación con el backend
 * Incluye device fingerprinting para sesión única por dispositivo
 */
export class AuthService {
    /**
     * @param {string} apiBaseUrl - URL base del backend de autenticación
     * @param {Object} store - Store de Electron para persistir datos
     */
    constructor(apiBaseUrl, store) {
        this.apiBaseUrl = apiBaseUrl;
        this.store = store;

        // Cliente HTTP configurado
        this.httpClient = axios.create({
            baseURL: this.apiBaseUrl,
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Configurar interceptores
        this.setupInterceptors();
    }

    /**
     * Configura interceptores del cliente HTTP
     */
    setupInterceptors() {
        // Interceptor de request: Agregar device fingerprint a TODOS los requests
        this.httpClient.interceptors.request.use(
            config => {
                const fingerprint = getDeviceFingerprint();
                config.headers['x-device-fingerprint'] = fingerprint;

                log.info(`${config.method.toUpperCase()} ${config.url}`);

                return config;
            },
            error => {
                return Promise.reject(error);
            }
        );

        // Interceptor de response: Manejar respuestas y errores globalmente
        this.httpClient.interceptors.response.use(
            response => {
                log.info(`${response.config.method.toUpperCase()} ${response.config.url} - ${response.status}`);
                return response;
            },
            error => {
                if (error.response) {
                    log.error(`${error.config.method.toUpperCase()} ${error.config.url} - ${error.response.status}`);
                } else {
                    log.error(`${error.config?.method?.toUpperCase() || 'REQUEST'} - Network Error`);
                }
                return Promise.reject(error);
            }
        );
    }

    /**
     * Solicita un código de acceso por email
     *
     * @param {string} email - Email del usuario
     * @returns {Promise<Object>} Respuesta del servidor
     * @throws {Error} Con información detallada del error
     */
    async requestAccessCode(email) {
        try {
            const response = await this.httpClient.post('/api/auth/request-code', { email });

            return {
                success: true,
                message: response.data.message,
                data: response.data.data
            };

        } catch (error) {
            // Manejar error de múltiples sesiones
            if (error.response?.data?.code === 'MULTIPLE_SESSIONS_BLOCKED') {
                const errorData = error.response.data;

                throw {
                    code: 'MULTIPLE_SESSIONS_BLOCKED',
                    message: 'Ya existe una sesión activa en otro dispositivo',
                    blockedUntil: new Date(errorData.blockedUntil),
                    retryAfterMinutes: errorData.retryAfterMinutes,
                    userMessage: `Ya existe una sesión activa en otro dispositivo.\\n\\nPodrás solicitar un nuevo código en ${errorData.retryAfterMinutes} minutos, o puedes cerrar la sesión del otro dispositivo si tienes acceso a él.`,
                    canRetry: true
                };
            }

            // Manejar error de suscripción inactiva
            if (error.response?.status === 403) {
                throw {
                    code: 'SUBSCRIPTION_INACTIVE',
                    message: 'Tu suscripción no está activa',
                    userMessage: 'No tienes una suscripción activa. Por favor contacta con soporte.',
                    canRetry: false
                };
            }

            // Manejar rate limiting
            if (error.response?.status === 429) {
                throw {
                    code: 'RATE_LIMIT',
                    message: 'Demasiadas solicitudes',
                    userMessage: 'Has realizado demasiadas solicitudes. Intenta de nuevo en unos minutos.',
                    canRetry: true
                };
            }

            // Error de red o servidor
            if (!error.response) {
                throw {
                    code: 'NETWORK_ERROR',
                    message: 'Error de conexión',
                    userMessage: 'No se pudo conectar al servidor. Verifica tu conexión a internet.',
                    canRetry: true
                };
            }

            // Error genérico del servidor
            throw {
                code: 'SERVER_ERROR',
                message: error.response?.data?.error || 'Error desconocido',
                userMessage: 'Ocurrió un error inesperado. Por favor intenta de nuevo.',
                canRetry: true
            };
        }
    }

    /**
     * Verifica el código de acceso recibido por email
     *
     * @param {string} email - Email del usuario
     * @param {string} code - Código de verificación
     * @returns {Promise<Object>} Token JWT y datos del usuario
     * @throws {Error} Con información detallada del error
     */
    async verifyAccessCode(email, code) {
        try {
            const response = await this.httpClient.post('/api/auth/verify-code', {
                email,
                code: code.toUpperCase().trim()
            });

            // Debug: ver estructura de respuesta
            log.info('Respuesta de verify-code:', JSON.stringify(response.data, null, 2));

            // Extraer datos de respuesta con valores por defecto
            const { token, user, deviceFingerprint = null } = response.data.data || {};

            // Validar que tenemos los datos mínimos requeridos
            if (!token || !user) {
                throw new Error('Respuesta del servidor incompleta: falta token o user');
            }

            log.info('Guardando datos de autenticación...');
            log.info('- Token:', token ? '': '');
            log.info('- Email:', email);
            log.info('- User:', user);
            log.info('- DeviceFingerprint:', deviceFingerprint);

            // Guardar token y fingerprint en el store
            this.saveAuthData(token, email, user, deviceFingerprint);

            log.info('Datos guardados exitosamente');

            return {
                success: true,
                token,
                user
            };

        } catch (error) {
            // Log detallado del error para debugging
            log.error('Error en verifyAccessCode:', error);
            log.error('- Tipo:', error.constructor.name);
            log.error('- Mensaje:', error.message);
            log.error('- Stack:', error.stack);

            // Código inválido o expirado
            if (error.response?.status === 401) {
                throw {
                    code: 'INVALID_CODE',
                    message: 'Código inválido o expirado',
                    userMessage: 'El código ingresado es inválido o ha expirado. Solicita un nuevo código.',
                    canRetry: true
                };
            }

            // Error de red (axios)
            if (!error.response && error.code === 'ECONNREFUSED') {
                throw {
                    code: 'NETWORK_ERROR',
                    message: 'Error de conexión',
                    userMessage: 'No se pudo conectar al servidor. Verifica tu conexión a internet.',
                    canRetry: true
                };
            }

            // Error de JavaScript (no de axios)
            if (error instanceof Error && !error.response) {
                throw {
                    code: 'INTERNAL_ERROR',
                    message: error.message,
                    userMessage: `Error interno: ${error.message}`,
                    canRetry: false
                };
            }

            // Error genérico de servidor
            throw {
                code: 'VERIFICATION_ERROR',
                message: error.response?.data?.error || 'Error verificando código',
                userMessage: 'No se pudo verificar el código. Intenta de nuevo.',
                canRetry: true
            };
        }
    }

    /**
     * Valida un token guardado con el backend de autenticación
     *
     * @param {string} token - Token JWT
     * @param {string} email - Email del usuario
     * @returns {Promise<Object>} Resultado de la validación
     */
    /**
     * Valida un token guardado contra el backend.
     *
     * Convención de respuesta:
     *   - { success: true }                                       — token y suscripción válidos
     *   - { success: false, code: 'INVALID_TOKEN', error }        — backend rechazó el token (401)
     *   - { success: false, code: 'SUBSCRIPTION_INACTIVE', ... }  — backend reporta suscripción inactiva (403)
     *   - { success: false, code: 'MULTIPLE_DEVICE_BLOCKED', ... }— backend detectó otro dispositivo
     *   - { success: false, code: 'NETWORK_ERROR', error }        — no se pudo contactar al backend
     *   - { success: false, code: 'SERVER_ERROR', error }         — error 5xx u otro inesperado
     *
     * El caller (authBootstrap) usa el `code` para decidir si limpia la
     * sesión local o solo pide re-login preservando el token.
     */
    async validateToken(token, email) {
        try {
            const response = await this.httpClient.post('/api/auth/validate-token', {
                token: token,
                email: email
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.data.success) {
                // Actualizar información de suscripción si ha cambiado
                const subscriptionData = response.data.subscription;
                if (subscriptionData && subscriptionData.subscriptionEnd) {
                    this.store.set('subscriptionEnd', subscriptionData.subscriptionEnd);
                    this.store.set('customerName', subscriptionData.customerName);
                    this.store.set('customerId', subscriptionData.customerId);
                }

                return { success: true };
            } else {
                return {
                    success: false,
                    code: 'INVALID_TOKEN',
                    error: response.data.error || 'Token inválido'
                };
            }

        } catch (error) {
            if (error.response?.data?.code === 'MULTIPLE_DEVICE_BLOCKED') {
                const errorData = error.response.data;
                const blockedUntil = new Date(errorData.blockedUntil);
                const minutesLeft = Math.ceil((blockedUntil - new Date()) / (1000 * 60));

                return {
                    success: false,
                    code: 'MULTIPLE_DEVICE_BLOCKED',
                    message: 'Sesión activa en otro dispositivo',
                    blockedUntil: blockedUntil,
                    minutesLeft: minutesLeft,
                    userMessage: `Tu sesión ha sido bloqueada porque se detectó uso en otro dispositivo.\\n\\nPodrás acceder nuevamente en ${minutesLeft} minutos.`
                };
            }

            if (error.response?.status === 401) {
                return {
                    success: false,
                    code: 'INVALID_TOKEN',
                    error: 'Token expirado o inválido'
                };
            }

            if (error.response?.status === 403) {
                return {
                    success: false,
                    code: 'SUBSCRIPTION_INACTIVE',
                    error: 'Suscripción inactiva'
                };
            }

            // Sin response = problema de transporte (red caída, DNS, timeout, etc.)
            if (!error.response) {
                log.warn('Error de red validando token', { error: error.message });
                return {
                    success: false,
                    code: 'NETWORK_ERROR',
                    error: 'No se pudo contactar al servidor de autenticación'
                };
            }

            log.error('Error inesperado validando token', error);
            return {
                success: false,
                code: 'SERVER_ERROR',
                error: error.response?.data?.error || 'Error del servidor de autenticación'
            };
        }
    }

    /**
     * Realiza un request autenticado a cualquier endpoint
     * Valida automáticamente la sesión única
     *
     * @param {string} endpoint - Endpoint relativo
     * @param {Object} options - Opciones de axios (method, data, params, etc.)
     * @returns {Promise<Object>} Respuesta del servidor
     * @throws {Error} Con información detallada del error
     */
    async makeAuthenticatedRequest(endpoint, options = {}) {
        const token = this.store.get('authToken');

        if (!token) {
            throw {
                code: 'NOT_AUTHENTICATED',
                message: 'No hay token de autenticación',
                userMessage: 'Debes iniciar sesión primero.',
                requiresLogin: true
            };
        }

        try {
            const response = await this.httpClient({
                url: endpoint,
                method: options.method || 'GET',
                data: options.data,
                params: options.params,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`
                }
            });

            return response.data;

        } catch (error) {
            // Sesión bloqueada por múltiples dispositivos
            if (error.response?.data?.code === 'MULTIPLE_DEVICE_BLOCKED') {
                const errorData = error.response.data;
                const blockedUntil = new Date(errorData.blockedUntil);
                const minutesLeft = Math.ceil((blockedUntil - new Date()) / (1000 * 60));

                // Limpiar token local ya que no es válido
                this.clearAuthData();

                throw {
                    code: 'MULTIPLE_DEVICE_BLOCKED',
                    message: 'Sesión activa en otro dispositivo',
                    blockedUntil: blockedUntil,
                    minutesLeft: minutesLeft,
                    userMessage: `Tu sesión ha sido bloqueada porque se detectó uso en otro dispositivo.\\n\\nPodrás acceder nuevamente en ${minutesLeft} minutos, o contacta con soporte para adquirir licencias adicionales.`,
                    requiresLogin: true,
                    canRetry: false
                };
            }

            // Token expirado
            if (error.response?.status === 401) {
                this.clearAuthData();

                throw {
                    code: 'TOKEN_EXPIRED',
                    message: 'Sesión expirada',
                    userMessage: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
                    requiresLogin: true
                };
            }

            // Suscripción expirada
            if (error.response?.status === 403) {
                this.clearAuthData();

                throw {
                    code: 'SUBSCRIPTION_EXPIRED',
                    message: 'Suscripción expirada',
                    userMessage: 'Tu suscripción ha expirado. Contacta con soporte para renovarla.',
                    requiresLogin: true
                };
            }

            // Error de red
            if (!error.response) {
                throw {
                    code: 'NETWORK_ERROR',
                    message: 'Error de conexión',
                    userMessage: 'No se pudo conectar al servidor. Verifica tu conexión a internet.',
                    canRetry: true
                };
            }

            // Error genérico
            throw {
                code: 'REQUEST_ERROR',
                message: error.response?.data?.error || 'Error en la solicitud',
                userMessage: 'Ocurrió un error procesando tu solicitud. Intenta de nuevo.',
                canRetry: true
            };
        }
    }

    /**
     * Cierra la sesión actual del usuario
     * Invalida el token en el servidor y limpia almacenamiento local
     *
     * @returns {Promise<Object>} Confirmación del logout
     */
    async logout() {
        const token = this.store.get('authToken');

        // Limpiar storage local primero
        this.clearAuthData();

        // Si hay token, intentar invalidar en servidor
        if (token) {
            try {
                await this.httpClient.delete('/api/auth/session/logout', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                return {
                    success: true,
                    message: 'Sesión cerrada correctamente'
                };
            } catch (error) {
                log.warn('No se pudo invalidar sesión en servidor:', error.message);
                // Continuar de todos modos, ya limpiamos local storage
            }
        }

        return {
            success: true,
            message: 'Sesión cerrada localmente'
        };
    }

    /**
     * Cierra TODAS las sesiones del usuario (emergencia)
     * Útil si el usuario sospecha que alguien más está usando su cuenta
     *
     * @returns {Promise<Object>} Confirmación
     */
    async logoutAllSessions() {
        const token = this.store.get('authToken');

        if (!token) {
            throw {
                code: 'NOT_AUTHENTICATED',
                message: 'No hay token de autenticación'
            };
        }

        try {
            const response = await this.httpClient.delete('/api/auth/sessions/all', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            // Limpiar storage local
            this.clearAuthData();

            return {
                success: true,
                message: `${response.data.sessionsRemoved} sesión(es) cerrada(s)`,
                sessionsRemoved: response.data.sessionsRemoved
            };

        } catch (error) {
            throw {
                code: 'LOGOUT_ALL_ERROR',
                message: error.response?.data?.error || 'Error cerrando sesiones',
                userMessage: 'No se pudieron cerrar las sesiones. Intenta de nuevo.'
            };
        }
    }

    /**
     * Verifica si el usuario está autenticado
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!this.store.get('authToken');
    }

    /**
     * Obtiene información del usuario actual
     * @returns {Object|null}
     */
    getCurrentUser() {
        if (!this.isAuthenticated()) {
            return null;
        }

        return {
            email: this.store.get('lastEmail'),
            name: this.store.get('customerName'),
            subscriptionEnd: this.store.get('subscriptionEnd')
        };
    }

    /**
     * Guarda datos de autenticación en el store.
     *
     * Deliberadamente NO se persiste fecha de expiración: la vigencia del
     * token la decide el backend en cada `validateToken`. Confiar en una
     * fecha local sería bypass-able (el store es un JSON plano en disco).
     *
     * @private
     */
    saveAuthData(token, email, user, deviceFingerprint) {
        this.store.set('authToken', token);
        this.store.set('lastEmail', email);

        // Limpiar tokenExpiry residual de versiones previas que sí lo guardaban.
        this.store.delete('tokenExpiry');

        // Solo guardar deviceFingerprint si existe y es un string
        if (deviceFingerprint && typeof deviceFingerprint === 'string') {
            this.store.set('device_fingerprint', deviceFingerprint);
        }

        if (user.subscriptionEnd) {
            this.store.set('subscriptionEnd', user.subscriptionEnd);
        }
        if (user.name) {
            this.store.set('customerName', user.name);
        }
        if (user.customerId) {
            this.store.set('customerId', user.customerId);
        }
    }

    /**
     * Limpia datos de autenticación del store
     * @private
     */
    clearAuthData() {
        this.store.delete('authToken');
        this.store.delete('lastEmail');
        this.store.delete('subscriptionEnd');
        this.store.delete('tokenExpiry');
        this.store.delete('customerName');
        this.store.delete('customerId');
        this.store.delete('device_fingerprint');
    }
}
