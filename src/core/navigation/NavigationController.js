import CookieDetector from './CookieDetector.js';

/**
 * Controlador principal de navegación
 * Coordina la navegación automática entre sitios web y recolección de cookies
 * Soporta múltiples perfiles simultáneos
 */
class NavigationController {
    constructor(databaseManager, configManager) {
        this.databaseManager = databaseManager;
        this.configManager = configManager;
        this.cookieDetector = new CookieDetector();
        this.activeSessions = new Map();
        this.globalStats = {
            totalSessions: 0,
            completedSessions: 0,
            totalCookiesCollected: 0,
            totalSitesVisited: 0,
            errors: 0,
            startTime: null
        };
    }

    /**
     * Inicia múltiples sesiones de navegación en paralelo
     * @param {Array|string} profileIds - Array de IDs o ID único de perfil
     * @param {number} targetCookies - Cantidad objetivo de cookies por perfil
     * @returns {Promise<Object>} Resultado agregado de todas las sesiones
     */
    async startMultipleNavigationSessions(profileIds, targetCookies = null) {
        const profiles = Array.isArray(profileIds) ? profileIds : [profileIds];
        const cookieTarget = targetCookies || this.configManager.getDefaultCookieTarget();
        
        console.log(`🚀 Iniciando navegación con ${profiles.length} perfil(es)`);
        console.log(`🎯 Objetivo por perfil: ${cookieTarget} cookies`);
        console.log(`📋 Perfiles: ${profiles.join(', ')}`);
        
        this.globalStats.totalSessions = profiles.length;
        this.globalStats.startTime = new Date();
        
        // Configurar WAL mode para SQLite (mejora concurrencia)
        await this.setupDatabaseConcurrency();
        
        // Iniciar todas las sesiones en paralelo
        const sessionPromises = profiles.map(profileId => 
            this.startSingleNavigationSession(profileId, cookieTarget)
                .catch(error => {
                    console.error(`❌ Error en perfil ${profileId}:`, error.message);
                    this.globalStats.errors++;
                    return {
                        profileId,
                        success: false,
                        error: error.message,
                        cookiesCollected: 0,
                        sitesVisited: 0
                    };
                })
        );
        
        // Mostrar progreso mientras ejecutan
        const progressInterval = setInterval(() => {
            this.showGlobalProgress();
        }, 10000); // Cada 10 segundos
        
        try {
            // Esperar a que terminen todas las sesiones
            const results = await Promise.all(sessionPromises);
            clearInterval(progressInterval);
            
            // Calcular estadísticas finales
            const finalStats = this.calculateFinalStats(results);
            this.showFinalReport(finalStats);
            
            return finalStats;
            
        } catch (error) {
            clearInterval(progressInterval);
            throw error;
        }
    }

