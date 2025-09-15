#!/usr/bin/env node

import { Command } from 'commander';
import AdsPowerManager from './core/adspower/AdsPowerManager.js';
import DatabaseManager from './core/database/DatabaseManager.js';
import ConfigManager from './core/config/ConfigManager.js';
import NavigationController from './core/navigation/NavigationController.js';
import HumanBehaviorSimulator from './core/navigation/HumanBehaviorSimulator.js';
import CsvLoader from './core/database/CsvLoader.js';

const program = new Command();

/**
 * Punto de entrada de la App
 */
class CookiesTool {
    constructor() {
        this.configManager = new ConfigManager();
        this.adsPowerManager = new AdsPowerManager();
        this.databaseManager = new DatabaseManager();
        this.csvLoader = new CsvLoader(this.databaseManager);
        this.navigationController = null;
        this.humanBehaviorSimulator = new HumanBehaviorSimulator();
        
        // Estado de sesiones activas
        this.activeSessions = new Map();
        
        // Hacer AdsPowerManager accesible globalmente para NavigationController
        global.adsPowerManager = this.adsPowerManager;
    }

    /**
     * Inicializa la aplicación y configura los comandos CLI
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            console.log('🚀 Inicializando sistema de navegación humana...');
            
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
            console.log('✅ Sistema inicializado correctamente');
            
        } catch (error) {
            console.error('❌ Error inicializando aplicación:', error.message);
            process.exit(1);
        }
    }

    /**
     * Configura los comandos disponibles en la CLI
     */
    setupCommands() {
        program
            .name('load-test-cli')
            .description('Sistema automatizado de pruebas de carga web con comportamiento humano')
            .version('1.0.0');

        // Comando principal de navegación
        program
            .command('start-navigation')
            .description('Inicia navegación automática con comportamiento humano realista')
            .option('-p, --profiles <profiles>', 'IDs de perfiles de Ads Power separados por comas', '')
            .option('-t, --target <number>', 'Cantidad objetivo de cookies', '2500')
            .option('-s, --sites <number>', 'Número máximo de sitios a visitar')
            .option('--fast-test', 'Modo de prueba rápida (ignora tiempo mínimo de 1 hora)')
            .option('--priority <type>', 'Prioridad de navegación (cookies|stealth|balanced)', 'balanced')
            .option('--max-instances <number>', 'Máximo de instancias simultáneas', '5')
            .action(async (options) => {
                await this.startHumanNavigation(options);
            });

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
            .description('Lista todos los perfiles disponibles de Ads Power')
            .action(async () => {
                await this.listProfiles();
            });

        // Comando para obtener información de un perfil específico
        program
            .command('profile-info')
            .argument('<profileId>', 'ID del perfil')
            .description('Obtiene información detallada de un perfil')
            .action(async (profileId) => {
                await this.getProfileInfo(profileId);
            });

        // Comando para probar detección de cookies
        program
            .command('test-cookies')
            .argument('<profileId>', 'ID del perfil a usar')
            .option('-u, --url <url>', 'URL específica a probar')
            .description('Prueba detección y aceptación de cookies en un sitio')
            .action(async (profileId, options) => {
                await this.testCookieDetection(profileId, options.url);
            });

        // Comando para probar comportamiento humano
        program
            .command('test-human-behavior')
            .argument('<profileId>', 'ID del perfil a usar')
            .option('-u, --url <url>', 'URL específica a probar')
            .option('-t, --time <seconds>', 'Tiempo de prueba en segundos', '60')
            .description('Prueba simulación de comportamiento humano en un sitio')
            .action(async (profileId, options) => {
                await this.testHumanBehavior(profileId, options);
            });

        // Comando para cargar CSV
        program
            .command('load-csv')
            .argument('<csvFile>', 'Archivo CSV con sitios web')
            .option('--overwrite', 'Sobrescribir todos los sitios existentes')
            .description('Carga sitios web desde archivo CSV')
            .action(async (csvFile, options) => {
                await this.loadCsvFile(csvFile, options);
            });

        // Comando para generar CSV de ejemplo
        program
            .command('generate-csv-example')
            .option('-o, --output <file>', 'Archivo de salida', 'sitios_ejemplo.csv')
            .description('Genera un archivo CSV de ejemplo')
            .action(async (options) => {
                await this.generateCsvExample(options.output);
            });

        // Comando para obtener sitios aleatorios
        program
            .command('get-random-sites')
            .option('--count <number>', 'Cantidad de sitios', '10')
            .description('Obtiene sitios web aleatorios de la base de datos')
            .action(async (options) => {
                await this.getRandomSites(parseInt(options.count));
            });

        // Comando para estadísticas de base de datos
        program
            .command('db-stats')
            .description('Muestra estadísticas de la base de datos')
            .action(async () => {
                await this.showDatabaseStats();
            });

        // Comando para monitorear sesiones activas
        program
            .command('monitor-sessions')
            .description('Monitorea sesiones de navegación activas')
            .action(async () => {
                await this.monitorActiveSessions();
            });

        // Comando para detener todas las sesiones
        program
            .command('stop-all')
            .description('Detiene todas las sesiones activas')
            .action(async () => {
                await this.stopAllSessions();
            });

        // Comando para limpieza de recursos
        program
            .command('cleanup')
            .description('Detiene todos los perfiles y limpia recursos')
            .action(async () => {
                await this.cleanup();
            });
    }

