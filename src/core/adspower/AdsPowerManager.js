import { chromium } from 'playwright';
import RequestQueue from '../utils/RequestQueue.js';

/**
 * Gestor principal para la integración con Ads Power
 * Maneja la inicialización y control de perfiles de navegador
 */
class AdsPowerManager {
    constructor(configManager = null) {
        this.activeBrowsers = new Map();
        this.configManager = configManager;

        // Configurar URLs con fallback
        if (this.configManager) {
            const urls = this.configManager.getAdsPowerUrls();
            this.baseUrl = urls.baseUrl;
            this.fallbackUrl = urls.fallbackUrl;
        } else {
            this.baseUrl = 'http://local.adspower.com:50325/api/v1';
            this.fallbackUrl = 'http://127.0.0.1:50325/api/v1';
        }

        this.currentUrl = this.baseUrl; // URL activa actual

        // Obtener configuración de rate limiting
        const rateLimitConfig = this.configManager ?
            this.configManager.getRateLimitConfig() :
            this.getDefaultRateLimitConfig();

        // Inicializar RequestQueue con configuración
        this.requestQueue = RequestQueue.getInstance(rateLimitConfig);

        console.log('🚦 AdsPowerManager inicializado con rate limiting:', rateLimitConfig);
        console.log('🌐 URL primaria:', this.baseUrl);
        console.log('🔄 URL fallback:', this.fallbackUrl);
    }

    /**
     * Verifica si Ads Power está ejecutándose y disponible
     * @returns {Promise<Object>} Estado de disponibilidad del servicio con detalles
     */
    async checkAdsPowerStatus() {
        try {
            await this._makeRequest(`${this.baseUrl}/browser/active`);
            return {
                connected: true,
                url: this.baseUrl,
                message: 'Conectado a AdsPower'
            };
        } catch (error) {
            console.error('Error verificando estado de Ads Power:', error.message);
            return {
                connected: false,
                url: null,
                message: error.message || 'No se pudo conectar a AdsPower'
            };
        }
    }

    /**
     * Configuración por defecto si no hay ConfigManager
     * @returns {Object} Configuración por defecto
     */
    getDefaultRateLimitConfig() {
        return {
            requestsPerSecond: 1,
            queueTimeout: 30000,
            retryAttempts: 3,
            retryDelay: 2000,
            debug: process.env.NODE_ENV === 'development',
            maxQueueSize: 2000
        };
    }

    /**
     * Obtiene la lista de perfiles disponibles en Ads Power
     * @returns {Promise<Array>} Lista de perfiles disponibles
     */
    async getAvailableProfiles() {
        try {
            const data = await this._makeRequest(`${this.baseUrl}/user/list?page_size=100`);
            
            if (data.code !== 0) {
                throw new Error(`Error obteniendo perfiles: ${data.msg}`);
            }
            
            return data.data?.list || [];
        } catch (error) {
            console.error('Error obteniendo perfiles:', error.message);
            throw error;
        }
    }

