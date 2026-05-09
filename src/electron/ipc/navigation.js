import { createLogger } from '../../core/utils/Logger.js';
import { handle, mapError } from './_result.js';
import { DEFAULT_COOKIE_TARGET, MAX_RECOMMENDED_PROFILES, ESTIMATED_RAM_PER_PROFILE_MB } from '../../core/config/defaults.js';

const log = createLogger('ipc:navigation');

/**
 * Handlers IPC del dominio "navegación" + cableado de eventos del
 * NavigationController hacia la UI vía mainWindow.webContents.send.
 *
 * Acá vive toda la conversación entre el renderer y el controller:
 * inicio, parada, consulta de estado, snapshot de sesiones activas,
 * y el forwarding de los eventos emitidos por el NavigationController
 * (session:started, progress, completed, error, global:stats).
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} deps
 * @param {Object} deps.services
 * @param {Object} deps.services.navigationController
 * @param {Object} deps.services.adsPowerManager
 * @param {Function} deps.getMainWindow - devuelve la BrowserWindow activa
 */
export function registerNavigationHandlers(ipcMain, deps) {
    const { services } = deps;

    // Track del controller que ya tiene listeners enganchados para
    // no duplicarlos si setupNavigationProgressEvents() corre dos veces.
    let listenersAttachedTo = null;

    function sendStatus(payload) {
        const win = deps.getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send('navigation:status-change', payload);
        }
    }

    function sendProgress(payload) {
        const win = deps.getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send('navigation:progress', payload);
        }
    }

    function setupProgressEvents() {
        const controller = services.navigationController;
        if (!controller || listenersAttachedTo === controller) return;

        controller.on('session:started', (data) => {
            log.debug('session:started recibido', { profileId: data.profileId });
            sendProgress({
                type: 'session_started',
                sessionId: data.sessionId,
                profileId: data.profileId,
                timestamp: new Date().toISOString(),
                ...data
            });
        });

        controller.on('session:progress', (data) => {
            log.debug('session:progress recibido', {
                profileId: data.profileId,
                cookiesCollected: data.cookiesCollected
            });
            sendProgress({
                type: 'session_progress',
                sessionId: data.sessionId,
                profileId: data.profileId,
                progress: data.progress,
                cookies: data.cookiesCollected,
                sitesVisited: data.sitesVisited,
                currentSite: data.currentSite,
                timestamp: new Date().toISOString()
            });
        });

        controller.on('session:completed', (data) => {
            sendProgress({
                type: 'session_completed',
                sessionId: data.sessionId,
                profileId: data.profileId,
                finalStats: data.finalStats,
                timestamp: new Date().toISOString()
            });
        });

        controller.on('session:error', (data) => {
            sendProgress({
                type: 'session_error',
                sessionId: data.sessionId,
                profileId: data.profileId,
                error: data.error,
                timestamp: new Date().toISOString()
            });
        });

        controller.on('global:stats', (data) => {
            sendProgress({
                type: 'global_stats',
                stats: data,
                timestamp: new Date().toISOString()
            });
        });

        listenersAttachedTo = controller;
    }

    async function handleCompletion(promise) {
        try {
            const results = await promise;
            log.info('Navegación completada', { results });
            sendStatus({
                status: 'completed',
                results,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            log.error('Error en navegación', error);
            sendStatus({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            try {
                await services.navigationController.stopAllSessions();
            } catch (cleanupError) {
                log.error('Error en cleanup tras fallo de navegación', cleanupError);
            }
        }
    }

    async function validateProfilesExist(profileIds) {
        log.info('Validando perfiles en Ads Power');
        const available = await services.adsPowerManager.getAvailableProfiles();
        const availableIds = available.map(p => p.user_id || p.id);
        const invalid = profileIds.filter(id => !availableIds.includes(id));
        if (invalid.length > 0) {
            throw new Error(`Perfiles no encontrados en Ads Power: ${invalid.join(', ')}`);
        }
    }

    function checkSystemResources(profileCount) {
        const requiredRAM = profileCount * ESTIMATED_RAM_PER_PROFILE_MB;
        log.info('Recursos estimados', { profileCount, requiredRAM });
        if (profileCount > MAX_RECOMMENDED_PROFILES) {
            log.warn('Cantidad de perfiles supera el máximo recomendado', {
                profileCount,
                max: MAX_RECOMMENDED_PROFILES
            });
        }
    }

    ipcMain.handle('navigation:start', async (event, config) => {
        try {
            log.info('Solicitud de navegación desde UI', config);

            if (!config || !Array.isArray(config.profileIds)) {
                throw new Error('Configuración inválida: se requiere array de profileIds');
            }
            const { profileIds, targetCookies = DEFAULT_COOKIE_TARGET } = config;
            if (profileIds.length === 0) {
                throw new Error('Se requiere al menos un perfil para iniciar navegación');
            }

            if (!services.navigationController) {
                throw new Error('NavigationController no está inicializado');
            }

            if (services.adsPowerManager) {
                const ok = await services.adsPowerManager.checkAdsPowerStatus();
                if (!ok) {
                    log.warn('Ads Power no está disponible al iniciar navegación');
                }
            }

            if (config.validateProfiles !== false) {
                await validateProfilesExist(profileIds);
            }

            checkSystemResources(profileIds.length);
            setupProgressEvents();

            const promise = services.navigationController.startMultipleNavigationSessions(
                profileIds,
                targetCookies
            );

            sendStatus({
                status: 'starting',
                profileIds,
                targetCookies,
                timestamp: new Date().toISOString()
            });

            // Manejo en background — no esperamos el resultado acá.
            handleCompletion(promise);

            return {
                success: true,
                message: 'Navegación iniciada correctamente',
                data: {
                    profileIds,
                    targetCookies,
                    totalTarget: targetCookies * profileIds.length
                }
            };
        } catch (error) {
            // Side-effect: notificar UI antes de devolver el envelope.
            log.error('Error iniciando navegación', error);
            sendStatus({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            return mapError(error);
        }
    });

    ipcMain.handle('navigation:stop', async () => {
        try {
            const controller = services.navigationController;
            if (!controller) {
                return { success: false, error: 'NavigationController no está disponible' };
            }

            const before = controller.getActiveSessionCount();
            if (before === 0) {
                sendStatus({ status: 'stopped', timestamp: new Date().toISOString() });
                return {
                    success: true,
                    message: 'No había sesiones activas',
                    sessionsStoppedCount: 0
                };
            }

            // stopAllSessions() ya espera la limpieza y resetea estructuras.
            await controller.stopAllSessions();

            const after = controller.getActiveSessionCount();
            sendStatus({
                status: 'stopped',
                timestamp: new Date().toISOString(),
                sessionsStoppedCount: before,
                cleanupSuccess: after === 0
            });

            const win = deps.getMainWindow();
            if (win && !win.isDestroyed()) {
                win.webContents.send('navigation:sync-required', {
                    hasActiveSessions: after > 0,
                    sessionCount: after,
                    timestamp: new Date().toISOString()
                });
            }

            return {
                success: true,
                message: 'Navegación detenida correctamente',
                sessionsStoppedCount: before,
                cleanupSuccess: after === 0
            };
        } catch (error) {
            // Side-effect: notificar UI antes de devolver el envelope.
            log.error('Error deteniendo navegación', error);
            sendStatus({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            return mapError(error);
        }
    });

    ipcMain.handle('navigation:get-status', handle('navigation.get-status', () => {
        if (!services.navigationController) {
            return { success: false, error: 'NavigationController no está disponible' };
        }
        return { success: true, data: services.navigationController.getGlobalStatus() };
    }));

    ipcMain.handle('navigation:get-active-sessions', handle('navigation.get-active-sessions', () => {
        const controller = services.navigationController;
        if (!controller) {
            return {
                success: true,
                hasActiveSessions: false,
                sessionCount: 0,
                sessions: [],
                message: 'NavigationController no disponible'
            };
        }
        const sessions = controller.getActiveSessionsSnapshot();
        return {
            success: true,
            hasActiveSessions: sessions.length > 0,
            sessionCount: sessions.length,
            sessions,
            timestamp: new Date().toISOString()
        };
    }));

    log.debug('Handlers de navigation registrados');
}
