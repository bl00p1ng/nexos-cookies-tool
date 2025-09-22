import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import initialWebsites from './initialWebsites.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Gestor de base de datos SQLite para el sistema
 * Maneja sitios web, sesiones de navegación y patrones aprendidos
 */
class DatabaseManager {
    constructor(dbPath = null) {
        if (dbPath) {
            // Si se proporciona un path específico, usarlo
            this.dbPath = dbPath;
            console.log('🗄️ Usando DB path personalizado:', this.dbPath);
        } else if (app && app.isPackaged) {
            // Aplicación empaquetada - usar directorio userData de Electron
            const userDataPath = app.getPath('userData');
            const dataDir = path.join(userDataPath, 'data');
            this.dbPath = path.join(dataDir, 'loadtest.db');
            console.log(`🗄️ Modo empaquetado - DB en: ${this.dbPath}`);
        } else {
            // Desarrollo - usar ruta relativa
            this.dbPath = './data/loadtest.db';
            console.log('🗄️ Modo desarrollo - DB en:', this.dbPath);
        }

        this.db = null;
    }

    /**
     * Inicializa la conexión a la base de datos y crea las tablas necesarias
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            // Crear directorio de datos si no existe
            const dataDir = dirname(this.dbPath);
            await fs.mkdir(dataDir, { recursive: true });

            // Si el entorno es la app empaquetada y no existe la DB, copiarla desde recursos
            if (app && app.isPackaged) {
                try {
                    await fs.access(this.dbPath);
                    console.log('✅ Base de datos ya existe en userData');
                } catch {
                    // La DB no existe, copiarla desde recursos
                    console.log('📋 DB no encontrada, copiando desde recursos...');
                    
                    // Intentar múltiples paths posibles de recursos
                    const possiblePaths = [
                        path.join(process.resourcesPath, 'data', 'loadtest.db'),
                        path.join(process.resourcesPath, 'app', 'data', 'loadtest.db'),
                        path.join(process.resourcesPath, 'extraResources', 'data', 'loadtest.db')
                    ];
                    
                    let copySuccess = false;
                    let lastError = null;
                    
                    for (const resourceDbPath of possiblePaths) {
                        try {
                            console.log(`🔍 Intentando copiar desde: ${resourceDbPath}`);
                            await fs.access(resourceDbPath);
                            await fs.copyFile(resourceDbPath, this.dbPath);
                            console.log('✅ Base de datos copiada exitosamente desde recursos');
                            copySuccess = true;
                            break;
                        } catch (error) {
                            lastError = error;
                            console.log(`❌ Falló path: ${resourceDbPath} - ${error.message}`);
                        }
                    }
                    
                    if (!copySuccess) {
                        console.error('❌ CRÍTICO: No se pudo copiar la base de datos desde recursos');
                        console.error('❌ Último error:', lastError.message);
                        throw new Error(`No se pudo encontrar o copiar la base de datos desde recursos. App no puede funcionar sin la DB original.`);
                    }
                }
            }

            // Abrir conexión a la base de datos
            this.db = new sqlite3.Database(this.dbPath);
            
            // Promisificar métodos de la base de datos para uso con async/await
            this.db.runAsync = this.promisify(this.db.run);
            this.db.getAsync = this.promisify(this.db.get);
            this.db.allAsync = this.promisify(this.db.all);

            // Crear tablas si no existen
            await this.createTables();
            
            // Verificar si necesitamos poblar con datos iniciales
            const websiteCount = await this.getWebsiteCount();
            if (websiteCount === 0) {
                await this.seedInitialWebsites();
            }

            console.log('Base de datos inicializada correctamente');
        } catch (error) {
            console.error('Error inicializando base de datos:', error);
            throw error;
        }
    }

    /**
     * Convierte métodos de callback a promesas
     * @param {Function} method - Método a promisificar
     * @returns {Function} Método promisificado
     */
    promisify(method) {
        return function(...args) {
            return new Promise((resolve, reject) => {
                method.call(this, ...args, function(err, result) {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        }.bind(this.db);
    }

    /**
     * Crea las tablas necesarias en la base de datos
     * @returns {Promise<void>}
     */
    async createTables() {
        const createWebsitesTable = `
            CREATE TABLE IF NOT EXISTS websites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL UNIQUE,
                domain TEXT NOT NULL,
                last_visited TIMESTAMP,
                visit_count INTEGER DEFAULT 0,
                avg_cookies_collected INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                category TEXT DEFAULT 'general',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createNavigationSessionsTable = `
            CREATE TABLE IF NOT EXISTS navigation_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                profile_id TEXT NOT NULL,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                target_cookies INTEGER,
                cookies_collected INTEGER DEFAULT 0,
                sites_visited INTEGER DEFAULT 0,
                status TEXT DEFAULT 'running',
                error_log TEXT
            )
        `;

        const createSiteVisitsTable = `
            CREATE TABLE IF NOT EXISTS site_visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                website_id INTEGER NOT NULL,
                visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                pages_viewed INTEGER DEFAULT 1,
                duration_seconds INTEGER,
                cookies_before INTEGER,
                cookies_after INTEGER,
                success BOOLEAN DEFAULT true,
                error_message TEXT,
                FOREIGN KEY (website_id) REFERENCES websites(id)
            )
        `;

        await this.db.runAsync(createWebsitesTable);
        await this.db.runAsync(createNavigationSessionsTable);
        await this.db.runAsync(createSiteVisitsTable);
    }

    /**
     * Obtiene el número total de sitios web en la base de datos
     * @returns {Promise<number>} Cantidad de sitios web
     */
    async getWebsiteCount() {
        const result = await this.db.getAsync('SELECT COUNT(*) as count FROM websites');
        return result.count;
    }

    /**
     * Obtiene un sitio web aleatorio de la base de datos
     * @param {Array<string>} excludeUrls - URLs a excluir de la selección
     * @returns {Promise<Object>} Sitio web seleccionado
     */
    async getRandomWebsite(excludeUrls = []) {
        try {
            let query = 'SELECT * FROM websites WHERE status = "active"';
            const params = [];

            if (excludeUrls.length > 0) {
                const placeholders = excludeUrls.map(() => '?').join(',');
                query += ` AND url NOT IN (${placeholders})`;
                params.push(...excludeUrls);
            }

            query += ' ORDER BY RANDOM() LIMIT 1';

            const website = await this.db.getAsync(query, params);
            
            if (!website) {
                throw new Error('No se encontraron sitios web disponibles');
            }

            return website;
        } catch (error) {
            console.error('Error obteniendo sitio web aleatorio:', error);
            throw error;
        }
    }

    /**
     * Obtiene múltiples sitios web aleatorios
     * @param {number} count - Cantidad de sitios a obtener
     * @param {Array<string>} excludeUrls - URLs a excluir
     * @returns {Promise<Array>} Lista de sitios web
     */
    async getRandomWebsites(count, excludeUrls = []) {
        try {
            let query = 'SELECT * FROM websites WHERE status = "active"';
            const params = [];

            if (excludeUrls.length > 0) {
                const placeholders = excludeUrls.map(() => '?').join(',');
                query += ` AND url NOT IN (${placeholders})`;
                params.push(...excludeUrls);
            }

            query += ` ORDER BY RANDOM() LIMIT ${count}`;

            const websites = await this.db.allAsync(query, params);
            return websites;
        } catch (error) {
            console.error('Error obteniendo sitios web aleatorios:', error);
            throw error;
        }
    }

    /**
     * Actualiza las estadísticas de visita de un sitio web
     * @param {string} url - URL del sitio web
     * @param {number} cookiesCollected - Cantidad de cookies recolectadas
     * @returns {Promise<void>}
     */
    async updateWebsiteStats(url, cookiesCollected) {
        try {
            const query = `
                UPDATE websites 
                SET visit_count = visit_count + 1,
                    avg_cookies_collected = CASE 
                        WHEN visit_count = 0 THEN ?
                        ELSE (avg_cookies_collected * visit_count + ?) / (visit_count + 1)
                    END,
                    last_visited = CURRENT_TIMESTAMP
                WHERE url = ?
            `;
            
            await this.db.runAsync(query, [cookiesCollected, cookiesCollected, url]);
        } catch (error) {
            console.error('Error actualizando estadísticas del sitio:', error);
            throw error;
        }
    }

    /**
     * Pobla la base de datos con sitios web iniciales
     * @returns {Promise<void>}
     */
    async seedInitialWebsites() {
        console.log(`📂 Cargando ${initialWebsites.length} sitios web iniciales...`);
        
        let insertedCount = 0;
        let skippedCount = 0;
        
        for (const site of initialWebsites) {
            try {
                const result = await this.db.runAsync(
                    'INSERT OR IGNORE INTO websites (url, domain, category) VALUES (?, ?, ?)',
                    [site.url, site.domain, site.category]
                );
                
                if (result.changes > 0) {
                    insertedCount++;
                } else {
                    skippedCount++;
                }
            } catch (error) {
                console.error(`Error insertando sitio ${site.url}:`, error);
            }
        }
        
        console.log(`✅ Sitios web iniciales cargados: ${insertedCount} nuevos, ${skippedCount} ya existían`);
    }

    //#region REPORTES
    /**
     * Obtiene reportes de sesiones de navegación con paginación y filtros
     * @param {Object} filters - Filtros de búsqueda
     * @param {number} page - Página actual (empezando en 1)
     * @param {number} limit - Cantidad de registros por página
     * @returns {Promise<Object>} Resultado con datos y metadatos de paginación
     */
    async getNavigationReports(filters = {}, page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;
            
            // Construir consulta base con filtros
            let whereClause = 'WHERE 1=1';
            const params = [];
            const countParams = [];
            
            // Filtro por rango de fechas
            if (filters.dateRange) {
                switch (filters.dateRange) {
                    case 'today':
                        whereClause += ' AND DATE(started_at) = DATE("now")';
                        break;
                    case 'week':
                        whereClause += ' AND DATE(started_at) >= DATE("now", "-7 days")';
                        break;
                    case 'month':
                        whereClause += ' AND DATE(started_at) >= DATE("now", "-30 days")';
                        break;
                    case 'all':
                        // No aplicar filtro
                        break;
                    case 'custom':
                        if (filters.startDate) {
                            whereClause += ' AND DATE(started_at) >= ?';
                            params.push(filters.startDate);
                            countParams.push(filters.startDate);
                        }
                        if (filters.endDate) {
                            whereClause += ' AND DATE(started_at) <= ?';
                            params.push(filters.endDate);
                            countParams.push(filters.endDate);
                        }
                        break;
                }
            }
            
            // Filtro por estado
            if (filters.status && filters.status !== 'all') {
                whereClause += ' AND status = ?';
                params.push(filters.status);
                countParams.push(filters.status);
            }
            
            // Filtro por perfil
            if (filters.profileId) {
                whereClause += ' AND profile_id LIKE ?';
                params.push(`%${filters.profileId}%`);
                countParams.push(`%${filters.profileId}%`);
            }
            
            // Consulta principal con datos calculados
            const query = `
                SELECT 
                    session_id,
                    profile_id,
                    started_at,
                    completed_at,
                    target_cookies,
                    cookies_collected,
                    sites_visited,
                    status,
                    error_log,
                    -- Calcular duración en segundos
                    CASE 
                        WHEN completed_at IS NOT NULL 
                        THEN (julianday(completed_at) - julianday(started_at)) * 86400
                        ELSE 0
                    END as duration_seconds,
                    -- Calcular porcentaje de éxito
                    CASE 
                        WHEN target_cookies > 0 
                        THEN ROUND((CAST(cookies_collected AS REAL) / target_cookies) * 100, 2)
                        ELSE 0
                    END as success_percentage
                FROM navigation_sessions 
                ${whereClause}
                ORDER BY started_at DESC
                LIMIT ? OFFSET ?
            `;
            
            params.push(limit, offset);
            
            // Consulta para contar total de registros
            const countQuery = `SELECT COUNT(*) as total FROM navigation_sessions ${whereClause}`;
            
            // Ejecutar consultas
            const [sessions, countResult] = await Promise.all([
                this.db.allAsync(query, params),
                this.db.getAsync(countQuery, countParams)
            ]);
            
            // Formatear datos para la UI
            const formattedSessions = sessions.map(session => ({
                ...session,
                duration_formatted: this.formatDuration(session.duration_seconds),
                started_at_formatted: this.formatDateTime(session.started_at),
                completed_at_formatted: session.completed_at ? this.formatDateTime(session.completed_at) : null,
                status_label: this.getStatusLabel(session.status)
            }));
            
            // Calcular metadatos de paginación
            const total = countResult.total;
            const totalPages = Math.ceil(total / limit);
            
            return {
                success: true,
                data: formattedSessions,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalRecords: total,
                    recordsPerPage: limit,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            };
            
        } catch (error) {
            console.error('Error obteniendo reportes:', error.message);
            return {
                success: false,
                error: error.message,
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
    }

    /**
     * Obtiene estadísticas resumidas de reportes
     * @param {Object} filters - Filtros de búsqueda  
     * @returns {Promise<Object>} Estadísticas resumidas
     */
    async getReportsSummary(filters = {}) {
        try {
            // Usar los mismos filtros que en getNavigationReports
            let whereClause = 'WHERE 1=1';
            const params = [];
            
            // Aplicar filtros (mismo código que arriba)
            if (filters.dateRange) {
                switch (filters.dateRange) {
                    case 'today':
                        whereClause += ' AND DATE(started_at) = DATE("now")';
                        break;
                    case 'week':
                        whereClause += ' AND DATE(started_at) >= DATE("now", "-7 days")';
                        break;
                    case 'month':
                        whereClause += ' AND DATE(started_at) >= DATE("now", "-30 days")';
                        break;
                    case 'custom':
                        if (filters.startDate) {
                            whereClause += ' AND DATE(started_at) >= ?';
                            params.push(filters.startDate);
                        }
                        if (filters.endDate) {
                            whereClause += ' AND DATE(started_at) <= ?';
                            params.push(filters.endDate);
                        }
                        break;
                }
            }
            
            if (filters.status && filters.status !== 'all') {
                whereClause += ' AND status = ?';
                params.push(filters.status);
            }
            
            if (filters.profileId) {
                whereClause += ' AND profile_id LIKE ?';
                params.push(`%${filters.profileId}%`);
            }
            
            const summaryQuery = `
                SELECT 
                    COUNT(*) as total_sessions,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
                    COUNT(CASE WHEN status = 'stopped' THEN 1 END) as stopped_sessions,
                    COUNT(CASE WHEN status = 'error' THEN 1 END) as error_sessions,
                    COUNT(CASE WHEN status = 'running' THEN 1 END) as running_sessions,
                    SUM(cookies_collected) as total_cookies,
                    SUM(sites_visited) as total_sites,
                    AVG(cookies_collected) as avg_cookies_per_session,
                    AVG(
                        CASE 
                            WHEN completed_at IS NOT NULL 
                            THEN (julianday(completed_at) - julianday(started_at)) * 86400
                            ELSE 0
                        END
                    ) as avg_duration_seconds
                FROM navigation_sessions 
                ${whereClause}
            `;
            
            const summary = await this.db.getAsync(summaryQuery, params);
            
            return {
                success: true,
                summary: {
                    ...summary,
                    success_rate: summary.total_sessions > 0 ? 
                        Math.round((summary.completed_sessions / summary.total_sessions) * 100) : 0,
                    avg_duration_formatted: this.formatDuration(summary.avg_duration_seconds || 0)
                }
            };
            
        } catch (error) {
            console.error('Error obteniendo resumen de reportes:', error.message);
            return {
                success: false,
                error: error.message,
                summary: {}
            };
        }
    }

    /**
     * Formatea duración en segundos a formato legible
     * @param {number} seconds - Duración en segundos
     * @returns {string} Duración formateada
     */
    formatDuration(seconds) {
        if (!seconds || seconds < 1) return '0s';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    /**
     * Formatea fecha y hora para mostrar en la UI
     * @param {string} datetime - Fecha en formato ISO
     * @returns {string} Fecha formateada
     */
    formatDateTime(datetime) {
        if (!datetime) return '';
        
        const date = new Date(datetime);
        return date.toLocaleString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * Obtiene etiqueta legible para el estado
     * @param {string} status - Estado de la sesión
     * @returns {string} Etiqueta legible
     */
    getStatusLabel(status) {
        const labels = {
            'running': 'En ejecución',
            'completed': 'Completado',
            'stopped': 'Detenido',
            'error': 'Error'
        };
        
        return labels[status] || status;
    }
    //#endregion REPORTES

    /**
     * Cierra la conexión a la base de datos
     * @returns {Promise<void>}
     */
    async close() {
        if (this.db) {
            await new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            this.db = null;
        }
    }
}

export default DatabaseManager;