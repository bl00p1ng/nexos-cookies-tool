import { app, dialog } from 'electron';
import pkg from 'electron-updater';
import { createLogger } from '../core/utils/Logger.js';
import {
    AUTO_UPDATE_INTERVAL_MS,
    AUTO_UPDATE_INITIAL_DELAY_MS
} from '../core/config/defaults.js';

const { autoUpdater } = pkg;
const log = createLogger('AutoUpdater');

/**
 * Configura el auto-updater: descarga manual con confirmación, instalación
 * al reiniciar (forzada en macOS porque el quitAndInstall nativo no apaga
 * la ventana solo), y polling periódico.
 *
 * @param {Object} deps
 * @param {Function} deps.getMainWindow - devuelve la BrowserWindow activa
 * @returns {{ stop: () => void }} - llamar stop() en cleanup para clearear timers
 */
export function setupAutoUpdater({ getMainWindow }) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // En macOS necesitamos cierre manual para que quitAndInstall funcione
    if (process.platform === 'darwin') {
        autoUpdater.autoInstallOnAppQuit = false;
    }

    autoUpdater.on('checking-for-update', () => {
        log.info('Buscando actualizaciones');
    });

    autoUpdater.on('update-available', (info) => {
        log.info('Actualización disponible', { version: info.version });
        const win = getMainWindow();
        if (!win || win.isDestroyed()) return;

        dialog.showMessageBox(win, {
            type: 'info',
            title: 'Actualización disponible',
            message: `Versión ${info.version} disponible`,
            detail: '¿Deseas descargar e instalar la actualización ahora?',
            buttons: ['Descargar', 'Más tarde']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.downloadUpdate();
            }
        });
    });

    autoUpdater.on('update-not-available', () => {
        log.info('La aplicación está actualizada');
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const percent = Math.round(progressObj.percent);
        log.debug('Descargando actualización', { percent });
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send('update:download-progress', { percent });
        }
    });

    autoUpdater.on('update-downloaded', () => {
        log.info('Actualización descargada');
        const win = getMainWindow();
        if (!win || win.isDestroyed()) return;

        dialog.showMessageBox(win, {
            type: 'info',
            title: 'Actualización lista',
            message: 'Actualización descargada',
            detail: 'La actualización se instalará al reiniciar la aplicación',
            buttons: ['Reiniciar ahora', 'Más tarde']
        }).then((result) => {
            if (result.response === 0) {
                setImmediate(() => {
                    app.removeAllListeners('window-all-closed');
                    const currentWin = getMainWindow();
                    if (currentWin && !currentWin.isDestroyed()) {
                        currentWin.close();
                    }
                    autoUpdater.quitAndInstall(false, true);
                });
            }
        });
    });

    autoUpdater.on('error', (err) => {
        log.error('Error en actualización', err);
    });

    const startupTimer = setTimeout(() => {
        autoUpdater.checkForUpdates();
    }, AUTO_UPDATE_INITIAL_DELAY_MS);

    const interval = setInterval(() => {
        autoUpdater.checkForUpdates();
    }, AUTO_UPDATE_INTERVAL_MS);

    return {
        stop() {
            clearTimeout(startupTimer);
            clearInterval(interval);
        }
    };
}