    /**
     * Inicia un perfil específico de Ads Power y conecta Playwright
     * @param {string} profileId - ID del perfil a iniciar
     * @returns {Promise<Object>} Objeto con browser, context y page
     */
    async startProfile(profileId) {
        try {
            // Verificar si el perfil ya está activo
            if (this.activeBrowsers.has(profileId)) {
                console.log(`Perfil ${profileId} ya está activo`);
                return this.activeBrowsers.get(profileId);
            }

            console.log(`Iniciando perfil ${profileId}...`);
            
            // Implementar retry con backoff exponencial para manejar rate limiting
            let attempt = 0;
            const maxAttempts = 3;
            let lastError = null;
            
            while (attempt < maxAttempts) {
                try {
                    // Delay progresivo para evitar rate limiting
                    if (attempt > 0) {
                        const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                        console.log(`⏳ [${profileId}] Reintento ${attempt + 1}/${maxAttempts} en ${delayMs}ms...`);
                        await this.sleep(delayMs);
                    }
                    
                    // Iniciar perfil en Ads Power  
                    const data = await this._makeRequest(`${this.baseUrl}/browser/start?user_id=${profileId}`);
                    
                    if (data.code !== 0) {
                        // Si es error de rate limiting, reintentar
                        if (data.msg && (
                            data.msg.includes('Too many request') || 
                            data.msg.includes('rate limit') ||
                            data.msg.includes('请求过于频繁')
                        )) {
                            lastError = new Error(`Rate limit para perfil ${profileId}: ${data.msg}`);
                            attempt++;
                            continue;
                        }
                        
                        // Para otros errores, fallar inmediatamente
                        throw new Error(`Error iniciando perfil ${profileId}: ${data.msg}`);
                    }
                    
                    // Éxito - conectar con Playwright
                    if (!data.data?.ws?.puppeteer) {
                        throw new Error(`Respuesta inválida de Ads Power para perfil ${profileId}`);
                    }
                    
                    const wsEndpoint = data.data.ws.puppeteer;
                    
                    // Conectar browser usando CDP
                    const browser = await chromium.connectOverCDP(wsEndpoint);
                    const contexts = browser.contexts();
                    
                    if (contexts.length === 0) {
                        throw new Error(`No se encontraron contextos para perfil ${profileId}`);
                    }
                    
                    const context = contexts[0];
                    const pages = context.pages();
                    let page;
                    
                    if (pages.length > 0) {
                        page = pages[0];
                    } else {
                        page = await context.newPage();
                    }
                    
                    const browserInstance = {
                        browser,
                        context,
                        page,
                        profileId,
                        wsEndpoint,
                        startTime: new Date()
                    };
                    
                    this.activeBrowsers.set(profileId, browserInstance);
                    console.log(`✅ Perfil ${profileId} iniciado correctamente (intento ${attempt + 1})`);
                    
                    return browserInstance;
                    
                } catch (error) {
                    lastError = error;
                    
                    // Para errores de red o rate limiting, reintentar
                    if (error.message.includes('Too many request') || 
                        error.message.includes('rate limit') ||
                        error.message.includes('ECONNRESET') ||
                        error.message.includes('fetch')) {
                        attempt++;
                        continue;
                    }
                    
                    // Para otros errores, fallar inmediatamente
                    throw error;
                }
            }
            
            // Si llegamos aquí, se agotaron los reintentos
            throw new Error(`Error iniciando perfil ${profileId} después de ${maxAttempts} intentos: ${lastError?.message || 'Error desconocido'}`);
            
        } catch (error) {
            console.error(`Error iniciando perfil ${profileId}:`, error.message);
            
            // Limpiar si hay algún recurso parcial
            if (this.activeBrowsers.has(profileId)) {
                try {
                    await this.stopProfile(profileId);
                } catch (cleanupError) {
                    console.error(`Error en cleanup de perfil ${profileId}:`, cleanupError.message);
                }
            }
            
            throw error;
        }
    }

    /**
     * Detiene un perfil específico de Ads Power
     * @param {string} profileId - ID del perfil a detener
     * @returns {Promise<void>}
     */
    async stopProfile(profileId) {
        try {
            const browserInstance = this.activeBrowsers.get(profileId);
            
            if (browserInstance) {
                await browserInstance.browser.close();
                this.activeBrowsers.delete(profileId);
            }
            
            // Detener el perfil en Ads Power
            const data = await this._makeRequest(`${this.baseUrl}/browser/stop?user_id=${profileId}`);
            
            if (data.code !== 0) {
                console.warn(`Advertencia deteniendo perfil ${profileId}: ${data.msg}`);
            }
            
            console.log(`Perfil ${profileId} detenido correctamente`);
        } catch (error) {
            console.error(`Error deteniendo perfil ${profileId}:`, error.message);
            throw error;
        }
    }

    /**
     * Obtiene información detallada de un perfil específico
     * @param {string} profileId - ID del perfil
     * @returns {Promise<Object>} Información del perfil
     */
    async getProfileInfo(profileId) {
        try {
            const data = await this._makeRequest(`${this.baseUrl}/user/list?user_id=${profileId}`);
            
            if (data.code !== 0) {
                throw new Error(`Error obteniendo info del perfil ${profileId}: ${data.msg}`);
            }
            
            return data.data;
        } catch (error) {
            console.error(`Error obteniendo info del perfil ${profileId}:`, error.message);
            throw error;
        }
    }

    /**
     * Detiene todos los perfiles activos con throttling para evitar rate limiting
     * @returns {Promise<void>}
     */
    async stopAllProfiles() {
        const profileIds = Array.from(this.activeBrowsers.keys());
        
        if (profileIds.length === 0) {
            console.log('No hay perfiles activos para detener');
            return;
        }
        
        console.log(`Deteniendo ${profileIds.length} perfiles activos...`);
        
        for (let i = 0; i < profileIds.length; i++) {
            const profileId = profileIds[i];
            
            try {
                await this.stopProfile(profileId);
                
                // Agregar delay entre peticiones para evitar rate limiting
                // Solo si no es el último perfil
                if (i < profileIds.length - 1) {
                    const delay = this.calculateStopDelay(profileIds.length);
                    console.log(`⏳ Esperando ${delay}ms antes del siguiente perfil...`);
                    await this.sleep(delay);
                }
                
            } catch (error) {
                console.error(`Error deteniendo perfil ${profileId}:`, error.message);
                
                // Si hay error de rate limiting, esperar más tiempo
                if (error.message.includes('Too many request') || error.message.includes('rate limit')) {
                    console.log('⚠️ Rate limit detectado, esperando más tiempo...');
                    await this.sleep(2000); // 2 segundos adicionales
                }
            }
        }
        
        this.activeBrowsers.clear();
        console.log('✅ Todos los perfiles han sido procesados');
    }

