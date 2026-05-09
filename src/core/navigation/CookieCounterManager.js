/**
 * Gestor de conteo de cookies
 * Previene valores negativos causados por timeouts y desconexiones
 */
class CookieCounterManager {
    constructor() {
        // Cache de últimos valores válidos por contexto/página
        this.lastValidCounts = new Map();
        
        // Configuración de reintentos y timeouts
        this.config = {
            maxRetries: 3,
            retryDelay: 1000,
            baseTimeout: 3000,
            maxTimeout: 8000,
            fallbackThreshold: 50 // Diferencias menores a este valor son aceptables
        };
        
        // Métricas para debugging
        this.metrics = {
            successfulCounts: 0,
            failedCounts: 0,
            timeouts: 0,
            fallbacksUsed: 0,
            totalRequests: 0
        };
    }

    /**
     * Cuenta la cantidad de cookies recolectadas
     * @param {Object} page - Instancia de página de Playwright
     * @param {string} profileId - ID del perfil para logging
     * @returns {Promise<Object>} Resultado con count y metadata
     */
    async getCookieCount(page, profileId = 'unknown') {
        this.metrics.totalRequests++;
        
        // Generar clave única para este contexto
        const contextKey = this.generateContextKey(page, profileId);
        
        // Intentar obtener conteo con reintentos
        const result = await this.attemptCookieCountWithRetries(page, contextKey, profileId);
        
        // Si falló completamente, usar estrategia de fallback
        if (!result.success) {
            return this.handleCountFailure(contextKey, profileId, result.error);
        }
        
        // Validar y cachear resultado exitoso
        return this.validateAndCacheResult(result, contextKey, profileId);
    }

