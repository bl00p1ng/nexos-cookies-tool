import { createLogger } from '../../core/utils/Logger.js';

const log = createLogger('ipc:system');

/**
 * Handlers IPC del dominio "sistema" — versión de la app y delegación de
 * apertura de URLs externas en el navegador del SO.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} deps
 * @param {string} deps.appVersion
 * @param {Electron.Shell} deps.shell
 */
export function registerSystemHandlers(ipcMain, deps) {
    const { appVersion, shell } = deps;

    ipcMain.handle('system:get-version', () => appVersion);

    // Abre enlaces externos delegados desde el preload (que cancela la
    // navegación interna de la BrowserWindow para evitar fugar al usuario
    // fuera de la app).
    ipcMain.handle('shell:open-external', (event, url) => {
        if (typeof url !== 'string') return false;
        if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
        shell.openExternal(url);
        return true;
    });

    log.debug('Handlers de sistema registrados');
}
