/**
 * Sistema de cola de requests con rate limiting para Ads Power API
 * Implementa patrón singleton para garantizar rate limiting global
 */
class RequestQueue {
    constructor(config = {}) {
        this.config = {
            requestsPerSecond: config.requestsPerSecond || 1,
            queueTimeout: config.queueTimeout || 30000,
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 2000,
            ...config
        };

        this.queue = [];
        this.isProcessing = false;
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            queueSize: 0,
            lastRequestTime: null,
            averageResponseTime: 0
        };

        this.requestDelay = 1000 / this.config.requestsPerSecond;
        
        // Iniciar procesamiento automático
        this.startProcessing();
    }

    /**
     * Singleton instance
     */
    static instance = null;

    /**
     * Obtiene la instancia singleton de RequestQueue
     * @param {Object} config - Configuración opcional para primera inicialización
     * @returns {RequestQueue} Instancia singleton
     */
    static getInstance(config = {}) {
        if (!RequestQueue.instance) {
            RequestQueue.instance = new RequestQueue(config);
        }
        return RequestQueue.instance;
    }

    /**
     * Encola una request para ser procesada respetando rate limiting
     * @param {Function} requestFunction - Función que ejecuta la request (debe retornar Promise)
     * @param {Object} options - Opciones adicionales
     * @returns {Promise} Promise que se resuelve cuando la request es procesada
     */
    async enqueue(requestFunction, options = {}) {
        return new Promise((resolve, reject) => {
            const requestItem = {
                id: this.generateRequestId(),
                requestFunction,
                options: {
                    timeout: options.timeout || this.config.queueTimeout,
                    retryAttempts: options.retryAttempts || this.config.retryAttempts,
                    priority: options.priority || 'normal',
                    ...options
                },
                resolve,
                reject,
                createdAt: Date.now(),
                attempts: 0
            };

            this.queue.push(requestItem);
            this.stats.queueSize = this.queue.length;
            
            this.logDebug(`Request ${requestItem.id} encolada. Queue size: ${this.queue.length}`);
        });
    }

    /**
     * Inicia el procesamiento continuo de la cola
     */
    startProcessing() {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        this.processQueue();
    }

    /**
     * Detiene el procesamiento de la cola
     */
    stopProcessing() {
        this.isProcessing = false;
    }

    /**
     * Procesa la cola de requests respetando rate limiting
     */
    async processQueue() {
        while (this.isProcessing) {
            if (this.queue.length === 0) {
                await this.sleep(100); // Espera corta si no hay requests
                continue;
            }

            // Obtener siguiente request (respetando prioridad si se implementa)
            const requestItem = this.queue.shift();
            this.stats.queueSize = this.queue.length;

            // Verificar timeout
            if (this.isRequestTimedOut(requestItem)) {
                this.handleRequestTimeout(requestItem);
                continue;
            }

            // Procesar request
            await this.processRequest(requestItem);

            // Esperar según rate limit
            await this.sleep(this.requestDelay);
        }
    }

    /**
     * Procesa una request individual con retry logic
     * @param {Object} requestItem - Item de la cola a procesar
     */
    async processRequest(requestItem) {
        const startTime = Date.now();
        
        try {
            this.logDebug(`Procesando request ${requestItem.id} (intento ${requestItem.attempts + 1})`);
            
            requestItem.attempts++;
            this.stats.totalRequests++;
            this.stats.lastRequestTime = Date.now();

            // Ejecutar la request
            const result = await requestItem.requestFunction();
            
            // Calcular tiempo de respuesta
            const responseTime = Date.now() - startTime;
            this.updateAverageResponseTime(responseTime);

            // Resolver exitosamente
            this.stats.successfulRequests++;
            requestItem.resolve(result);
            
            this.logDebug(`Request ${requestItem.id} completada exitosamente en ${responseTime}ms`);

        } catch (error) {
            this.logDebug(`Request ${requestItem.id} falló: ${error.message}`);
            
            // Intentar retry si es posible
            if (requestItem.attempts < requestItem.options.retryAttempts && this.shouldRetry(error)) {
                this.logDebug(`Reintentando request ${requestItem.id} en ${this.config.retryDelay}ms`);
                
                // Esperar delay de retry
                await this.sleep(this.config.retryDelay);
                
                // Re-encolar al principio para retry
                this.queue.unshift(requestItem);
                this.stats.queueSize = this.queue.length;
                
            } else {
                // Falló definitivamente
                this.stats.failedRequests++;
                requestItem.reject(error);
                
                this.logDebug(`Request ${requestItem.id} falló definitivamente después de ${requestItem.attempts} intentos`);
            }
        }
    }

    /**
     * Verifica si una request ha excedido su timeout
     * @param {Object} requestItem - Item de la cola
     * @returns {boolean} True si ha excedido el timeout
     */
    isRequestTimedOut(requestItem) {
        const age = Date.now() - requestItem.createdAt;
        return age > requestItem.options.timeout;
    }

    /**
     * Maneja requests que han excedido su timeout
     * @param {Object} requestItem - Item que excedió timeout
     */
    handleRequestTimeout(requestItem) {
        const error = new Error(`Request timeout después de ${requestItem.options.timeout}ms`);
        requestItem.reject(error);
        this.stats.failedRequests++;
        
        this.logDebug(`Request ${requestItem.id} timeout después de ${Date.now() - requestItem.createdAt}ms`);
    }

    /**
     * Determina si una request debe ser reintentada basado en el error
     * @param {Error} error - Error ocurrido
     * @returns {boolean} True si debe reintentarse
     */
    shouldRetry(error) {
        // Retry en errores de red, timeouts, y rate limiting
        const retryableErrors = [
            'ECONNRESET',
            'ENOTFOUND',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'Too many request',
            'rate limit'
        ];

        return retryableErrors.some(retryableError => 
            error.message.toLowerCase().includes(retryableError.toLowerCase())
        );
    }

    /**
     * Actualiza el promedio de tiempo de respuesta
     * @param {number} responseTime - Tiempo de respuesta en ms
     */
    updateAverageResponseTime(responseTime) {
        if (this.stats.averageResponseTime === 0) {
            this.stats.averageResponseTime = responseTime;
        } else {
            // Media móvil simple
            this.stats.averageResponseTime = (this.stats.averageResponseTime * 0.9) + (responseTime * 0.1);
        }
    }

    /**
     * Genera un ID único para cada request
     * @returns {string} ID único
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Obtiene estadísticas actuales de la cola
     * @returns {Object} Estadísticas detalladas
     */
    getStats() {
        return {
            ...this.stats,
            queueSize: this.queue.length,
            isProcessing: this.isProcessing,
            requestsPerSecond: this.config.requestsPerSecond,
            uptime: this.stats.lastRequestTime ? Date.now() - this.stats.lastRequestTime : 0
        };
    }

    /**
     * Reinicia estadísticas
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            queueSize: this.queue.length,
            lastRequestTime: null,
            averageResponseTime: 0
        };
    }

    /**
     * Limpia la cola eliminando todas las requests pendientes
     */
    clearQueue() {
        const pendingRequests = this.queue.length;
        
        // Rechazar todas las requests pendientes
        this.queue.forEach(requestItem => {
            requestItem.reject(new Error('Queue cleared'));
        });
        
        this.queue = [];
        this.stats.queueSize = 0;
        
        this.logDebug(`Cola limpiada. ${pendingRequests} requests canceladas`);
    }

    /**
     * Utilidad para pausas con Promise
     * @param {number} ms - Milisegundos a esperar
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log de debug para monitoreo
     * @param {string} message - Mensaje a loggear
     * @param {Object} data - Datos adicionales opcionales
     */
    logDebug(message, data = null) {
        if (process.env.NODE_ENV === 'development' || this.config.debug) {
            const timestamp = new Date().toISOString();
            const queueInfo = `Queue: ${this.queue.length}`;
            const statsInfo = `Success: ${this.stats.successfulRequests}/${this.stats.totalRequests}`;
            
            let logMessage = `[RequestQueue] ${timestamp} - ${message} | ${queueInfo} | ${statsInfo}`;
            
            if (data) {
                logMessage += ` | Data: ${JSON.stringify(data)}`;
            }
            
            console.log(logMessage);
        }
    }

    /**
     * Destructor para cleanup
     */
    destroy() {
        this.stopProcessing();
        this.clearQueue();
        RequestQueue.instance = null;
    }
}

export default RequestQueue;