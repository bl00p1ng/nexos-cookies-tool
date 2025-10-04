#!/usr/bin/env node

import { Command } from 'commander';
import AdsPowerManager from './core/adspower/AdsPowerManager.js';
import DatabaseManager from './core/database/DatabaseManager.js';
import ConfigManager from './core/config/ConfigManager.js';
import NavigationController from './core/navigation/NavigationController.js';
import CsvLoader from './core/database/CsvLoader.js';

const program = new Command();

/**
 * Aplicación principal CLI para el sistema de pruebas de carga web
 * Soporta múltiples perfiles simultáneos
 */
class CookiesTool {
    constructor() {
        this.configManager = new ConfigManager();
        this.adsPowerManager = new AdsPowerManager(this.configManager);
        this.databaseManager = new DatabaseManager();
        this.csvLoader = new CsvLoader(this.databaseManager);
        this.navigationController = null; // Se inicializa después de cargar config
        
        // Hacer AdsPowerManager accesible globalmente para NavigationController
        global.adsPowerManager = this.adsPowerManager;
    }

    /**
     * Inicializa la aplicación y configura los comandos CLI
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            // Cargar configuración
            await this.configManager.loadConfig();
            
            // Inicializar base de datos
            await this.databaseManager.initialize();
            
            // Inicializar controlador de navegación
            this.navigationController = new NavigationController(
                this.databaseManager, 
                this.configManager
            );
            
            this.setupCommands();
            
        } catch (error) {
            console.error('Error inicializando aplicación:', error.message);
            process.exit(1);
        }
    }

    /**
     * Configura los comandos disponibles en la CLI
     */
    setupCommands() {
        program
            .name('nexus-cookies-tool')
            .version('1.0.0');

        // Comando para verificar estado de Ads Power
        program
            .command('check-adspower')
            .description('Verifica si Ads Power está ejecutándose')
            .action(async () => {
                await this.checkAdsPowerStatus();
            });

        // Comando para listar perfiles disponibles
        program
            .command('list-profiles')
            .description('Lista todos los perfiles disponibles en Ads Power')
            .action(async () => {
                await this.listProfiles();
            });

        // Comando para obtener información de un perfil específico
        program
            .command('profile-info')
            .description('Obtiene información detallada de un perfil')
            .argument('<profileId>', 'ID del perfil')
            .action(async (profileId) => {
                await this.getProfileInfo(profileId);
            });

        // Comando para iniciar un perfil
        program
            .command('start-profile')
            .description('Inicia un perfil específico de Ads Power')
            .argument('<profileId>', 'ID del perfil a iniciar')
            .action(async (profileId) => {
                await this.startProfile(profileId);
            });

        // Comando para detener un perfil
        program
            .command('stop-profile')
            .description('Detiene un perfil específico')
            .argument('<profileId>', 'ID del perfil a detener')
            .action(async (profileId) => {
                await this.stopProfile(profileId);
            });

        // Comando para iniciar navegación
        program
            .command('start-navigation')
            .description('Inicia navegación automatizada para recolectar cookies')
            .argument('<profileIds>', 'ID(s) de perfiles separados por comas (ej: profile1,profile2,profile3)')
            .option('-c, --cookies <number>', 'Cantidad objetivo de cookies por perfil', '2500')
            .option('--validate-profiles', 'Validar que todos los perfiles existen antes de iniciar', false)
            .action(async (profileIds, options) => {
                await this.startMultipleNavigation(profileIds, options);
            });

        // Comando para cargar sitios web desde CSV
        program
            .command('load-csv')
            .description('Carga sitios web desde un archivo CSV')
            .argument('<csvFile>', 'Ruta al archivo CSV')
            .option('-o, --overwrite', 'Sobrescribe sitios existentes', false)
            .option('-a, --allow-duplicates', 'Permite URLs duplicadas', false)
            .option('-s, --skip-validation', 'Omite validación de URLs', false)
            .option('-b, --batch-size <number>', 'Tamaño del lote para inserciones', '100')
            .action(async (csvFile, options) => {
                await this.loadSitesFromCsv(csvFile, options);
            });

        // Comando para obtener sitios web aleatorios de la DB
        program
            .command('get-random-sites')
            .description('Obtiene sitios web aleatorios de la base de datos')
            .option('-c, --count <number>', 'Cantidad de sitios a obtener', '5')
            .action(async (options) => {
                await this.getRandomSites(parseInt(options.count));
            });

        // Comando para mostrar estadísticas de la base de datos
        program
            .command('db-stats')
            .description('Muestra estadísticas de la base de datos')
            .action(async () => {
                await this.showDatabaseStats();
            });

        // Comando para limpiar y salir
        program
            .command('cleanup')
            .description('Detiene todos los perfiles activos y limpia recursos')
            .action(async () => {
                await this.cleanup();
            });
    }