    /**
     * Inicia una sesión de navegación individual
     * @param {string} profileId - ID del perfil
     * @param {number} targetCookies - Cantidad objetivo de cookies
     * @returns {Promise<Object>} Resultado de la sesión
     */
    async startSingleNavigationSession(profileId, targetCookies) {
        const sessionId = `session_${profileId}_${Date.now()}`;
        
        console.log(`🔄 [${profileId}] Iniciando sesión...`);
        
        const sessionStats = {
            profileId,
            sessionId,
            targetCookies,
            cookiesCollected: 0,
            sitesVisited: 0,
            startTime: new Date(),
            visitedUrls: new Set(),
            errors: 0,
            currentSite: null
        };
        
        this.activeSessions.set(profileId, sessionStats);
        
        let browserInstance = null;
        
        try {
            // Iniciar perfil de AdsPower
            browserInstance = await this.initializeProfile(profileId);
            const { page } = browserInstance;
            
            // Obtener cookies iniciales
            const initialCookies = await this.cookieDetector.getCookieCount(page);
            sessionStats.cookiesCollected = initialCookies;
            
            console.log(`📊 [${profileId}] Cookies iniciales: ${initialCookies}`);
            
            // Registrar sesión en base de datos
            await this.registerSession(sessionStats);
            
            // Bucle principal de navegación
            let attempts = 0;
            const maxAttempts = 100; // Límite de seguridad
            
            while (sessionStats.cookiesCollected < targetCookies && attempts < maxAttempts) {
                attempts++;
                
                try {
                    // Obtener sitio web aleatorio no visitado
                    const excludedUrls = Array.from(sessionStats.visitedUrls);
                    const website = await this.databaseManager.getRandomWebsite(excludedUrls);
                    
                    if (!website) {
                        console.log(`⚠️ [${profileId}] No hay más sitios disponibles`);
                        break;
                    }
                    
                    sessionStats.currentSite = website.domain;
                    console.log(`🌐 [${profileId}] Navegando a: ${website.domain}`);
                    
                    // Navegar al sitio y procesar cookies
                    const siteResult = await this.processSiteVisit(page, website, sessionStats);
                    
                    // Actualizar estadísticas
                    sessionStats.cookiesCollected = siteResult.cookiesAfter;
                    sessionStats.sitesVisited++;
                    sessionStats.visitedUrls.add(website.url);
                    
                    // Registrar visita en base de datos
                    await this.registerSiteVisit(sessionStats, website, siteResult);
                    
                    // Mostrar progreso individual
                    const progress = Math.min((sessionStats.cookiesCollected / targetCookies) * 100, 100);
                    console.log(`📈 [${profileId}] Progreso: ${sessionStats.cookiesCollected}/${targetCookies} cookies (${progress.toFixed(1)}%)`);
                    
                    // Pequeña pausa entre sitios (comportamiento humano)
                    await this.sleep(this.randomBetween(2000, 5000));
                    
                } catch (siteError) {
                    console.error(`❌ [${profileId}] Error en sitio:`, siteError.message);
                    sessionStats.errors++;
                    
                    // Continuar con siguiente sitio
                    await this.sleep(1000);
                }
            }
            
            // Marcar sesión como completada
            sessionStats.endTime = new Date();
            await this.completeSession(sessionStats);
            
            console.log(`✅ [${profileId}] Sesión completada: ${sessionStats.cookiesCollected} cookies`);
            
            return {
                profileId,
                success: true,
                cookiesCollected: sessionStats.cookiesCollected,
                sitesVisited: sessionStats.sitesVisited,
                duration: sessionStats.endTime - sessionStats.startTime,
                targetReached: sessionStats.cookiesCollected >= targetCookies
            };
            
        } catch (error) {
            console.error(`❌ [${profileId}] Error en sesión:`, error.message);
            throw error;
            
        } finally {
            this.activeSessions.delete(profileId);
            
            if (browserInstance) {
                try {
                    await this.cleanupProfile(profileId, browserInstance);
                } catch (cleanupError) {
                    console.error(`⚠️ [${profileId}] Error en cleanup:`, cleanupError.message);
                }
            }
        }
    }

    /**
     * Inicializa un perfil de AdsPower
     * @param {string} profileId - ID del perfil
     * @returns {Promise<Object>} Instancia del navegador
     */
    async initializeProfile(profileId) {
        // Obtener AdsPowerManager desde main.js (se pasa como dependencia)
        const adsPowerManager = global.adsPowerManager;
        if (!adsPowerManager) {
            throw new Error('AdsPowerManager no disponible');
        }
        
        return await adsPowerManager.startProfile(profileId);
    }

