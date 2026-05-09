import { registerAuthHandlers } from './auth.js';
import { registerAdsPowerHandlers } from './adspower.js';
import { registerNavigationHandlers } from './navigation.js';
import { registerDatabaseHandlers } from './database.js';
import { registerConfigHandlers } from './config.js';
import { registerSystemHandlers } from './system.js';
import { registerClipboardHandlers } from './clipboard.js';
import { createLogger } from '../../core/utils/Logger.js';

const log = createLogger('ipc:bootstrap');

/**
 * Registra todos los routers IPC en un solo call. Cada router declara
 * sus propias dependencias en `deps`.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} deps
 */
export function registerAllIpcHandlers(ipcMain, deps) {
    registerAuthHandlers(ipcMain, deps);
    registerAdsPowerHandlers(ipcMain, deps);
    registerNavigationHandlers(ipcMain, deps);
    registerDatabaseHandlers(ipcMain, deps);
    registerConfigHandlers(ipcMain, deps);
    registerSystemHandlers(ipcMain, deps);
    registerClipboardHandlers(ipcMain);
    log.info('Todos los handlers IPC registrados');
}
