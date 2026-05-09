import { createLogger } from '../../core/utils/Logger.js';

/**
 * Convención unificada de manejo de errores en handlers IPC.
 *
 * Reglas del proyecto:
 *
 *   - Capa dominio (core/*): los métodos LANZAN. Es responsabilidad del
 *     caller decidir cómo reaccionar.
 *
 *   - Capa IPC (electron/ipc/*): los handlers son el borde entre el dominio
 *     (que lanza) y el renderer (que recibe JSON). Aquí los errores se
 *     atrapan y se traducen a `{ success: false, error }`. El éxito sigue
 *     el shape que cada handler defina (no se impone `{ success, data }`
 *     para no romper contratos preexistentes con la UI).
 *
 *   - Capa adaptador externo (HTTP, Playwright, sqlite): maneja errores de
 *     protocolo (timeouts, network) y los traduce a errores del dominio
 *     o los re-lanza con contexto.
 *
 * Este helper aplica solo la regla del borde IPC. Reemplaza el patrón
 * boilerplate:
 *
 *   ipcMain.handle('ns:action', async (event, x) => {
 *       try {
 *           return await services.x.doSomething(x);
 *       } catch (error) {
 *           log.error('algo falló', error);
 *           return { success: false, error: error.message };
 *       }
 *   });
 *
 * por:
 *
 *   ipcMain.handle('ns:action', handle('action', async (event, x) => {
 *       return await services.x.doSomething(x);
 *   }));
 *
 * Si el handler async retorna normalmente, el helper devuelve ese mismo
 * valor sin tocarlo (el handler ya conoce el shape que la UI espera).
 *
 * Si lanza, el helper:
 *   - Loguea con el scope provisto.
 *   - Devuelve un envelope estructurado al renderer.
 *   - Preserva metadata útil (userMessage, code, retryAfterMinutes) cuando
 *     el error venga de servicios que ya estructuran su info — por ejemplo
 *     AuthService con errores tipo MULTIPLE_SESSIONS_BLOCKED.
 */
export function handle(scope, fn) {
    const log = createLogger(`ipc:${scope}`);
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            log.error('Handler error', error);
            return mapError(error);
        }
    };
}

/**
 * Traduce un Error (o cualquier valor lanzado) al envelope IPC estándar.
 * Expuesto para casos donde el handler quiere su propio try/catch pero
 * quiere preservar el mismo formato de error.
 */
export function mapError(error) {
    if (!error) {
        return { success: false, error: 'Error desconocido' };
    }

    const envelope = {
        success: false,
        error: error.userMessage || error.message || String(error)
    };
    if (error.code) envelope.code = error.code;
    if (error.retryAfterMinutes !== undefined) {
        envelope.retryAfterMinutes = error.retryAfterMinutes;
    }
    return envelope;
}
