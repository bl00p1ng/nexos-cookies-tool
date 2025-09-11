import { chromium } from 'playwright';

/**
 * Gestor principal para la integración con Ads Power
 * Maneja la inicialización y control de perfiles de navegador
 */
class AdsPowerManager {
    constructor() {
        this.baseUrl = 'http://local.adspower.com:50325/api/v1';
        this.activeBrowsers = new Map();
    }

    /**
     * Verifica si Ads Power está ejecutándose y disponible
     * @returns {Promise<boolean>} Estado de disponibilidad del servicio
     */
    async checkAdsPowerStatus() {
        try {
            const response = await fetch(`${this.baseUrl}/status`);
            return response.ok;
        } catch (error) {
            console.error('Error verificando estado de Ads Power:', error.message);
            return false;
        }
    }

    /**
     * Obtiene la lista de perfiles disponibles en Ads Power
     * @returns {Promise<Array>} Lista de perfiles disponibles
     */
    async getAvailableProfiles() {
        try {
            const response = await fetch(`${this.baseUrl}/browser/list`);
            const data = await response.json();
            
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
            
            // Solicitar inicio del perfil a Ads Power
            const response = await fetch(`${this.baseUrl}/browser/start?user_id=${profileId}`);
            const data = await response.json();
            
            if (data.code !== 0) {
                throw new Error(`Error iniciando perfil ${profileId}: ${data.msg}`);
            }
            
            // Obtener la URL de conexión WebSocket
            const wsEndpoint = data.data?.ws?.puppeteer;
            if (!wsEndpoint) {
                throw new Error('No se pudo obtener endpoint de conexión WebSocket');
            }
            
            // Conectar Playwright al navegador iniciado
            const browser = await chromium.connectOverCDP(wsEndpoint);
            const contexts = browser.contexts();
            
            if (contexts.length === 0) {
                throw new Error('No se encontró contexto de navegador válido');
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
                wsEndpoint
            };
            
            // Almacenar la instancia activa
            this.activeBrowsers.set(profileId, browserInstance);
            
            console.log(`Perfil ${profileId} iniciado correctamente`);
            return browserInstance;
            
        } catch (error) {
            console.error(`Error iniciando perfil ${profileId}:`, error.message);
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
            const response = await fetch(`${this.baseUrl}/browser/stop?user_id=${profileId}`);
            const data = await response.json();
            
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
            const response = await fetch(`${this.baseUrl}/browser/info?user_id=${profileId}`);
            const data = await response.json();
            
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
     * Detiene todos los perfiles activos
     * @returns {Promise<void>}
     */
    async stopAllProfiles() {
        const profileIds = Array.from(this.activeBrowsers.keys());
        
        for (const profileId of profileIds) {
            try {
                await this.stopProfile(profileId);
            } catch (error) {
                console.error(`Error deteniendo perfil ${profileId}:`, error.message);
            }
        }
        
        this.activeBrowsers.clear();
    }

    /**
     * Obtiene las instancias de navegador activas
     * @returns {Map} Mapa de instancias activas
     */
    getActiveBrowsers() {
        return this.activeBrowsers;
    }
}

export default AdsPowerManager;