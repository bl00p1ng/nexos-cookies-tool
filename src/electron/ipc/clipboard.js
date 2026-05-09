import { clipboard } from 'electron';
import { createLogger } from '../../core/utils/Logger.js';

const log = createLogger('ipc:clipboard');

/**
 * Handlers IPC para acceso controlado al portapapeles del sistema.
 *
 * @param {Electron.IpcMain} ipcMain
 */
export function registerClipboardHandlers(ipcMain) {
    ipcMain.handle('clipboard:read-text', () => clipboard.readText());

    ipcMain.handle('clipboard:write-text', (event, text) => {
        if (typeof text !== 'string') return false;
        clipboard.writeText(text);
        return true;
    });

    log.debug('Handlers de portapapeles registrados');
}
