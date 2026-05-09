import { createLogger } from '../../core/utils/Logger.js';
import { handle } from './_result.js';
import AdsPowerManager from '../../core/adspower/AdsPowerManager.js';
import { AuthService } from '../../core/auth/AuthService.js';
import { ADSPOWER_BASE_URL, AUTH_BACKEND_URL } from '../../core/config/defaults.js';

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

    ipcMain.handle('config:update', handle('config.update', (event, updates) => {
        Object.entries(updates).forEach(([key, value]) => {
            services.configStore.set(key, value);
        });
        return { success: true };
    }));

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

function sanitizeAdsPowerUrl(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
        throw new Error('La URL no puede estar vacía');
    }
    let clean = url.trim();
    if (clean.endsWith('/api/v1')) clean = clean.slice(0, -7);
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    try {
        new URL(clean);
    } catch {
        throw new Error('URL inválida. Debe ser una URL completa (ej: http://host:puerto)');
    }
    return clean;
}

function sanitizeBackendUrl(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
        throw new Error('La URL no puede estar vacía');
    }
    let clean = url.trim();
    if (!clean.endsWith('/')) clean += '/';
    try {
        new URL(clean);
    } catch {
        throw new Error('URL inválida. Debe ser una URL completa (ej: https://example.com/)');
    }
    return clean;
}
