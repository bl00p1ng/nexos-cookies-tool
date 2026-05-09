import { chromium } from 'playwright';
import RequestQueue from '../utils/RequestQueue.js';
import { ADSPOWER_BASE_URL } from '../config/defaults.js';

import { createLogger } from '../utils/Logger.js';

const log = createLogger('AdsPowerManager');
/**
 * Gestor principal para la integración con Ads Power
 * Maneja la inicialización y control de perfiles de navegador
 */
class AdsPowerManager {
    /**
     * @param {Object|null} configStore - ConfigStore (o compatible) con getRateLimitConfig()
     * @param {string|null} adsPowerBaseUrl - Override de la URL base
     */
    constructor(configStore = null, adsPowerBaseUrl = null) {
        this.activeBrowsers = new Map();
        this.configStore = configStore;

        // Construir la URL completa de la API
        // Prioridad: 1. Parámetro adsPowerBaseUrl, 2. Valor por defecto
        const baseUrl = adsPowerBaseUrl || ADSPOWER_BASE_URL;
        this.baseUrl = `${baseUrl}/api/v1`;

        log.info('AdsPowerManager usando URL:', this.baseUrl);

        // Obtener configuración de rate limiting
        const rateLimitConfig = this.configStore ?
            this.configStore.getRateLimitConfig() :
            this.getDefaultRateLimitConfig();

        // Inicializar RequestQueue con configuración
        this.requestQueue = RequestQueue.getInstance(rateLimitConfig);

        log.info('AdsPowerManager inicializado con rate limiting:', rateLimitConfig);
    }

    /**
     * Verifica si Ads Power está ejecutándose y disponible
     * @returns {Promise<boolean>} Estado de disponibilidad del servicio
     */
    /**
     * Health check del servicio Ads Power. Por contrato retorna booleano
     * (NO lanza) — un AdsPower caído es un estado válido que el caller
     * inspecciona, no un error excepcional. Logueamos a nivel debug
     * para no inundar con errores de un servicio externo que puede
     * legítimamente no estar corriendo.
     */
    async checkAdsPowerStatus() {
        try {
            await this._makeRequest(`${this.baseUrl}/browser/active`);
            return true;
        } catch (error) {
            log.debug('AdsPower no disponible', { error: error.message });
            return false;
        }
    }

    /**
     * Configuración por defecto si no hay ConfigStore
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
            log.error('Error obteniendo perfiles:', error.message);
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
                log.info(`Perfil ${profileId} ya está activo`);
                return this.activeBrowsers.get(profileId);
            }

            log.info(`Iniciando perfil ${profileId}...`);
            
            // Implementar retry con backoff exponencial para manejar rate limiting
            let attempt = 0;
            const maxAttempts = 3;
            let lastError = null;
            
            while (attempt < maxAttempts) {
                try {
                    // Delay progresivo para evitar rate limiting
                    if (attempt > 0) {
                        const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                        log.info(`[${profileId}] Reintento ${attempt + 1}/${maxAttempts} en ${delayMs}ms...`);
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
                    log.info(`Perfil ${profileId} iniciado correctamente (intento ${attempt + 1})`);
                    
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
            log.error(`Error iniciando perfil ${profileId}:`, error.message);
            
            // Limpiar si hay algún recurso parcial
            if (this.activeBrowsers.has(profileId)) {
                try {
                    await this.stopProfile(profileId);
                } catch (cleanupError) {
                    log.error(`Error en cleanup de perfil ${profileId}:`, cleanupError.message);
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
                log.warn(`Advertencia deteniendo perfil ${profileId}: ${data.msg}`);
            }
            
            log.info(`Perfil ${profileId} detenido correctamente`);
        } catch (error) {
            log.error(`Error deteniendo perfil ${profileId}:`, error.message);
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
            log.error(`Error obteniendo info del perfil ${profileId}:`, error.message);
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
            log.info('No hay perfiles activos para detener');
            return;
        }
        
        log.info(`Deteniendo ${profileIds.length} perfiles activos...`);
        
        for (let i = 0; i < profileIds.length; i++) {
            const profileId = profileIds[i];
            
            try {
                await this.stopProfile(profileId);
                
                // Agregar delay entre peticiones para evitar rate limiting
                // Solo si no es el último perfil
                if (i < profileIds.length - 1) {
                    const delay = this.calculateStopDelay(profileIds.length);
                    log.info(`Esperando ${delay}ms antes del siguiente perfil...`);
                    await this.sleep(delay);
                }
                
            } catch (error) {
                log.error(`Error deteniendo perfil ${profileId}:`, error.message);
                
                // Si hay error de rate limiting, esperar más tiempo
                if (error.message.includes('Too many request') || error.message.includes('rate limit')) {
                    log.info('Rate limit detectado, esperando más tiempo...');
                    await this.sleep(2000); // 2 segundos adicionales
                }
            }
        }
        
        this.activeBrowsers.clear();
        log.info('Todos los perfiles han sido procesados');
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
     * Reemplaza todas las llamadas directas a fetch() con rate limiting
     * @param {string} url - URL completa a consultar
     * @param {Object} options - Opciones de fetch (opcional)
     * @returns {Promise<Object>} Respuesta parseada como JSON
     */
    async _makeRequest(url, options = {}) {
        // Crear función de request que será encolada
        const requestFunction = async () => {
            const response = await fetch(url, {
                timeout: 15000, // 15 segundos timeout por request
                ...options
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        };

        // Encolar request y esperar resultado
        return await this.requestQueue.enqueue(requestFunction, {
            timeout: 30000, // 30 segundos timeout total
            priority: 'normal'
        });
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
        log.info('Cola de requests limpiada');
    }
}

export default AdsPowerManager;