    /**
     * Procesa la visita a un sitio web específico
     * @param {Object} page - Página de Playwright
     * @param {Object} website - Datos del sitio web
     * @param {Object} sessionStats - Estadísticas de la sesión
     * @returns {Promise<Object>} Resultado de la visita
     */
    async processSiteVisit(page, website, sessionStats) {
        const cookiesBefore = await this.cookieDetector.getCookieCount(page);
        let visitSuccess = false;
        let errorMessage = null;
        
        try {
            // Navegar al sitio
            await page.goto(website.url, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
            // Pequeña espera para que cargue completamente
            await this.sleep(2000);
            
            // Intentar aceptar cookies
            const cookieResult = await this.cookieDetector.acceptCookies(page);
            
            if (cookieResult.success) {
                console.log(`🍪 [${sessionStats.profileId}] Cookies aceptadas en ${website.domain}`);
            }
            
            // Simular navegación básica (scroll, tiempo en página)
            await this.simulateBasicNavigation(page);
            
            visitSuccess = true;
            
        } catch (error) {
            console.error(`⚠️ [${sessionStats.profileId}] Error en ${website.domain}:`, error.message);
            errorMessage = error.message;
        }
        
        const cookiesAfter = await this.cookieDetector.getCookieCount(page);
        const cookiesGained = cookiesAfter - cookiesBefore;
        
        if (cookiesGained > 0) {
            console.log(`📈 [${sessionStats.profileId}] +${cookiesGained} cookies de ${website.domain}`);
        }
        
        return {
            cookiesBefore,
            cookiesAfter,
            cookiesGained,
            success: visitSuccess,
            error: errorMessage,
            duration: 0
        };
    }

    /**
     * Simula navegación humana básica
     * @param {Object} page - Página de Playwright
     */
    async simulateBasicNavigation(page) {
        try {
            // Scroll aleatorio
            const scrollAmount = this.randomBetween(200, 800);
            await page.evaluate((amount) => {
                window.scrollBy(0, amount);
            }, scrollAmount);
            
            // Tiempo en página
            const timeOnPage = this.randomBetween(3000, 8000);
            await this.sleep(timeOnPage);
            
        } catch (error) {
            // Ignorar errores de simulación
        }
    }

    /**
     * Configura la base de datos para mejor concurrencia
     */
    async setupDatabaseConcurrency() {
        try {
            // Activar WAL mode para mejor concurrencia
            await this.databaseManager.db.runAsync('PRAGMA journal_mode=WAL');
            await this.databaseManager.db.runAsync('PRAGMA synchronous=NORMAL');
            await this.databaseManager.db.runAsync('PRAGMA cache_size=10000');
            await this.databaseManager.db.runAsync('PRAGMA temp_store=memory');
            
            console.log('🔧 Base de datos configurada para concurrencia');
        } catch (error) {
            console.warn('⚠️ No se pudo optimizar la base de datos:', error.message);
        }
    }

    /**
     * Registra una nueva sesión en la base de datos
     */
    async registerSession(sessionStats) {
        try {
            await this.databaseManager.db.runAsync(`
                INSERT INTO navigation_sessions 
                (session_id, profile_id, target_cookies, started_at, status) 
                VALUES (?, ?, ?, ?, 'running')
            `, [
                sessionStats.sessionId,
                sessionStats.profileId,
                sessionStats.targetCookies,
                sessionStats.startTime.toISOString()
            ]);
        } catch (error) {
            console.warn(`⚠️ Error registrando sesión ${sessionStats.profileId}:`, error.message);
        }
    }

    /**
     * Registra una visita a sitio en la base de datos
     */
    async registerSiteVisit(sessionStats, website, siteResult) {
        try {
            await this.databaseManager.db.runAsync(`
                INSERT INTO site_visits 
                (session_id, website_id, cookies_before, cookies_after, success, error_message, visited_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                sessionStats.sessionId,
                website.id,
                siteResult.cookiesBefore,
                siteResult.cookiesAfter,
                siteResult.success,
                siteResult.error,
                new Date().toISOString()
            ]);
            
            // Actualizar estadísticas del sitio web
            await this.databaseManager.updateWebsiteStats(website.url, siteResult.cookiesGained);
            
        } catch (error) {
            console.warn(`⚠️ Error registrando visita:`, error.message);
        }
    }

    /**
     * Completa una sesión en la base de datos
     */
    async completeSession(sessionStats) {
        try {
            await this.databaseManager.db.runAsync(`
                UPDATE navigation_sessions 
                SET completed_at = ?, cookies_collected = ?, sites_visited = ?, status = 'completed'
                WHERE session_id = ?
            `, [
                sessionStats.endTime.toISOString(),
                sessionStats.cookiesCollected,
                sessionStats.sitesVisited,
                sessionStats.sessionId
            ]);
        } catch (error) {
            console.warn(`⚠️ Error completando sesión:`, error.message);
        }
    }

    /**
     * Limpia un perfil de AdsPower
     */
    async cleanupProfile(profileId, browserInstance) {
        const adsPowerManager = global.adsPowerManager;
        if (adsPowerManager) {
            await adsPowerManager.stopProfile(profileId);
        }
    }

    /**
     * Muestra progreso global de todas las sesiones
     */
    showGlobalProgress() {
        const activeSessions = Array.from(this.activeSessions.values());
        if (activeSessions.length === 0) return;
        
        console.log('\n📊 PROGRESO GLOBAL:');
        console.log('═'.repeat(60));
        
        activeSessions.forEach(session => {
            const progress = Math.min((session.cookiesCollected / session.targetCookies) * 100, 100);
            const progressBar = this.createProgressBar(progress);
            
            console.log(`[${session.profileId}] ${progressBar} ${progress.toFixed(1)}% (${session.cookiesCollected}/${session.targetCookies})`);
            if (session.currentSite) {
                console.log(`    📍 Actual: ${session.currentSite}`);
            }
        });
        
        console.log('═'.repeat(60));
    }

    /**
     * Calcula estadísticas finales agregadas
     */
    calculateFinalStats(results) {
        const successful = results.filter(r => r.success);
        const totalCookies = results.reduce((sum, r) => sum + r.cookiesCollected, 0);
        const totalSites = results.reduce((sum, r) => sum + r.sitesVisited, 0);
        const avgDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length;
        
        return {
            totalProfiles: results.length,
            successfulProfiles: successful.length,
            failedProfiles: results.length - successful.length,
            totalCookiesCollected: totalCookies,
            totalSitesVisited: totalSites,
            averageCookiesPerProfile: totalCookies / results.length,
            averageDurationMinutes: avgDuration / (1000 * 60),
            successRate: (successful.length / results.length) * 100,
            results: results,
            duration: Date.now() - this.globalStats.startTime
        };
    }

    /**
     * Muestra reporte final detallado
     */
    showFinalReport(stats) {
        console.log('\n🎉 REPORTE FINAL DE NAVEGACIÓN');
        console.log('═'.repeat(80));
        console.log(`📊 Perfiles procesados: ${stats.totalProfiles}`);
        console.log(`✅ Exitosos: ${stats.successfulProfiles}`);
        console.log(`❌ Fallidos: ${stats.failedProfiles}`);
        console.log(`🍪 Total cookies recolectadas: ${stats.totalCookiesCollected}`);
        console.log(`🌐 Total sitios visitados: ${stats.totalSitesVisited}`);
        console.log(`📈 Promedio cookies/perfil: ${stats.averageCookiesPerProfile.toFixed(0)}`);
        console.log(`⏱️  Duración total: ${(stats.duration / 1000 / 60).toFixed(1)} minutos`);
        console.log(`✨ Tasa de éxito: ${stats.successRate.toFixed(1)}%`);
        
        console.log('\n📋 DETALLE POR PERFIL:');
        stats.results.forEach(result => {
            const status = result.success ? '✅' : '❌';
            const target = result.targetReached ? '🎯' : '⏳';
            console.log(`   ${status} ${target} [${result.profileId}] ${result.cookiesCollected} cookies, ${result.sitesVisited} sitios`);
        });
        
        console.log('═'.repeat(80));
    }

    /**
     * Crea una barra de progreso visual
     */
    createProgressBar(percentage, width = 20) {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    /**
     * Genera número aleatorio entre min y max
     */
    randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Función sleep/delay
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default NavigationController;