    /**
     * Inicia navegación con múltiples perfiles
     * @param {string} profileIdsString - IDs separados por comas
     * @param {Object} options - Opciones del comando
     */
    async startMultipleNavigation(profileIdsString, options) {
        try {
            // Parsear IDs de perfiles
            const profileIds = this.parseProfileIds(profileIdsString);
            const targetCookies = parseInt(options.cookies);
            
            console.log('🚀 INICIANDO NAVEGACIÓN MÚLTIPLE');
            console.log('═'.repeat(50));
            console.log(`📋 Perfiles: ${profileIds.length}`);
            console.log(`🎯 Objetivo por perfil: ${targetCookies} cookies`);
            console.log(`📊 Total objetivo: ${targetCookies * profileIds.length} cookies`);
            
            // Validar perfiles si se solicita
            if (options.validateProfiles) {
                await this.validateProfiles(profileIds);
            }
            
            // Configurar manejo graceful de interrupción
            this.setupGracefulShutdown();
            
            // Verificar recursos del sistema
            this.checkSystemResources(profileIds.length);
            
            console.log('\n⏳ Iniciando sesiones...');
            
            // Llamar al NavigationController para manejar múltiples sesiones
            const results = await this.navigationController.startMultipleNavigationSessions(
                profileIds, 
                targetCookies
            );
            
            // Mostrar resumen final
            this.showExecutionSummary(results);
            
            return results;
            
        } catch (error) {
            console.error('❌ Error en navegación múltiple:', error.message);
            
            // Intentar cleanup en caso de error
            try {
                await this.cleanup();
            } catch (cleanupError) {
                console.error('Error en cleanup:', cleanupError.message);
            }
            
            process.exit(1);
        }
    }

    /**
     * Parsea string de IDs a array, removiendo espacios y duplicados
     * @param {string} profileIdsString - IDs separados por comas
     * @returns {Array<string>} Array de IDs únicos
     */
    parseProfileIds(profileIdsString) {
        if (!profileIdsString || profileIdsString.trim() === '') {
            throw new Error('Debe proporcionar al menos un ID de perfil');
        }
        
        const profileIds = profileIdsString
            .split(',')
            .map(id => id.trim())
            .filter(id => id.length > 0);
        
        // Remover duplicados
        const uniqueIds = [...new Set(profileIds)];
        
        if (uniqueIds.length === 0) {
            throw new Error('No se encontraron IDs válidos de perfiles');
        }
        
        if (uniqueIds.length > 10) {
            console.warn('⚠️  Advertencia: Usar más de 10 perfiles puede consumir recursos excesivos');
        }
        
        return uniqueIds;
    }

    /**
     * Valida que todos los perfiles existen en AdsPower
     * @param {Array<string>} profileIds - IDs de perfiles a validar
     */
    async validateProfiles(profileIds) {
        console.log('🔍 Validando perfiles...');
        
        try {
            const availableProfiles = await this.adsPowerManager.getAvailableProfiles();
            const availableIds = availableProfiles.map(p => p.user_id || p.serial_number);
            
            const invalidProfiles = profileIds.filter(id => !availableIds.includes(id));
            
            if (invalidProfiles.length > 0) {
                console.error(`❌ Perfiles no encontrados: ${invalidProfiles.join(', ')}`);
                console.log('\n📋 Perfiles disponibles:');
                availableProfiles.forEach(profile => {
                    console.log(`   • ${profile.user_id || profile.serial_number} - ${profile.name || 'Sin nombre'}`);
                });
                throw new Error('Algunos perfiles no existen en AdsPower');
            }
            
            console.log('✅ Todos los perfiles son válidos');
            
        } catch (error) {
            if (error.message.includes('no existen')) {
                throw error;
            }
            console.warn('⚠️  No se pudo validar perfiles, continuando...', error.message);
        }
    }

    /**
     * Verifica recursos del sistema y muestra advertencias
     * @param {number} profileCount - Cantidad de perfiles a ejecutar
     */
    checkSystemResources(profileCount) {
        const estimatedRAM = profileCount * 300; // 300MB por perfil según specs
        
        console.log('\n💻 VERIFICACIÓN DE RECURSOS:');
        console.log(`   📊 Perfiles: ${profileCount}`);
        console.log(`   🧠 RAM estimada: ~${estimatedRAM}MB`);
        
        if (estimatedRAM > 2000) {
            console.warn('⚠️  ADVERTENCIA: Alto consumo de RAM estimado');
            console.log('   💡 Recomendación: Monitorear uso de memoria durante ejecución');
        }
        
        if (profileCount > 5) {
            console.warn('⚠️  ADVERTENCIA: Más de 5 perfiles simultáneos');
            console.log('   💡 Recomendación: Verificar que el hardware puede manejar la carga');
        }
    }