    /**
     * Calcula el delay apropiado entre detener perfiles
     * @param {number} totalProfiles - Total de perfiles a detener
     * @returns {number} Delay en millisegundos
     */
    calculateStopDelay(totalProfiles) {
        // Más delay si hay más perfiles para evitar saturar la API
        if (totalProfiles <= 2) return 500;        // 0.5 segundos
        if (totalProfiles <= 5) return 800;        // 0.8 segundos  
        if (totalProfiles <= 10) return 1200;      // 1.2 segundos
        return 1500;                               // 1.5 segundos para muchos perfiles
    }

    /**
     * Utilidad para pausas
     * @param {number} ms - Millisegundos a esperar
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Obtiene las instancias de navegador activas
     * @returns {Map} Mapa de instancias activas
     */
    getActiveBrowsers() {
        return this.activeBrowsers;
    }

    /**
     * Método privado para hacer requests HTTP a través de la RequestQueue
     * Implementa sistema de fallback: intenta con URL primaria, luego con fallback
     * @param {string} url - URL completa a consultar
     * @param {Object} options - Opciones de fetch (opcional)
     * @returns {Promise<Object>} Respuesta parseada como JSON
     */
    async _makeRequest(url, options = {}) {
        // Función auxiliar para intentar un request
        const tryRequest = async (urlToTry) => {
            const requestFunction = async () => {
                const response = await fetch(urlToTry, {
                    timeout: 15000, // 15 segundos timeout por request
                    ...options
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            };

            return await this.requestQueue.enqueue(requestFunction, {
                timeout: 30000, // 30 segundos timeout total
                priority: 'normal'
            });
        };

        // Intentar con la URL actual
        try {
            return await tryRequest(url);
        } catch (primaryError) {
            // Si falla, intentar cambiar de URL base y reintentar
            const shouldTryFallback = url.includes(this.baseUrl) && this.fallbackUrl && this.baseUrl !== this.fallbackUrl;

            if (shouldTryFallback) {
                console.log(`⚠️ Error con URL primaria, intentando con fallback...`);
                console.log(`   URL primaria: ${this.baseUrl}`);
                console.log(`   URL fallback: ${this.fallbackUrl}`);

                try {
                    // Reemplazar la base URL en la URL completa
                    const fallbackUrl = url.replace(this.baseUrl, this.fallbackUrl);
                    const result = await tryRequest(fallbackUrl);

                    // Si tuvo éxito, actualizar la URL actual para futuras peticiones
                    console.log(`✅ Conexión exitosa con URL fallback, actualizando URL activa`);
                    this.currentUrl = this.fallbackUrl;
                    // Intercambiar las URLs para que la fallback sea ahora la primaria
                    const temp = this.baseUrl;
                    this.baseUrl = this.fallbackUrl;
                    this.fallbackUrl = temp;

                    return result;
                } catch (fallbackError) {
                    // Ambas URLs fallaron
                    console.error(`❌ Error con ambas URLs de AdsPower`);
                    console.error(`   Primaria (${url}): ${primaryError.message}`);
                    console.error(`   Fallback (${url.replace(this.baseUrl, this.fallbackUrl)}): ${fallbackError.message}`);
                    throw new Error(`No se pudo conectar a AdsPower. Asegúrate de que AdsPower esté ejecutándose. Error primario: ${primaryError.message}`);
                }
            }

            // Si no hay fallback disponible, lanzar el error original
            throw primaryError;
        }
    }

    /**
     * Obtiene estadísticas de la RequestQueue para monitoreo
     * @returns {Object} Estadísticas detalladas de la cola
     */
    getRequestQueueStats() {
        return this.requestQueue.getStats();
    }

    /**
     * Limpia la cola de requests pendientes
     */
    clearRequestQueue() {
        this.requestQueue.clearQueue();
        console.log('🚨 Cola de requests limpiada');
    }
}

export default AdsPowerManager;