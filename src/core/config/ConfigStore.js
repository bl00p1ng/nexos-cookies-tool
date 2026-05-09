import { DEFAULT_APP_CONFIG, LEGACY_AUTH_BACKEND_URLS } from './defaults.js';

/**
 * Fuente única de configuración runtime de la app.
 *
 * Encapsula un store (electron-store en producción, un stub en memoria en CLI/test)
 * y expone una API estable a los consumers del core. Toda la configuración persiste
 * bajo la clave `appConfig` del store inyectado.
 *
 * Reemplaza al viejo `ConfigManager` (config.json + lecturas/escrituras manuales).
 */
class ConfigStore {
    /**
     * @param {Object} store - Store con métodos get(key, default), set(key, value),
     *                         delete(key). electron-store cumple esta interfaz.
     */
    constructor(store) {
        if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
            throw new Error('ConfigStore requiere un store con get/set');
        }
        this.store = store;
    }

    /**
     * Mantenido por compatibilidad con consumers que esperaban
     * ConfigManager#loadConfig. No-op: el store ya está siempre disponible.
     */
    async loadConfig() {
        // intencionalmente vacío
    }

    /**
     * Idem ConfigManager#saveConfig. No-op: el store persiste cada set.
     */
    async saveConfig() {
        // intencionalmente vacío
    }

    /**
     * Devuelve la configuración completa actual (mezcla store + defaults).
     */
    getConfig() {
        return this.store.get('appConfig', DEFAULT_APP_CONFIG);
    }

    /**
     * Devuelve una sección de la configuración (auth, adspower, navigation, etc).
     */
    getSection(name) {
        return this.store.get(`appConfig.${name}`, DEFAULT_APP_CONFIG[name] || {});
    }

    /**
     * Actualiza un valor de configuración por path (notación dot dentro de appConfig).
     * Ej: set('adspower.baseUrl', 'http://...')
     */
    set(path, value) {
        this.store.set(`appConfig.${path}`, value);
    }

    getAuthConfig() {
        return this.getSection('auth');
    }

    getAdsPowerUrl() {
        return this.getSection('adspower').baseUrl;
    }

    getDefaultCookieTarget() {
        return this.getSection('navigation').defaultCookieTarget;
    }

    getNavigationParams() {
        return this.getSection('navigation');
    }

    getRateLimitConfig() {
        return this.getSection('adspower').rateLimit;
    }

    /**
     * Reemplaza el bloque de rate limiting fusionándolo con el actual.
     */
    updateRateLimitConfig(rateLimitConfig) {
        const current = this.getSection('adspower');
        const merged = {
            ...current,
            rateLimit: { ...current.rateLimit, ...rateLimitConfig }
        };
        this.store.set('appConfig.adspower', merged);
    }

    /**
     * Migración de URLs históricas. Si el store guarda una URL de backend
     * de infraestructura retirada (ver LEGACY_AUTH_BACKEND_URLS), la borra
     * para que el siguiente lookup caiga al default actual.
     */
    purgeLegacyBackendUrl() {
        const current = this.getSection('auth').backendUrl;
        if (current && LEGACY_AUTH_BACKEND_URLS.includes(current)) {
            this.set('auth.backendUrl', DEFAULT_APP_CONFIG.auth.backendUrl);
            return true;
        }
        return false;
    }
}

export default ConfigStore;