    /**
     * Inicia navegación automática con comportamiento humano
     * @param {Object} options - Opciones de navegación
     */
    async startHumanNavigation(options) {
        try {
            console.log('🧠 Iniciando navegación con comportamiento humano avanzado...');
            
            // Validar y procesar parámetros
            const targetCookies = parseInt(options.target) || 2500;
            const fastTest = options.fastTest || false;
            const priority = options.priority || 'balanced';
            const maxInstances = parseInt(options.maxInstances) || 5;
            
            // Procesar perfiles
            let profileIds = [];
            if (options.profiles) {
                profileIds = options.profiles.split(',').map(id => id.trim()).filter(id => id);
            }
            
            if (profileIds.length === 0) {
                console.log('📋 No se especificaron perfiles. Obteniendo perfiles disponibles...');
                const availableProfiles = await this.adsPowerManager.getAvailableProfiles();
                
                if (availableProfiles.length === 0) {
                    throw new Error('No hay perfiles de Ads Power disponibles');
                }
                
                // Usar los primeros perfiles disponibles hasta el máximo
                profileIds = availableProfiles
                    .slice(0, Math.min(maxInstances, availableProfiles.length))
                    .map(profile => profile.user_id || profile.serial_number);
                
                console.log(`📝 Usando perfiles: ${profileIds.join(', ')}`);
            }

            // Validar perfiles
            console.log('🔍 Validando perfiles...');
            for (const profileId of profileIds) {
                try {
                    await this.adsPowerManager.getProfileInfo(profileId);
                } catch (error) {
                    throw new Error(`Perfil ${profileId} no válido: ${error.message}`);
                }
            }

            // Calcular tiempo mínimo de navegación
            const minimumTime = this.calculateMinimumNavigationTime(targetCookies, !fastTest);
            const minimumTimeMinutes = Math.round(minimumTime / 60000);
            
            if (fastTest) {
                console.log('⚡ Modo de prueba rápida activado');
            } else {
                console.log(`⏱️ Tiempo mínimo de navegación: ${minimumTimeMinutes} minutos`);
            }

            // Obtener sitios disponibles
            const maxSites = parseInt(options.sites) || Math.ceil(targetCookies / 15); // ~15 cookies por sitio
            console.log(`🌐 Obteniendo ${maxSites} sitios web aleatorios...`);
            
            const websites = await this.databaseManager.getRandomWebsites(maxSites);
            if (websites.length === 0) {
                throw new Error('No hay sitios web disponibles en la base de datos');
            }
            
            console.log(`📊 Sitios obtenidos: ${websites.length}`);

            // Iniciar sesiones de navegación
            const sessionResults = await this.runMultipleNavigationSessions({
                profileIds,
                websites,
                targetCookies,
                minimumTime,
                priority,
                fastTest
            });

            // Mostrar resultados finales
            this.displayFinalResults(sessionResults, targetCookies, minimumTime);

        } catch (error) {
            console.error('❌ Error en navegación:', error.message);
            await this.cleanup();
        }
    }

