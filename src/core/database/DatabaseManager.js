import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Gestor de base de datos SQLite para el sistema
 * Maneja sitios web, sesiones de navegación y patrones aprendidos
 */
class DatabaseManager {
    constructor(dbPath = null) {
        this.dbPath = dbPath || join(__dirname, '../../../data/loadtest.db');
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
        const initialWebsites = [
            // Sitios de noticias
            { url: 'https://www.bbc.com', domain: 'bbc.com', category: 'news' },
            { url: 'https://www.cnn.com', domain: 'cnn.com', category: 'news' },
            { url: 'https://www.theguardian.com', domain: 'theguardian.com', category: 'news' },
            
            // Sitios de e-commerce
            { url: 'https://www.walmart.com', domain: 'walmart.com', category: 'ecommerce' },
            
            
            // Sitios generales
            { url: 'https://www.stackoverflow.com', domain: 'stackoverflow.com', category: 'tech' },
        ];

        for (const site of initialWebsites) {
            try {
                await this.db.runAsync(
                    'INSERT OR IGNORE INTO websites (url, domain, category) VALUES (?, ?, ?)',
                    [site.url, site.domain, site.category]
                );
            } catch (error) {
                console.warn(`Error insertando sitio ${site.url}:`, error.message);
            }
        }

        console.log(`Insertados ${initialWebsites.length} sitios web iniciales`);
    }

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