import { createLogger } from '../../core/utils/Logger.js';
import { handle } from './_result.js';

const log = createLogger('ipc:auth');

/**
 * Handlers IPC del flujo de autenticación.
 *
 * El estado de la sesión (isAuthenticated, userToken, userData) vive en
 * el objeto compartido `deps.authState` para que tanto los handlers IPC
 * como el bootstrap (`checkExistingAuth`) puedan leer/escribir.
 *
 * Los handlers usan `handle()` para centralizar try/catch + log + traducción
 * de errores estructurados (MULTIPLE_SESSIONS_BLOCKED, etc.) al envelope IPC.
 */
export function registerAuthHandlers(ipcMain, deps) {
    ipcMain.handle('auth:request-code', handle('auth.request-code', async (event, email) => {
        log.info('Solicitando código', { email });
        return await deps.services.authService.requestAccessCode(email);
    }));

    ipcMain.handle('auth:verify-code', handle('auth.verify-code', async (event, email, code) => {
        log.info('Verificando código', { email });
        const result = await deps.services.authService.verifyAccessCode(email, code);

        if (result.success) {
            const { token, user } = result;
            deps.authState.isAuthenticated = true;
            deps.authState.userToken = token;
            deps.authState.userData = {
                email,
                customerName: user.name,
                subscriptionEnd: user.subscriptionEnd
            };
            log.info('Autenticación exitosa', { email });
            return { success: true, token, user: deps.authState.userData };
        }
        return result;
    }));

    ipcMain.handle('auth:logout', handle('auth.logout', async () => {
        log.info('Cerrando sesión');
        await deps.services.authService.logout();
        deps.clearStoredAuth();

        const window = deps.getMainWindow();
        if (window && !window.isDestroyed()) {
            window.webContents.send('auth:logged-out');
        }
        return { success: true };
    }));

    ipcMain.handle('auth:get-status', () => ({
        isAuthenticated: deps.authState.isAuthenticated,
        user: deps.authState.userData
    }));

    log.debug('Handlers de auth registrados');
}
