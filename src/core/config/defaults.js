/**
 * Valores por defecto y constantes de configuración de la app.
 *
 * Permite override por variables de entorno para builds personalizados y
 * deployments. Si una env var no está definida, se usa el default.
 *
 * El default de AUTH_BACKEND_URL apunta al dominio oficial del backend.
 * El usuario puede sobrescribirlo desde Ajustes o desde el panel de
 * configuración en la pantalla de login — esos cambios se persisten en
 * electron-store y tienen precedencia sobre esta constante.
 */

export const ADSPOWER_BASE_URL =
    process.env.ADSPOWER_BASE_URL || 'http://local.adspower.com:50325';

export const AUTH_BACKEND_URL =
    process.env.AUTH_BACKEND_URL || 'https://cookies-tool.hexzoragencia.online/';

/**
 * URLs históricas que deben ser sustituidas automáticamente por el default
 * actual cuando se detectan en el store de un usuario que actualizó. Cada
 * entrada es una URL exacta que pertenece a infraestructura ya retirada
 * (túnel ngrok temporal, etc).
 */
export const LEGACY_AUTH_BACKEND_URLS = Object.freeze([
    'https://38c69d16ca36.ngrok-free.app/'
]);

export const DEFAULT_COOKIE_TARGET = 2500;

export const ESTIMATED_RAM_PER_PROFILE_MB = 300;

export const MAX_RECOMMENDED_PROFILES = 10;

export const AUTO_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const AUTO_UPDATE_INITIAL_DELAY_MS = 3000;

/**
 * Shape de configuración completa de la aplicación.
 *
 * Toda la configuración persiste en electron-store bajo la clave `appConfig`.
 * Estos defaults se usan como semilla cuando el store está vacío y como
 * fallback cuando una sección no fue persistida aún.
 *
 * Esta estructura reemplaza el viejo `config/config.json` — todos los settings
 * runtime viven exclusivamente en el store del usuario.
 *
 * NOTA: declarado al final del archivo para que pueda referenciar las
 * constantes primitivas declaradas arriba sin caer en la TDZ de ES modules
 * (los `const` no se hoist).
 */
export const DEFAULT_APP_CONFIG = Object.freeze({
    auth: {
        backendUrl: AUTH_BACKEND_URL,
        timeout: 30000
    },
    adspower: {
        baseUrl: ADSPOWER_BASE_URL,
        timeout: 30000,
        retryAttempts: 3,
        rateLimit: {
            requestsPerSecond: 1,
            queueTimeout: 30000,
            retryAttempts: 3,
            retryDelay: 2000,
            debug: false,
            maxQueueSize: 2000
        }
    },
    navigation: {
        defaultCookieTarget: DEFAULT_COOKIE_TARGET,
        maxPagesPerSite: 10,
        minTimePerPage: 2000,
        maxTimePerPage: 15000,
        scrollDepthMin: 0.3,
        scrollDepthMax: 0.9
    },
    database: {
        backupInterval: 24 * 60 * 60 * 1000,
        maxRetries: 3
    },
    logging: {
        level: 'info',
        saveToFile: true,
        maxLogFiles: 5
    }
});
