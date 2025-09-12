#!/usr/bin/env node

import { Command } from 'commander';
import AdsPowerManager from './core/adspower/AdsPowerManager.js';
import DatabaseManager from './core/database/DatabaseManager.js';
import ConfigManager from './core/config/ConfigManager.js';
import NavigationController from './core/navigation/NavigationController.js';

const program = new Command();

/**
 * Aplicación principal CLI para el sistema de pruebas de carga web
 */
class LoadTestCLI {
    constructor() {
        this.configManager = new ConfigManager();
        this.adsPowerManager = new AdsPowerManager();
        this.databaseManager = new DatabaseManager();
        this.navigationController = null; // Se inicializa después de cargar config
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
            .name('load-test-cli')
            .description('Sistema automatizado de pruebas de carga web')
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

        // Comando para probar detección de cookies en un sitio
        program
            .command('test-cookies')
            .description('Prueba la detección de cookies en un sitio específico')
            .argument('<profileId>', 'ID del perfil a usar')
            .option('-u, --url <url>', 'URL específica a probar (opcional)')
            .action(async (profileId, options) => {
                await this.testCookieDetection(profileId, options.url);
            });

        // Comando para iniciar navegación automatizada
        program
            .command('start-navigation')
            .description('Inicia navegación automatizada para recolectar cookies')
            .argument('<profileId>', 'ID del perfil a usar')
            .option('-c, --cookies <number>', 'Cantidad objetivo de cookies', '2500')
            .action(async (profileId, options) => {
                await this.startAutomaticNavigation(profileId, parseInt(options.cookies));
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
     * Verifica el estado de Ads Power
     */
    async checkAdsPowerStatus() {
        try {
            console.log('Verificando estado de Ads Power...');
            const isAvailable = await this.adsPowerManager.checkAdsPowerStatus();
            
            if (isAvailable) {
                console.log('✅ Ads Power está ejecutándose y disponible');
            } else {
                console.log('❌ Ads Power no está disponible');
                console.log('Asegúrate de que Ads Power esté ejecutándose en el puerto 50325');
            }
        } catch (error) {
            console.error('Error verificando Ads Power:', error.message);
        }
    }

    /**
     * Lista todos los perfiles disponibles
     */
    async listProfiles() {
        try {
            console.log('Obteniendo lista de perfiles...');
            const profiles = await this.adsPowerManager.getAvailableProfiles();
            
            if (profiles.length === 0) {
                console.log('No se encontraron perfiles disponibles');
                return;
            }

            console.log(`\nPerfiles disponibles (${profiles.length}):`);
            console.log('─'.repeat(60));
            
            profiles.forEach(profile => {
                console.log(`ID: ${profile.user_id || profile.serial_number || 'N/A'}`);
                console.log(`Nombre: ${profile.name || 'Sin nombre'}`);
                console.log(`Estado: ${profile.status || 'Desconocido'}`);
                console.log('─'.repeat(30));
            });
        } catch (error) {
            console.error('Error obteniendo perfiles:', error.message);
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
     * Prueba detección de cookies en un sitio
     * @param {string} profileId - ID del perfil a usar
     * @param {string} url - URL específica a probar (opcional)
     */
    async testCookieDetection(profileId, url = null) {
        let browserInstance = null;
        
        try {
            console.log(`🧪 Probando detección de cookies con perfil ${profileId}`);
            
            // Iniciar perfil
            browserInstance = await this.adsPowerManager.startProfile(profileId);
            const { page } = browserInstance;
            
            // Obtener sitio a probar
            let testSite;
            if (url) {
                testSite = { url, domain: new URL(url).hostname };
                console.log(`Probando URL específica: ${url}`);
            } else {
                testSite = await this.databaseManager.getRandomWebsite();
                console.log(`Probando sitio aleatorio: ${testSite.domain}`);
            }
            
            // Contar cookies iniciales
            const initialCookies = await this.navigationController.cookieDetector.getCookieCount(page);
            console.log(`Cookies iniciales: ${initialCookies}`);
            
            // Navegar al sitio
            console.log(`\n📱 Navegando a: ${testSite.url}`);
            await page.goto(testSite.url, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
            // Probar detección de cookies
            const cookieResult = await this.navigationController.cookieDetector.acceptCookies(page);
            
            // Contar cookies finales
            const finalCookies = await this.navigationController.cookieDetector.getCookieCount(page);
            const cookiesGained = finalCookies - initialCookies;
            
            console.log('\n📊 Resultados:');
            console.log(`   Éxito: ${cookieResult.success ? '✅' : '❌'}`);
            console.log(`   Método: ${cookieResult.method || 'N/A'}`);
            console.log(`   Botón encontrado: ${cookieResult.buttonText || 'N/A'}`);
            console.log(`   Intentos: ${cookieResult.attempts || 0}`);
            console.log(`   Cookies ganadas: ${cookiesGained}`);
            
            if (!cookieResult.success) {
                console.log(`   Razón: ${cookieResult.reason}`);
            }

        } catch (error) {
            console.error('Error en prueba de detección:', error.message);
        } finally {
            if (browserInstance) {
                await this.adsPowerManager.stopProfile(profileId);
            }
        }
    }

    /**
     * NUEVA FUNCIONALIDAD: Inicia navegación automatizada
     * @param {string} profileId - ID del perfil a usar
     * @param {number} targetCookies - Cantidad objetivo de cookies
     */
    async startAutomaticNavigation(profileId, targetCookies) {
        let browserInstance = null;
        
        try {
            console.log(`🚀 Iniciando navegación automatizada con perfil ${profileId}`);
            console.log(`🎯 Objetivo: ${targetCookies} cookies`);
            
            // Iniciar perfil
            browserInstance = await this.adsPowerManager.startProfile(profileId);
            
            // Configurar manejo de interrupción
            let interrupted = false;
            process.on('SIGINT', () => {
                console.log('\n⏹️  Interrupción solicitada. Finalizando sesión...');
                interrupted = true;
            });
            
            // Iniciar sesión de navegación
            const sessionResult = await this.navigationController.startNavigationSession(
                browserInstance, 
                targetCookies
            );
            
            if (!interrupted) {
                console.log('\n🏁 Sesión completada:');
                console.log(`   ✅ Éxito: ${sessionResult.success}`);
                console.log(`   🍪 Cookies recolectadas: ${sessionResult.cookiesCollected}`);
                console.log(`   🎯 Objetivo alcanzado: ${sessionResult.targetReached ? 'Sí' : 'No'}`);
                console.log(`   📊 Sitios visitados: ${sessionResult.stats.sitesVisited}`);
                console.log(`   ✅ Avisos aceptados: ${sessionResult.stats.cookiesAccepted}`);
                console.log(`   ❌ Errores: ${sessionResult.stats.errors}`);
                console.log(`   ⏱️  Duración: ${Math.round(sessionResult.duration / 1000)}s`);
            }

        } catch (error) {
            console.error('Error en navegación automatizada:', error.message);
        } finally {
            if (browserInstance) {
                console.log('\n🧹 Cerrando perfil...');
                await this.adsPowerManager.stopProfile(profileId);
            }
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

            console.log(`\nSitios web obtenidos (${websites.length}):`);
            console.log('─'.repeat(80));
            
            websites.forEach((site, index) => {
                console.log(`${index + 1}. ${site.url}`);
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
const app = new LoadTestCLI();
app.run().catch(error => {
    console.error('Error fatal:', error.message);
    process.exit(1);
});