    /**
     * Configura manejo graceful de interrupción (Ctrl+C)
     */
    setupGracefulShutdown() {
        const gracefulShutdown = async () => {
            console.log('\n\n🛑 INTERRUPCIÓN DETECTADA');
            console.log('⏳ Deteniendo sesiones activas...');
            
            try {
                await this.cleanup();
                console.log('✅ Cleanup completado');
                process.exit(0);
            } catch (error) {
                console.error('❌ Error en shutdown:', error.message);
                process.exit(1);
            }
        };
        
        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);
    }

    /**
     * Muestra resumen de ejecución
     * @param {Object} results - Resultados de la navegación
     */
    showExecutionSummary(results) {
        console.log('\n🎊 EJECUCIÓN COMPLETADA');
        console.log('═'.repeat(60));
        console.log(`⏱️  Tiempo total: ${(results.duration / 1000 / 60).toFixed(1)} minutos`);
        console.log(`🍪 Cookies por minuto: ${(results.totalCookiesCollected / (results.duration / 1000 / 60)).toFixed(0)}`);
        console.log(`🌐 Sitios por minuto: ${(results.totalSitesVisited / (results.duration / 1000 / 60)).toFixed(1)}`);
        console.log(`📈 Eficiencia: ${results.successRate.toFixed(1)}% de perfiles exitosos`);
        console.log('═'.repeat(60));
        
        if (results.successRate < 100) {
            console.log('\n💡 SUGERENCIAS:');
            console.log('   • Verificar conectividad de red');
            console.log('   • Revisar que AdsPower esté funcionando correctamente');
            console.log('   • Considerar reducir número de perfiles simultáneos');
        }
    }

    /**
     * Verifica el estado de Ads Power
     */
    async checkAdsPowerStatus() {
        try {
            console.log('Verificando estado de Ads Power...');
            const status = await this.adsPowerManager.checkAdsPowerStatus();

            if (status.connected) {
                console.log('✅ Ads Power está ejecutándose y disponible');
                console.log(`   Conectado en: ${status.url}`);
            } else {
                console.log('❌ Ads Power no está disponible');
                console.log(`   ${status.message}`);
                console.log('Asegúrate de que Ads Power esté ejecutándose');
            }
        } catch (error) {
            console.error('Error verificando Ads Power:', error.message);
        }
    }

    /**
     * Obtiene información detallada de un perfil
     * @param {string} profileId - ID del perfil
     */
    async getProfileInfo(profileId) {
        try {
            console.log(`Obteniendo información del perfil ${profileId}...`);
            const profileInfo = await this.adsPowerManager.getProfileInfo(profileId);
            
            console.log('\nInformación del perfil:');
            console.log('─'.repeat(40));
            console.log(JSON.stringify(profileInfo, null, 2));
        } catch (error) {
            console.error('Error obteniendo información del perfil:', error.message);
        }
    }

    /**
     * Inicia un perfil específico
     * @param {string} profileId - ID del perfil a iniciar
     */
    async startProfile(profileId) {
        try {
            console.log(`Iniciando perfil ${profileId}...`);
            const browserInstance = await this.adsPowerManager.startProfile(profileId);
            
            console.log('✅ Perfil iniciado correctamente');
            console.log(`WebSocket: ${browserInstance.wsEndpoint}`);
            console.log(`Página actual: ${await browserInstance.page.url()}`);
            
            // Mantener el perfil activo por un momento para demostración
            console.log('\nPerfil activo. Presiona Ctrl+C para detener...');
            
            // Manejar cierre graceful
            process.on('SIGINT', async () => {
                console.log('\nDeteniendo perfil...');
                await this.adsPowerManager.stopProfile(profileId);
                await this.cleanup();
                process.exit(0);
            });
            
        } catch (error) {
            console.error('Error iniciando perfil:', error.message);
        }
    }

    /**
     * Detiene un perfil específico
     * @param {string} profileId - ID del perfil a detener
     */
    async stopProfile(profileId) {
        try {
            console.log(`Deteniendo perfil ${profileId}...`);
            await this.adsPowerManager.stopProfile(profileId);
            console.log('✅ Perfil detenido correctamente');
        } catch (error) {
            console.error('Error deteniendo perfil:', error.message);
        }
    }

    /**
     * Carga sitios web desde CSV
     * @param {string} csvFile - Ruta al archivo CSV
     * @param {Object} options - Opciones de carga
     */
    async loadSitesFromCsv(csvFile, options) {
        try {
            const loadOptions = {
                overwrite: options.overwrite || false,
                skipDuplicates: !options.allowDuplicates,
                validateUrls: !options.skipValidation,
                batchSize: parseInt(options.batchSize) || 100
            };

            console.log(`📂 Cargando sitios desde CSV: ${csvFile}`);
            console.log('⚙️  Opciones:', JSON.stringify(loadOptions, null, 2));

            const result = await this.csvLoader.loadSitesFromCsv(csvFile, loadOptions);

            if (result.success) {
                console.log('\n🎉 ¡Carga completada exitosamente!');
                console.log(`📊 Resumen: ${result.stats.inserted} insertados, ${result.stats.updated} actualizados`);
                
                // Mostrar nuevas estadísticas de la base de datos
                await this.showDatabaseStats();
            }

        } catch (error) {
            console.error('❌ Error cargando CSV:', error.message);
            
            // Sugerencias de solución
            console.log('\n💡 Sugerencias:');
            console.log('   • Verifica que el archivo CSV existe');
            console.log('   • Asegúrate de que el CSV tenga las columnas: url,domain,category,status');
            console.log('   • Usa --skip-validation si hay problemas con URLs');
            console.log('   • Genera un ejemplo con: npm start -- generate-csv-example');
        }
    }

    /**
     * Genera CSV de ejemplo
     * @param {string} outputPath - Ruta donde guardar
     */
    async generateCsvExample(outputPath) {
        try {
            console.log(`📝 Generando CSV de ejemplo en: ${outputPath}`);
            await this.csvLoader.generateExampleCsv(outputPath);
            
            console.log('\n📋 Estructura del CSV:');
            console.log('   • url: URL completa (ej: https://www.example.com)');
            console.log('   • domain: Solo dominio (ej: example.com)');
            console.log('   • category: news,ecommerce,tech,blog,social,reference,entertainment,finance,sports,general');
            console.log('   • status: active o inactive');
            
            console.log('\n🚀 Para cargar el CSV usa:');
            console.log(`   npm start -- load-csv ${outputPath}`);
            
        } catch (error) {
            console.error('Error generando CSV de ejemplo:', error.message);
        }
    }

    /**
     * Obtiene sitios web aleatorios de la base de datos
     * @param {number} count - Cantidad de sitios a obtener
     */
    async getRandomSites(count) {
        try {
            console.log(`Obteniendo ${count} sitios web aleatorios...`);
            const websites = await this.databaseManager.getRandomWebsites(count);
            
            if (websites.length === 0) {
                console.log('No se encontraron sitios web en la base de datos');
                return;
            }
            
            console.log(`\nSitios web aleatorios (${websites.length}):`);
            console.log('─'.repeat(40));
            
            websites.forEach(site => {
                console.log(`URL: ${site.url}`);
                console.log(`   Dominio: ${site.domain}`);
                console.log(`   Categoría: ${site.category}`);
                console.log(`   Visitas: ${site.visit_count}`);
                console.log(`   Última visita: ${site.last_visited || 'Nunca'}`);
                console.log('─'.repeat(40));
            });
        } catch (error) {
            console.error('Error obteniendo sitios web:', error.message);
        }
    }

    /**
     * Muestra estadísticas de la base de datos
     */
    async showDatabaseStats() {
        try {
            console.log('Obteniendo estadísticas de la base de datos...');
            const websiteCount = await this.databaseManager.getWebsiteCount();
            
            console.log('\nEstadísticas de la base de datos:');
            console.log('─'.repeat(40));
            console.log(`Total de sitios web: ${websiteCount}`);
            
            // Obtener algunos sitios de muestra
            if (websiteCount > 0) {
                const sampleSites = await this.databaseManager.getRandomWebsites(3);
                console.log('\nMuestra de sitios disponibles:');
                sampleSites.forEach(site => {
                    console.log(`• ${site.domain} (${site.category})`);
                });
            }
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error.message);
        }
    }

    /**
     * Limpia recursos y cierra conexiones
     */
    async cleanup() {
        try {
            console.log('Limpiando recursos...');
            
            // Detener todos los perfiles activos
            await this.adsPowerManager.stopAllProfiles();
            
            // Cerrar base de datos
            await this.databaseManager.close();
            
            console.log('✅ Recursos limpiados correctamente');
        } catch (error) {
            console.error('Error en limpieza:', error.message);
        }
    }

    /**
     * Ejecuta la aplicación CLI
     */
    async run() {
        await this.initialize();
        program.parse();
    }
}

// Ejecutar aplicación
const app = new CookiesTool();
app.run().catch(error => {
    console.error('Error fatal:', error.message);
    process.exit(1);
});