import { createLogger } from '../../core/utils/Logger.js';
import { handle } from './_result.js';

const log = createLogger('ipc:adspower');

/**
 * Handler IPC para chequear si Ads Power está corriendo y accesible.
 */
export function registerAdsPowerHandlers(ipcMain, deps) {
    ipcMain.handle('adspower:check-status', handle('adspower.check-status', async () => {
        const available = await deps.services.adsPowerManager.checkAdsPowerStatus();
        return { success: true, available };
    }));

    log.debug('Handlers de AdsPower registrados');
}
