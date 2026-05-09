import { createLogger } from '../../core/utils/Logger.js';
import { handle, mapError } from './_result.js';

const log = createLogger('ipc:database');

/**
 * Handlers IPC para consultas a la base de datos: stats de sitios,
 * muestreo aleatorio y reportes de navegación.
 *
 * Los handlers simples usan `handle()`. Los de reports mantienen try/catch
 * propio porque devuelven shape con fallback de paginación vacía que la UI
 * necesita aún en caso de error.
 */
export function registerDatabaseHandlers(ipcMain, deps) {
    ipcMain.handle('database:get-stats', handle('database.get-stats', async () => {
        const stats = await deps.services.databaseManager.getWebsiteStats();
        return { success: true, stats };
    }));

    ipcMain.handle('database:get-sites', handle('database.get-sites', async (event, count = 10) => {
        const sites = await deps.services.databaseManager.getRandomWebsites(count);
        return { success: true, sites };
    }));

    ipcMain.handle('reports:get', async (event, options = {}) => {
        const { filters = {}, page = 1, limit = 10 } = options;
        try {
            const result = await deps.services.databaseManager.getNavigationReports(filters, page, limit);
            return { success: true, ...result };
        } catch (error) {
            log.error('Error obteniendo reportes', error);
            // Shape con paginación vacía que la UI espera para renderizar
            // estado "sin resultados" en lugar de romper la tabla.
            return {
                ...mapError(error),
                data: [],
                pagination: {
                    currentPage: 1,
                    totalPages: 0,
                    totalRecords: 0,
                    recordsPerPage: limit,
                    hasNextPage: false,
                    hasPreviousPage: false
                }
            };
        }
    });

    ipcMain.handle('reports:summary', async (event, filters = {}) => {
        try {
            const result = await deps.services.databaseManager.getReportsSummary(filters);
            return { success: true, ...result };
        } catch (error) {
            log.error('Error obteniendo resumen de reportes', error);
            return { ...mapError(error), summary: {} };
        }
    });

    log.debug('Handlers de base de datos registrados');
}
