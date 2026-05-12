import { createLogger } from '../../core/utils/Logger.js';
import { handle } from './_result.js';
import AdsPowerManager from '../../core/adspower/AdsPowerManager.js';
import { AuthService } from '../../core/auth/AuthService.js';
import { ADSPOWER_BASE_URL, AUTH_BACKEND_URL } from '../../core/config/defaults.js';
import {
    BACKEND_HOSTNAMES,
    BACKEND_PROTOCOLS,
    ADSPOWER_HOSTNAMES,
    ADSPOWER_PROTOCOLS
} from '../../core/config/securityAllowlists.js';

const log = createLogger('ipc:config');

/**
 * Handlers IPC del dominio "configuración".
 *
 * Algunos de estos handlers tienen side-effects más allá de tocar el store:
 *   - `setAdsPowerUrl` recrea AdsPowerManager y lo cablea al NavigationController.
 *   - `setBackendUrl` recrea AuthService.
 *
 * Las recreaciones se aplican mutando `deps.services` (que es el mismo
 * objeto que ve el resto de los routers). Así los handlers de otros
 * dominios ven la nueva instancia en su próxima invocación sin tener
 * que re-registrar nada.
 */
export function registerConfigHandlers(ipcMain, deps) {
    const { services } = deps;

    ipcMain.handle('config:get', handle('config.get', () => ({
        success: true,
        config: services.configStore.getConfig()
    })));

    ipcMain.handle('config:get-adspower-url', handle('config.get-adspower-url', () => ({
        success: true,
        url: services.configStore.getAdsPowerUrl()
    })));

    ipcMain.handle('config:set-adspower-url', handle('config.set-adspower-url', async (event, newUrl) => {
        const cleanUrl = sanitizeAdsPowerUrl(newUrl);
        services.configStore.set('adspower.baseUrl', cleanUrl);

        // Apagar perfiles activos antes de reemplazar el manager
        if (services.adsPowerManager) {
            try {
                await services.adsPowerManager.stopAllProfiles();
            } catch (stopError) {
                log.warn('Error deteniendo perfiles previo a recreación', { error: stopError.message });
            }
        }

        services.adsPowerManager = new AdsPowerManager(services.configStore, cleanUrl);

        if (services.navigationController) {
            services.navigationController.adsPowerManager = services.adsPowerManager;
        }

        log.info('URL de AdsPower actualizada', { url: cleanUrl });
        return { success: true, url: cleanUrl };
    }));

    ipcMain.handle('config:get-backend-url', handle('config.get-backend-url', () => ({
        success: true,
        url: services.configStore.getAuthConfig().backendUrl
    })));

    ipcMain.handle('config:set-backend-url', handle('config.set-backend-url', (event, newUrl) => {
        const cleanUrl = sanitizeBackendUrl(newUrl);
        services.configStore.set('auth.backendUrl', cleanUrl);
        services.authService = new AuthService(cleanUrl, services.store);
        log.info('URL del backend actualizada', { url: cleanUrl });
        return { success: true, url: cleanUrl };
    }));

    ipcMain.handle('config:get-defaults', () => ({
        adsPowerBaseUrl: ADSPOWER_BASE_URL,
        authBackendUrl: AUTH_BACKEND_URL
    }));

    log.debug('Handlers de configuración registrados');
}

/**
 * Valida y normaliza una URL de AdsPower antes de persistirla.
 * Requiere que el hostname esté en ADSPOWER_HOSTNAMES, el protocolo en
 * ADSPOWER_PROTOCOLS y que haya un puerto explícito.
 * Stripea el sufijo `/api/v1` antes de validar.
 *
 * @param {string} url - URL a validar.
 * @returns {string} URL normalizada sin trailing slash ni sufijo /api/v1.
 * @throws {Error} Si la URL es inválida, el host no está permitido,
 *   el protocolo no está permitido o falta el puerto.
 */
export function sanitizeAdsPowerUrl(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
        throw new Error('La URL no puede estar vacía');
    }
    let clean = url.trim();
    // Stripear sufijo /api/v1 ANTES de parsear para validar el host limpio
    if (clean.endsWith('/api/v1')) clean = clean.slice(0, -7);
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    let parsed;
    try {
        parsed = new URL(clean);
    } catch {
        throw new Error('URL inválida. Debe ser una URL completa (ej: http://host:puerto)');
    }
    if (!ADSPOWER_PROTOCOLS.has(parsed.protocol)) {
        throw new Error(`Protocolo no permitido (${parsed.protocol}). Solo se aceptan: ${[...ADSPOWER_PROTOCOLS].join(', ')}`);
    }
    if (!ADSPOWER_HOSTNAMES.has(parsed.hostname)) {
        throw new Error(`Dominio no permitido: ${parsed.hostname}. La URL de AdsPower debe apuntar a un host local.`);
    }
    if (parsed.port === '') {
        throw new Error('Puerto requerido. La URL de AdsPower debe incluir un puerto explícito (ej: :50325)');
    }
    return clean;
}

/**
 * Valida y normaliza una URL del backend de autenticación antes de persistirla.
 * Requiere que el hostname esté en BACKEND_HOSTNAMES y el protocolo sea HTTPS.
 *
 * @param {string} url - URL a validar.
 * @returns {string} URL normalizada con trailing slash garantizado.
 * @throws {Error} Si la URL es inválida, el host no está permitido o el protocolo no es HTTPS.
 */
export function sanitizeBackendUrl(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
        throw new Error('La URL no puede estar vacía');
    }
    let clean = url.trim();
    if (!clean.endsWith('/')) clean += '/';
    let parsed;
    try {
        parsed = new URL(clean);
    } catch {
        throw new Error('URL inválida. Debe ser una URL completa (ej: https://example.com/)');
    }
    if (!BACKEND_PROTOCOLS.has(parsed.protocol)) {
        throw new Error(`Protocolo no permitido (${parsed.protocol}). Solo se acepta: https`);
    }
    if (!BACKEND_HOSTNAMES.has(parsed.hostname)) {
        throw new Error(`Dominio no permitido: ${parsed.hostname}. El backend debe usar un dominio autorizado.`);
    }
    return clean;
}
