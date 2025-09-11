import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Gestor de configuración del sistema
 * Maneja la carga y validación de configuraciones
 */
class ConfigManager {
    constructor() {
        this.configPath = join(__dirname, '../../../config/config.json');
        this.config = this.getDefaultConfig();
    }

    /**
     * Obtiene la configuración por defecto
     * @returns {Object} Configuración por defecto
     */
    getDefaultConfig() {
        return {
            adspower: {
                baseUrl: 'http://local.adspower.com:50325/api/v1',
                timeout: 30000,
                retryAttempts: 3
            },
            navigation: {
                defaultCookieTarget: 2500,
                maxPagesPerSite: 10,
                minTimePerPage: 2000,
                maxTimePerPage: 15000,
                scrollDepthMin: 0.3,
                scrollDepthMax: 0.9
            },
            database: {
                path: './data/loadtest.db',
                backupInterval: 24 * 60 * 60 * 1000, // 24 horas en ms
                maxRetries: 3
            },
            logging: {
                level: 'info',
                saveToFile: true,
                maxLogFiles: 5
            }
        };
    }

    /**
     * Carga la configuración desde archivo
     * @returns {Promise<void>}
     */
    async loadConfig() {
        try {
            // Crear directorio de configuración si no existe
            const configDir = dirname(this.configPath);
            await fs.mkdir(configDir, { recursive: true });

            // Intentar cargar archivo de configuración
            try {
                const configData = await fs.readFile(this.configPath, 'utf8');
                const loadedConfig = JSON.parse(configData);
                
                // Fusionar con configuración por defecto
                this.config = this.mergeConfig(this.getDefaultConfig(), loadedConfig);
                
                console.log('Configuración cargada desde archivo');
            } catch (error) {
                if (error.code === 'ENOENT') {
                    // Archivo no existe, crear uno nuevo con configuración por defecto
                    await this.saveConfig();
                    console.log('Archivo de configuración creado con valores por defecto');
                } else {
                    throw error;
                }
            }

            // Validar configuración
            this.validateConfig();
            
        } catch (error) {
            console.error('Error cargando configuración:', error.message);
            console.log('Usando configuración por defecto');
        }
    }

    /**
     * Guarda la configuración actual al archivo
     * @returns {Promise<void>}
     */
    async saveConfig() {
        try {
            const configDir = dirname(this.configPath);
            await fs.mkdir(configDir, { recursive: true });
            
            await fs.writeFile(
                this.configPath, 
                JSON.stringify(this.config, null, 4),
                'utf8'
            );
            
            console.log('Configuración guardada');
        } catch (error) {
            console.error('Error guardando configuración:', error.message);
            throw error;
        }
    }

    /**
     * Fusiona configuraciones de forma recursiva
     * @param {Object} defaultConfig - Configuración por defecto
     * @param {Object} userConfig - Configuración del usuario
     * @returns {Object} Configuración fusionada
     */
    mergeConfig(defaultConfig, userConfig) {
        const merged = { ...defaultConfig };
        
        for (const key in userConfig) {
            if (userConfig[key] !== null && typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
                merged[key] = this.mergeConfig(defaultConfig[key] || {}, userConfig[key]);
            } else {
                merged[key] = userConfig[key];
            }
        }
        
        return merged;
    }

    /**
     * Valida la configuración cargada
     * @throws {Error} Si la configuración es inválida
     */
    validateConfig() {
        const requiredFields = [
            'adspower.baseUrl',
            'navigation.defaultCookieTarget',
            'database.path'
        ];

        for (const field of requiredFields) {
            if (!this.getNestedValue(this.config, field)) {
                throw new Error(`Campo de configuración requerido faltante: ${field}`);
            }
        }

        // Validaciones específicas
        if (this.config.navigation.defaultCookieTarget < 1) {
            throw new Error('defaultCookieTarget debe ser mayor a 0');
        }

        if (this.config.navigation.minTimePerPage >= this.config.navigation.maxTimePerPage) {
            throw new Error('minTimePerPage debe ser menor que maxTimePerPage');
        }

        if (this.config.navigation.scrollDepthMin >= this.config.navigation.scrollDepthMax) {
            throw new Error('scrollDepthMin debe ser menor que scrollDepthMax');
        }
    }

    /**
     * Obtiene un valor anidado usando notación de punto
     * @param {Object} obj - Objeto a consultar
     * @param {string} path - Ruta del valor (ej: 'adspower.baseUrl')
     * @returns {*} Valor encontrado o undefined
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Obtiene la configuración completa
     * @returns {Object} Configuración actual
     */
    getConfig() {
        return this.config;
    }

    /**
     * Obtiene una sección específica de la configuración
     * @param {string} section - Nombre de la sección
     * @returns {Object} Sección de configuración
     */
    getSection(section) {
        return this.config[section] || {};
    }

    /**
     * Actualiza un valor de configuración
     * @param {string} path - Ruta del valor a actualizar
     * @param {*} value - Nuevo valor
     */
    updateConfig(path, value) {
        const keys = path.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    /**
     * Obtiene la URL base de Ads Power
     * @returns {string} URL base
     */
    getAdsPowerUrl() {
        return this.config.adspower.baseUrl;
    }

    /**
     * Obtiene el objetivo de cookies por defecto
     * @returns {number} Cantidad objetivo de cookies
     */
    getDefaultCookieTarget() {
        return this.config.navigation.defaultCookieTarget;
    }

    /**
     * Obtiene la ruta de la base de datos
     * @returns {string} Ruta de la base de datos
     */
    getDatabasePath() {
        return this.config.database.path;
    }

    /**
     * Obtiene los parámetros de navegación
     * @returns {Object} Configuración de navegación
     */
    getNavigationParams() {
        return this.config.navigation;
    }
}

export default ConfigManager;