    /**
     * Ejecuta múltiples sesiones de navegación en paralelo
     * @param {Object} config - Configuración de las sesiones
     * @returns {Promise<Array>} Resultados de las sesiones
     */
    async runMultipleNavigationSessions(config) {
        const { profileIds, websites, targetCookies, minimumTime, priority } = config;
        
        console.log(`\n🚀 Iniciando ${profileIds.length} sesiones simultáneas:`);
        console.log(`   🎯 Objetivo: ${targetCookies} cookies`);
        console.log(`   ⏱️ Tiempo mínimo: ${Math.round(minimumTime/60000)} min`);
        console.log(`   🎭 Prioridad: ${priority}`);
        console.log('═'.repeat(60));

        const sessionPromises = profileIds.map(async (profileId, index) => {
            return this.runSingleNavigationSession({
                profileId,
                websites,
                targetCookies: Math.ceil(targetCookies / profileIds.length),
                minimumTime: minimumTime / profileIds.length,
                priority,
                sessionIndex: index + 1,
                totalSessions: profileIds.length
            });
        });

        // Ejecutar sesiones y esperar resultados
        const results = await Promise.allSettled(sessionPromises);
        
        // Procesar resultados
        const successfulSessions = results
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);
            
        const failedSessions = results
            .filter(result => result.status === 'rejected')
            .map(result => result.reason);

        if (failedSessions.length > 0) {
            console.log(`\n⚠️ ${failedSessions.length} sesiones fallaron:`);
            failedSessions.forEach((error, index) => {
                console.log(`   ${index + 1}. ${error.message}`);
            });
        }