    /**
     * Intenta contar cookies con múltiples reintentos y timeouts progresivos
     * @param {Object} page - Página de Playwright
     * @param {string} contextKey - Clave del contexto
     * @param {string} profileId - ID del perfil
     * @returns {Promise<Object>} Resultado del intento
     */
    async attemptCookieCountWithRetries(page, contextKey, profileId) {
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                // Timeout progresivo: más tiempo en reintentos
                const timeout = Math.min(
                    this.config.baseTimeout * attempt,
                    this.config.maxTimeout
                );
                
                console.log(`[${profileId}] Contando cookies (intento ${attempt}/${this.config.maxRetries}, timeout: ${timeout}ms)`);
                
                const count = await this.attemptSingleCookieCount(page, timeout);
                
                this.metrics.successfulCounts++;
                console.log(`[${profileId}] Cookies contadas exitosamente: ${count}`);
                
                return {
                    success: true,
                    count: count,
                    attempt: attempt,
                    method: 'direct'
                };
                
            } catch (error) {
                console.warn(`[${profileId}] Intento ${attempt} falló: ${error.message}`);
                
                // En el último intento, no esperar
                if (attempt < this.config.maxRetries) {
                    await this.sleep(this.config.retryDelay * attempt);
                }
                
                // Clasificar tipo de error
                if (error.message.includes('Timeout')) {
                    this.metrics.timeouts++;
                }
            }
        }
        
        this.metrics.failedCounts++;
        return {
            success: false,
            error: `Falló después de ${this.config.maxRetries} intentos`,
            method: 'failed'
        };
    }

    /**
     * Realiza un único intento de conteo con timeout específico
     * @param {Object} page - Página de Playwright
     * @param {number} timeout - Timeout en milisegundos
     * @returns {Promise<number>} Cantidad de cookies
     */
    async attemptSingleCookieCount(page, timeout) {
        // Validaciones previas
        if (!page) {
            throw new Error('Página no disponible');
        }

        if (page.isClosed && page.isClosed()) {
            throw new Error('Página cerrada');
        }

        const context = page.context();
        if (!context) {
            throw new Error('Contexto no disponible');
        }

        // Verificar estado del navegador antes del conteo
        try {
            await page.evaluate(() => document.readyState);
        } catch (evalError) {
            if (evalError.message.includes('closed') || evalError.message.includes('Target page')) {
                throw new Error('Navegador desconectado');
            }
        }

        // Intentar obtener cookies con timeout estricto
        const cookies = await Promise.race([
            context.cookies(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout obteniendo cookies')), timeout)
            )
        ]);
        
        return cookies.length;
    }

    /**
     * Maneja fallos de conteo usando estrategias de fallback
     * @param {string} contextKey - Clave del contexto
     * @param {string} profileId - ID del perfil
     * @param {string} error - Mensaje de error
     * @returns {Object} Resultado de fallback
     */
    handleCountFailure(contextKey, profileId, error) {
        console.error(`[${profileId}] Conteo falló completamente: ${error}`);
        
        // Estrategia 1: Usar último valor conocido si existe
        const lastValid = this.lastValidCounts.get(contextKey);
        if (lastValid && lastValid.count !== undefined) {
            console.warn(`[${profileId}] Usando último valor conocido: ${lastValid.count} (hace ${Date.now() - lastValid.timestamp}ms)`);
            this.metrics.fallbacksUsed++;
            
            return {
                success: true,
                count: lastValid.count,
                method: 'cached_fallback',
                warning: 'Valor de cache por fallo de conexión',
                originalError: error
            };
        }
        
        // Estrategia 2: Valor conservador de 0 si no hay cache
        console.warn(`[${profileId}] Sin cache disponible, usando 0 como fallback seguro`);
        this.metrics.fallbacksUsed++;
        
        return {
            success: true,
            count: 0,
            method: 'zero_fallback',
            warning: 'Conteo falló, usando 0 por seguridad',
            originalError: error
        };
    }

    /**
     * Valida resultado y actualiza cache
     * @param {Object} result - Resultado del conteo
     * @param {string} contextKey - Clave del contexto
     * @param {string} profileId - ID del perfil
     * @returns {Object} Resultado validado
     */
    validateAndCacheResult(result, contextKey, profileId) {
        // Validar que el conteo sea razonable
        if (result.count < 0) {
            console.warn(`[${profileId}] Conteo negativo detectado (${result.count}), corrigiendo a 0`);
            result.count = 0;
        }
        
        if (result.count > 10000) {
            console.warn(`[${profileId}] Conteo muy alto (${result.count}), posible error`);
        }
        
        // Actualizar cache con valor válido
        this.lastValidCounts.set(contextKey, {
            count: result.count,
            timestamp: Date.now(),
            profileId: profileId
        });
        
        // Limpiar cache antiguo (mayores a 10 minutos)
        this.cleanOldCache();
        
        return result;
    }

    /**
     * Genera clave única para contexto de navegador/perfil
     * @param {Object} page - Página de Playwright
     * @param {string} profileId - ID del perfil
     * @returns {string} Clave única
     */
    generateContextKey(page, profileId) {
        try {
            // Intentar usar información del contexto del navegador
            const context = page.context();
            const browserContext = context ? context._guid || context.toString() : 'unknown';
            return `${profileId}-${browserContext}`;
        } catch (error) {
            // Si no se puede obtener contexto, usar solo profileId
            return profileId;
        }
    }

    /**
     * Limpia cache de valores antiguos
     */
    cleanOldCache() {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10 minutos
        
        for (const [key, value] of this.lastValidCounts.entries()) {
            if (now - value.timestamp > maxAge) {
                this.lastValidCounts.delete(key);
            }
        }
    }

    /**
     * Calcula diferencia de cookies de forma segura
     * @param {number} before - Conteo antes
     * @param {number} after - Conteo después
     * @param {Object} options - Opciones de validación
     * @returns {Object} Resultado con diferencia validada
     */
    calculateSafeCookieDifference(before, after, options = {}) {
        const {
            allowNegative = false,
            maxNegativeDiff = -50,
            profileId = 'unknown'
        } = options;
        
        const rawDiff = after - before;
        let safeDiff = rawDiff;
        let adjustmentReason = null;
        
        // Validar diferencias negativas sospechosas
        if (rawDiff < 0 && !allowNegative) {
            if (rawDiff < maxNegativeDiff) {
                // Diferencia muy negativa, probablemente error de conteo
                console.warn(`[${profileId}] Diferencia sospechosa: ${rawDiff} (${before} ${after}). Usando 0 por seguridad.`);
                safeDiff = 0;
                adjustmentReason = 'negative_diff_too_large';
            } else {
                // Diferencia negativa pequeña, puede ser legítima (cookies expiradas)
                console.log(`[${profileId}] Diferencia negativa pequeña: ${rawDiff} (posiblemente cookies expiradas)`);
            }
        }
        
        return {
            before: before,
            after: after,
            rawDifference: rawDiff,
            safeDifference: safeDiff,
            adjustmentReason: adjustmentReason,
            wasAdjusted: safeDiff !== rawDiff
        };
    }

    /**
     * Obtiene métricas de rendimiento
     * @returns {Object} Métricas detalladas
     */
    getMetrics() {
        const total = this.metrics.totalRequests;
        return {
            ...this.metrics,
            successRate: total > 0 ? (this.metrics.successfulCounts / total * 100).toFixed(2) + '%' : '0%',
            fallbackRate: total > 0 ? (this.metrics.fallbacksUsed / total * 100).toFixed(2) + '%' : '0%',
            cacheSize: this.lastValidCounts.size
        };
    }

    /**
     * Resetea métricas y cache
     */
    reset() {
        this.lastValidCounts.clear();
        this.metrics = {
            successfulCounts: 0,
            failedCounts: 0,
            timeouts: 0,
            fallbacksUsed: 0,
            totalRequests: 0
        };
    }

    /**
     * Función auxiliar para sleep
     * @param {number} ms - Milisegundos a esperar
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default CookieCounterManager;