        return successfulSessions;
    }

    /**
     * Ejecuta una sesión individual de navegación
     * @param {Object} config - Configuración de la sesión
     * @returns {Promise<Object>} Resultado de la sesión
     */
    async runSingleNavigationSession(config) {
        const { profileId, websites, targetCookies, minimumTime, priority, sessionIndex } = config;
        
        console.log(`\n🎭 [Sesión ${sessionIndex}] Iniciando con perfil ${profileId}`);
        
        let browserInstance = null;
        const sessionStats = {
            profileId,
            startTime: Date.now(),
            endTime: null,
            targetCookies,
            cookiesCollected: 0,
            sitesVisited: 0,
            totalInteractions: 0,
            humanBehaviorScore: 0,
            success: false,
            error: null
        };

        try {
            // Registrar sesión activa
            this.activeSessions.set(profileId, sessionStats);

            // Iniciar perfil de Ads Power
            console.log(`🚀 [${profileId}] Iniciando perfil...`);
            browserInstance = await this.adsPowerManager.startProfile(profileId);
            const { page } = browserInstance;

            // Configurar comportamiento del navegador
            await this.configureBrowserBehavior(page);

            // Distribuir sitios y tiempo
            const sitesForSession = this.distributeSitesForSession(websites, sessionIndex, config.totalSessions);
            const timePerSite = minimumTime / sitesForSession.length;

            console.log(`📊 [${profileId}] Asignados ${sitesForSession.length} sitios, ~${Math.round(timePerSite/1000)}s por sitio`);

            // Navegar por sitios con comportamiento humano
            for (let i = 0; i < sitesForSession.length; i++) {
                const website = sitesForSession[i];
                const siteStartTime = Date.now();
                
                console.log(`\n🌐 [${profileId}] Sitio ${i + 1}/${sitesForSession.length}: ${website.domain}`);
                
                try {
                    // Navegar al sitio
                    await page.goto(website.url, { 
                        waitUntil: 'domcontentloaded',
                        timeout: 30000 
                    });

                    // Contar cookies iniciales
                    const cookiesBefore = await this.navigationController.cookieDetector.getCookieCount(page);

                    // Aceptar cookies automáticamente
                    const cookieResult = await this.navigationController.cookieDetector.acceptCookies(page);
                    if (cookieResult.success) {
                        console.log(`🍪 [${profileId}] Cookies aceptadas: ${cookieResult.method}`);
                    }

                    // Simular navegación humana en el sitio
                    const navigationResult = await this.humanBehaviorSimulator.simulateHumanNavigation(
                        page, 
                        website, 
                        {
                            maxTime: Math.round(timePerSite),
                            priority,
                            targetCookies: targetCookies - sessionStats.cookiesCollected
                        }
                    );

                    // Contar cookies finales
                    const cookiesAfter = await this.navigationController.cookieDetector.getCookieCount(page);
                    const cookiesGained = cookiesAfter - cookiesBefore;

                    // Actualizar estadísticas de sesión
                    sessionStats.cookiesCollected += cookiesGained;
                    sessionStats.sitesVisited++;
                    sessionStats.totalInteractions += navigationResult.interactionsPerformed || 0;
                    sessionStats.humanBehaviorScore += navigationResult.humanLikeScore || 0;

                    const siteTime = Date.now() - siteStartTime;
                    console.log(`📈 [${profileId}] +${cookiesGained} cookies (${Math.round(siteTime/1000)}s) - Total: ${sessionStats.cookiesCollected}/${targetCookies}`);

                    // Verificar si se alcanzó el objetivo
                    if (sessionStats.cookiesCollected >= targetCookies) {
                        console.log(`🎯 [${profileId}] ¡Objetivo alcanzado! ${sessionStats.cookiesCollected} cookies`);
                        break;
                    }

                    // Pausa entre sitios para simular comportamiento humano
                    if (i < sitesForSession.length - 1) {
                        const pauseTime = this.humanBehaviorSimulator.timingManager.calculateSiteTransitionTime(i, sitesForSession.length);
                        console.log(`⏸️ [${profileId}] Pausa entre sitios: ${Math.round(pauseTime/1000)}s`);
                        await this.sleep(pauseTime);
                    }

                } catch (siteError) {
                    console.warn(`⚠️ [${profileId}] Error en ${website.domain}: ${siteError.message}`);
                    continue; // Continuar con el siguiente sitio
                }
            }

            // Calcular puntuación promedio de comportamiento humano
            sessionStats.humanBehaviorScore = sessionStats.sitesVisited > 0 ? 
                sessionStats.humanBehaviorScore / sessionStats.sitesVisited : 0;

            sessionStats.endTime = Date.now();
            sessionStats.success = true;

            const totalTime = sessionStats.endTime - sessionStats.startTime;
            console.log(`\n✅ [${profileId}] Sesión completada:`);
            console.log(`   🍪 Cookies: ${sessionStats.cookiesCollected}/${targetCookies}`);
            console.log(`   🌐 Sitios: ${sessionStats.sitesVisited}`);
            console.log(`   ⏱️ Tiempo: ${Math.round(totalTime/60000)} min`);
            console.log(`   🎭 Puntuación humana: ${Math.round(sessionStats.humanBehaviorScore)}/100`);

            return sessionStats;

        } catch (error) {
            console.error(`❌ [${profileId}] Error en sesión: ${error.message}`);
            sessionStats.error = error.message;
            sessionStats.endTime = Date.now();
            return sessionStats;

        } finally {
            // Limpiar recursos
            try {
                if (browserInstance) {
                    await this.adsPowerManager.stopProfile(profileId);
                }
                this.activeSessions.delete(profileId);
            } catch (cleanupError) {
                console.warn(`⚠️ [${profileId}] Error en limpieza: ${cleanupError.message}`);
            }
        }
    }

    /**
     * Configura comportamiento básico del navegador
     * @param {Object} page - Página de Playwright
     */
    async configureBrowserBehavior(page) {
        // Configurar user agent aleatorio pero realista
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
        ];
        
        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        await page.setUserAgent(randomUserAgent);

        // Configurar viewport realista
        const viewports = [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 1536, height: 864 },
            { width: 1440, height: 900 }
        ];
        
        const randomViewport = viewports[Math.floor(Math.random() * viewports.length)];
        await page.setViewportSize(randomViewport);

        // Configurar headers adicionales
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Upgrade-Insecure-Requests': '1'
        });
    }

    /**
     * Distribuye sitios entre sesiones de manera equilibrada
     * @param {Array} websites - Lista de sitios web
     * @param {number} sessionIndex - Índice de la sesión (1-based)
     * @param {number} totalSessions - Total de sesiones
     * @returns {Array} Sitios asignados a la sesión
     */
    distributeSitesForSession(websites, sessionIndex, totalSessions) {
        const sitesPerSession = Math.ceil(websites.length / totalSessions);
        const startIndex = (sessionIndex - 1) * sitesPerSession;
        const endIndex = Math.min(startIndex + sitesPerSession, websites.length);
        
        return websites.slice(startIndex, endIndex);
    }

    /**
     * Calcula tiempo mínimo de navegación
     * @param {number} targetCookies - Objetivo de cookies
     * @param {boolean} enforceMinimum - Si debe aplicar mínimo de 1 hora
     * @returns {number} Tiempo en millisegundos
     */
    calculateMinimumNavigationTime(targetCookies, enforceMinimum = true) {
        if (!enforceMinimum) {
            // Modo de prueba rápida: 2-5 minutos
            return this.randomBetween(2 * 60 * 1000, 5 * 60 * 1000);
        }

        // Tiempo mínimo de 1 hora para 2500 cookies
        const baseTime = 60 * 60 * 1000; // 1 hora
        const baseCookies = 2500;
        
        // Escalar proporcionalmente
        const calculatedTime = (targetCookies / baseCookies) * baseTime;
        
        // Mínimo 45 minutos, máximo 3 horas
        return Math.max(45 * 60 * 1000, Math.min(3 * 60 * 60 * 1000, calculatedTime));
    }

    /**
     * Muestra resultados finales de todas las sesiones
     * @param {Array} sessionResults - Resultados de las sesiones
     * @param {number} targetCookies - Objetivo total
     * @param {number} minimumTime - Tiempo mínimo configurado
     */
    displayFinalResults(sessionResults, targetCookies, minimumTime) {
        console.log('\n' + '═'.repeat(60));
        console.log('📊 RESULTADOS FINALES');
        console.log('═'.repeat(60));

        const totalCookies = sessionResults.reduce((sum, session) => sum + session.cookiesCollected, 0);
        const totalSites = sessionResults.reduce((sum, session) => sum + session.sitesVisited, 0);
        const avgHumanScore = sessionResults.reduce((sum, session) => sum + session.humanBehaviorScore, 0) / sessionResults.length;
        const successfulSessions = sessionResults.filter(session => session.success).length;

        const totalTime = Math.max(...sessionResults.map(session => 
            session.endTime ? session.endTime - session.startTime : 0
        ));

        console.log(`🎯 Objetivo de cookies: ${targetCookies}`);
        console.log(`🍪 Cookies recolectadas: ${totalCookies} (${Math.round((totalCookies/targetCookies)*100)}%)`);
        console.log(`🌐 Sitios visitados: ${totalSites}`);
        console.log(`⏱️ Tiempo total: ${Math.round(totalTime/60000)} min (mínimo: ${Math.round(minimumTime/60000)} min)`);
        console.log(`✅ Sesiones exitosas: ${successfulSessions}/${sessionResults.length}`);
        console.log(`🎭 Puntuación humana promedio: ${Math.round(avgHumanScore)}/100`);

        // Detalles por sesión
        console.log('\n📋 Detalle por sesión:');
        sessionResults.forEach((session, index) => {
            const sessionTime = session.endTime ? session.endTime - session.startTime : 0;
            const status = session.success ? '✅' : '❌';
            const efficiency = session.sitesVisited > 0 ? (session.cookiesCollected / session.sitesVisited).toFixed(1) : 0;
            
            console.log(`${status} Sesión ${index + 1} (${session.profileId}):`);
            console.log(`   🍪 ${session.cookiesCollected} cookies | 🌐 ${session.sitesVisited} sitios | ⏱️ ${Math.round(sessionTime/60000)} min`);
            console.log(`   📊 ${efficiency} cookies/sitio | 🎭 ${Math.round(session.humanBehaviorScore)}/100 humano`);
            if (session.error) {
                console.log(`   ❌ Error: ${session.error}`);
            }
        });

        // Recomendaciones
        console.log('\n💡 Análisis y recomendaciones:');
        
        if (totalCookies >= targetCookies) {
            console.log('✅ Objetivo de cookies alcanzado exitosamente');
        } else {
            const shortage = targetCookies - totalCookies;
            console.log(`⚠️ Faltan ${shortage} cookies (${Math.round((shortage/targetCookies)*100)}%)`);
        }

        if (avgHumanScore >= 80) {
            console.log('🎭 Excelente simulación de comportamiento humano');
        } else if (avgHumanScore >= 60) {
            console.log('🎭 Buena simulación de comportamiento humano');
        } else {
            console.log('⚠️ Comportamiento podría ser más humano - considera ajustar parámetros');
        }

        if (totalTime < minimumTime * 0.8) {
            console.log('⚡ Navegación más rápida de lo esperado - considera aumentar tiempo por sitio');
        }

        console.log('═'.repeat(60));
    }

    /**
     * Prueba simulación de comportamiento humano en un sitio específico
     * @param {string} profileId - ID del perfil
     * @param {Object} options - Opciones de prueba
     */
    async testHumanBehavior(profileId, options) {
        let browserInstance = null;
        
        try {
            console.log(`🧪 Probando comportamiento humano con perfil ${profileId}`);
            
            // Iniciar perfil
            browserInstance = await this.adsPowerManager.startProfile(profileId);
            const { page } = browserInstance;
            
            // Configurar navegador
            await this.configureBrowserBehavior(page);
            
            // Determinar sitio a probar
            let testSite;
            if (options.url) {
                testSite = { url: options.url, domain: new URL(options.url).hostname };
                console.log(`🌐 Probando URL específica: ${options.url}`);
            } else {
                testSite = await this.databaseManager.getRandomWebsite();
                console.log(`🎲 Probando sitio aleatorio: ${testSite.domain}`);
            }
            
            // Navegar al sitio
            console.log('🚀 Navegando al sitio...');
            await page.goto(testSite.url, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
            // Ejecutar simulación de comportamiento humano
            const testDuration = parseInt(options.time) * 1000;
            console.log(`⏱️ Iniciando simulación por ${options.time} segundos...`);
            
            const startTime = Date.now();
            const navigationResult = await this.humanBehaviorSimulator.simulateHumanNavigation(
                page, 
                testSite, 
                { maxTime: testDuration }
            );
            const actualTime = Date.now() - startTime;
            
            // Mostrar resultados detallados
            console.log('\n📊 Resultados de la prueba:');
            console.log('─'.repeat(50));
            console.log(`🌐 Sitio: ${testSite.domain}`);
            console.log(`🏷️ Tipo detectado: ${navigationResult.siteType}`);
            console.log(`📄 Páginas visitadas: ${navigationResult.pagesVisited}`);
            console.log(`⏱️ Tiempo real: ${Math.round(actualTime/1000)}s (objetivo: ${options.time}s)`);
            console.log(`🖱️ Interacciones: ${navigationResult.interactionsPerformed}`);
            console.log(`🎭 Puntuación humana: ${navigationResult.humanLikeScore}/100`);
            
            if (navigationResult.pattern) {
                console.log('\n📋 Patrón aplicado:');
                console.log(`   📄 Páginas: ${navigationResult.pattern.pagesMin}-${navigationResult.pattern.pagesMax}`);
                console.log(`   ⏱️ Tiempo/página: ${Math.round(navigationResult.pattern.timePerPage.min/1000)}-${Math.round(navigationResult.pattern.timePerPage.max/1000)}s`);
                console.log(`   📊 Click prob: ${Math.round(navigationResult.pattern.clickProbability * 100)}%`);
                console.log(`   📜 Scroll depth: ${Math.round(navigationResult.pattern.scrollDepth.min * 100)}-${Math.round(navigationResult.pattern.scrollDepth.max * 100)}%`);
            }
            
            // Obtener estadísticas de los simuladores
            const mouseStats = this.humanBehaviorSimulator.mouseSimulator.getMovementStats();
            const scrollStats = this.humanBehaviorSimulator.scrollSimulator.getScrollStats();
            const timingStats = this.humanBehaviorSimulator.timingManager.getTimingStats();
            
            if (mouseStats) {
                console.log('\n🖱️ Estadísticas de mouse:');
                console.log(`   📊 Movimientos: ${mouseStats.totalMovements}`);
                console.log(`   📏 Distancia promedio: ${Math.round(mouseStats.averageDistance)}px`);
                console.log(`   ⚡ Velocidad promedio: ${Math.round(mouseStats.averageSpeed)}px/ms`);
            }
            
            if (scrollStats) {
                console.log('\n📜 Estadísticas de scroll:');
                console.log(`   📊 Acciones: ${scrollStats.totalActions}`);
                console.log(`   📏 Distancia total: ${Math.round(scrollStats.totalDistance)}px`);
                console.log(`   📈 Scroll hacia abajo: ${Math.round(scrollStats.downScrollPercentage)}%`);
            }
            
            if (timingStats) {
                console.log('\n⏱️ Estadísticas de timing:');
                console.log(`   📊 Pausas totales: ${timingStats.totalPauses}`);
                console.log(`   ⏱️ Tiempo en pausas: ${Math.round(timingStats.pausePercentage)}%`);
                console.log(`   🎭 Puntuación timing: ${this.humanBehaviorSimulator.timingManager.evaluateTimingHumanness()}/100`);
            }
            
            console.log('\n✅ Prueba de comportamiento humano completada');
            
        } catch (error) {
            console.error('❌ Error en prueba de comportamiento:', error.message);
        } finally {
            if (browserInstance) {
                await this.adsPowerManager.stopProfile(profileId);
            }
        }
    }

    /**
     * Monitorea sesiones activas en tiempo real
     */
    async monitorActiveSessions() {
        if (this.activeSessions.size === 0) {
            console.log('📊 No hay sesiones activas en este momento');
            return;
        }

        console.log('📊 Monitoreando sesiones activas...');
        console.log('Presiona Ctrl+C para detener el monitoreo\n');

        const updateInterval = 5000; // 5 segundos
        
        const monitor = setInterval(() => {
            console.clear();
            console.log('📊 MONITOR DE SESIONES ACTIVAS');
            console.log('═'.repeat(60));
            console.log(`Actualizado: ${new Date().toLocaleTimeString()}\n`);

            if (this.activeSessions.size === 0) {
                console.log('✅ Todas las sesiones han terminado');
                clearInterval(monitor);
                return;
            }

            this.activeSessions.forEach((session, profileId) => {
                const elapsedTime = Date.now() - session.startTime;
                const progress = Math.min(100, (session.cookiesCollected / session.targetCookies) * 100);
                const progressBar = this.createProgressBar(progress, 30);
                
                console.log(`🎭 Sesión ${profileId}:`);
                console.log(`   🍪 Cookies: ${session.cookiesCollected}/${session.targetCookies} (${Math.round(progress)}%)`);
                console.log(`   ${progressBar}`);
                console.log(`   🌐 Sitios visitados: ${session.sitesVisited}`);
                console.log(`   ⏱️ Tiempo transcurrido: ${Math.round(elapsedTime/60000)} min`);
                console.log('─'.repeat(50));
            });

        }, updateInterval);

        // Manejar Ctrl+C
        process.on('SIGINT', () => {
            clearInterval(monitor);
            console.log('\n📊 Monitoreo detenido');
            process.exit(0);
        });
    }

    /**
     * Crea barra de progreso visual
     * @param {number} percentage - Porcentaje 0-100
     * @param {number} length - Longitud de la barra
     * @returns {string} Barra de progreso
     */
    createProgressBar(percentage, length = 20) {
        const filled = Math.round((percentage / 100) * length);
        const empty = length - filled;
        return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.round(percentage)}%`;
    }

    /**
     * Detiene todas las sesiones activas
     */
    async stopAllSessions() {
        if (this.activeSessions.size === 0) {
            console.log('📊 No hay sesiones activas para detener');
            return;
        }

        console.log(`🛑 Deteniendo ${this.activeSessions.size} sesiones activas...`);
        
        const profileIds = Array.from(this.activeSessions.keys());
        
        for (const profileId of profileIds) {
            try {
                console.log(`🛑 Deteniendo sesión ${profileId}...`);
                await this.adsPowerManager.stopProfile(profileId);
                this.activeSessions.delete(profileId);
                console.log(`✅ Sesión ${profileId} detenida`);
            } catch (error) {
                console.error(`❌ Error deteniendo sesión ${profileId}: ${error.message}`);
            }
        }

        console.log('✅ Todas las sesiones han sido detenidas');
    }

    /**
     * Verifica estado de Ads Power
     */
    async checkAdsPowerStatus() {
        try {
            console.log('🔍 Verificando estado de Ads Power...');
            const isAvailable = await this.adsPowerManager.checkAvailability();
            
            if (isAvailable) {
                console.log('✅ Ads Power está disponible');
                
                // Obtener información adicional
                const profiles = await this.adsPowerManager.getAvailableProfiles();
                console.log(`📊 Perfiles disponibles: ${profiles.length}`);
            } else {
                console.log('❌ Ads Power no está disponible');
                console.log('💡 Asegúrate de que Ads Power esté ejecutándose y en el puerto 50325');
            }
        } catch (error) {
            console.error('❌ Error verificando Ads Power:', error.message);
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
     * Carga sitios web desde archivo CSV
     * @param {string} csvFile - Ruta al archivo CSV
     * @param {Object} options - Opciones de carga
     */
    async loadCsvFile(csvFile, options) {
        try {
            console.log(`📂 Cargando sitios desde: ${csvFile}`);
            
            const result = await this.csvLoader.loadSitesFromCsv(csvFile, {
                overwrite: options.overwrite || false,
                skipDuplicates: true,
                validateUrls: true
            });
            
            if (result.success) {
                console.log('✅ Carga completada exitosamente');
                console.log(`📊 ${result.stats.inserted} sitios insertados, ${result.stats.updated} actualizados`);
            } else {
                console.log('❌ Error en la carga');
            }
            
        } catch (error) {
            console.error('Error cargando CSV:', error.message);
        }
    }

    /**
     * Genera CSV de ejemplo
     * @param {string} outputPath - Ruta de salida
     */
    async generateCsvExample(outputPath) {
        try {
            console.log('📄 Generando CSV de ejemplo...');
            await this.csvLoader.generateExampleCsv(outputPath);
            
            console.log(`✅ CSV de ejemplo generado: ${outputPath}`);
            console.log('\n📋 Estructura requerida:');
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
     * Utilidad para pausas
     * @param {number} ms - Millisegundos a esperar
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Genera número aleatorio entre min y max
     * @param {number} min - Valor mínimo
     * @param {number} max - Valor máximo
     * @returns {number} Número aleatorio
     */
    randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Limpia recursos y cierra conexiones
     */
    async cleanup() {
        try {
            console.log('🧹 Limpiando recursos...');
            
            // Detener todas las sesiones activas
            await this.stopAllSessions();
            
            // Detener todos los perfiles
            await this.adsPowerManager.stopAllProfiles();
            
            // Cerrar base de datos
            await this.databaseManager.close();
            
            console.log('✅ Recursos limpiados correctamente');
        } catch (error) {
            console.error('❌ Error en limpieza:', error.message);
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
    console.error('💥 Error fatal:', error.message);
    process.exit(1);
});