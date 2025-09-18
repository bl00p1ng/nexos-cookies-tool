import { EventEmitter } from 'events';
import CookieDetector from './CookieDetector.js';
import HumanBehaviorSimulator from './HumanBehaviorSimulator.js';

/**
 * Controlador principal de navegación
 * Coordina la navegación automática entre sitios web y recolección de cookies
 * Soporta múltiples perfiles simultáneos
 */
class NavigationController extends EventEmitter {
    constructor(databaseManager, configManager, adsPowerManager = null) {
        super(); // Llamar constructor de EventEmitter

        this.databaseManager = databaseManager;
        this.configManager = configManager;
        this.adsPowerManager = adsPowerManager;
        this.cookieDetector = new CookieDetector();
        this.humanBehaviorSimulator = new HumanBehaviorSimulator();
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

        // Emitir estadísticas globales actualizadas
        this.emitGlobalStats(this.globalStats);
        
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
                        sitesVisited: 0,
                        duration: 0
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
     * Inicia una sesión de navegación individual con comportamiento humano
     * @param {string} profileId - ID del perfil
     * @param {number} targetCookies - Cantidad objetivo de cookies
     * @returns {Promise<Object>} Resultado de la sesión
     */
    async startSingleNavigationSession(profileId, targetCookies) {
        const sessionId = `session_${profileId}_${Date.now()}`;
        const startTime = Date.now();
        
        console.log(`🔄 [${profileId}] Iniciando sesión...`);

        if (!this.adsPowerManager) {
            throw new Error('AdsPowerManager no está disponible en NavigationController');
        }

        // Emitir evento de sesión iniciada
        this.emitSessionStarted(sessionId, profileId);
        
        const sessionStats = {
            sessionId,
            profileId,
            startTime: new Date(startTime),
            endTime: null,
            targetCookies,
            cookiesCollected: 0,
            sitesVisited: 0,
            totalInteractions: 0,
            humanBehaviorScore: 0,
            success: false,
            error: null,
            currentSite: null
        };

        // Registrar sesión activa
        this.activeSessions.set(profileId, sessionStats);

        let browserInstance = null;

        try {
            // Registrar sesión en base de datos
            await this.registerSession(sessionStats);

            // Iniciar navegador usando AdsPowerManager global
            browserInstance = await this.startProfile(profileId);
            const { page } = browserInstance;
            
            console.log(`✅ [${profileId}] Navegador iniciado`);

            // Obtener sitios web para navegar
            const websites = await this.databaseManager.getRandomWebsites(100);
            if (websites.length === 0) {
                throw new Error('No hay sitios web disponibles en la base de datos');
            }

            console.log(`📂 [${profileId}] ${websites.length} sitios disponibles`);

            // Calcular tiempo mínimo (1 hora para 2500 cookies)
            const minimumTime = this.calculateMinimumNavigationTime(targetCookies);
            console.log(`⏱️ [${profileId}] Tiempo mínimo: ${Math.round(minimumTime/60000)} minutos`);

            // Navegar por sitios hasta alcanzar objetivo
            let siteIndex = 0;
            const endTime = startTime + minimumTime;
            let consecutiveConnectionErrors = 0;
            const maxConnectionErrors = 3;

            while (sessionStats.cookiesCollected < targetCookies && 
                   Date.now() < endTime && 
                   siteIndex < websites.length) {
                
                const website = websites[siteIndex];
                sessionStats.currentSite = website.domain;
                
                console.log(`\n🌐 [${profileId}] Sitio ${siteIndex + 1}: ${website.domain}`);
                
                try {
                    // Verificar que el navegador sigue conectado antes de procesar
                    try {
                        await page.evaluate(() => document.readyState);
                    } catch (evalError) {
                        if (evalError.message.includes('Target page, context or browser has been closed')) {
                            throw new Error('CONEXION_PERDIDA: Navegador desconectado antes de procesar sitio');
                        }
                    }

                    // Procesar sitio con comportamiento humano
                    const siteResult = await this.processSiteWithHumanBehavior(
                        page, 
                        website, 
                        sessionStats
                    );

                    // Verificar si hubo error de conexión
                    if (siteResult.error && siteResult.error.startsWith('CONEXION_PERDIDA')) {
                        consecutiveConnectionErrors++;
                        console.warn(`🔌 [${profileId}] Error de conexión ${consecutiveConnectionErrors}/${maxConnectionErrors}: ${siteResult.error}`);
                        
                        if (consecutiveConnectionErrors >= maxConnectionErrors) {
                            console.error(`❌ [${profileId}] Demasiados errores de conexión consecutivos, terminando sesión`);
                            throw new Error('Navegador perdió conexión permanentemente');
                        }
                        
                        // Intentar reconectar
                        console.log(`🔄 [${profileId}] Intentando reconectar navegador...`);
                        
                        try {
                            // Cerrar instancia actual si existe
                            if (browserInstance && browserInstance.browser) {
                                try {
                                    await browserInstance.browser.close();
                                } catch (closeError) {
                                    console.warn(`⚠️ [${profileId}] Error cerrando navegador anterior: ${closeError.message}`);
                                }
                            }
                            
                            // Esperar antes de reconectar
                            await this.sleep(5000);
                            
                            // Reconectar
                            browserInstance = await this.startProfile(profileId);
                            page = browserInstance.page;
                            
                            console.log(`✅ [${profileId}] Navegador reconectado exitosamente`);
                            consecutiveConnectionErrors = 0; // Resetear contador
                            
                            // No incrementar siteIndex para reintentar el mismo sitio
                            continue;
                            
                        } catch (reconnectError) {
                            console.error(`❌ [${profileId}] Error reconectando: ${reconnectError.message}`);
                            throw new Error(`No se pudo reconectar navegador: ${reconnectError.message}`);
                        }
                    } else {
                        // Resetear contador si no hubo error de conexión
                        consecutiveConnectionErrors = 0;
                    }

                    // Actualizar estadísticas
                    sessionStats.cookiesCollected += siteResult.cookiesGained;
                    sessionStats.sitesVisited++;
                    sessionStats.totalInteractions += siteResult.interactions || 0;
                    sessionStats.humanBehaviorScore += siteResult.humanScore || 0;

                    // Emitir progreso de la sesión
                    this.emitSessionProgress(sessionId, profileId, {
                        cookiesCollected: sessionStats.cookiesCollected,
                        targetCookies: sessionStats.targetCookies,
                        sitesVisited: sessionStats.sitesVisited,
                        currentSite: website.domain || website.url,
                        progress: Math.min((sessionStats.cookiesCollected / sessionStats.targetCookies) * 100, 100)
                    });

                    // Registrar visita en base de datos
                    await this.registerSiteVisit(sessionStats, website, siteResult);

                    console.log(`📈 [${profileId}] +${siteResult.cookiesGained} cookies (Total: ${sessionStats.cookiesCollected}/${targetCookies})`);

                    // Pausa entre sitios para parecer humano
                    const pauseTime = this.randomBetween(3000, 8000);
                    await this.sleep(pauseTime);

                } catch (siteError) {
                    console.warn(`⚠️ [${profileId}] Error en ${website.domain}: ${siteError.message}`);
                    
                    // Si es error crítico de conexión, propagar hacia arriba
                    if (siteError.message.includes('Navegador perdió conexión permanentemente') ||
                        siteError.message.includes('No se pudo reconectar navegador')) {
                        throw siteError;
                    }
                }

                siteIndex++;
            }

            // Completar sesión
            sessionStats.endTime = new Date();
            sessionStats.success = true;
            sessionStats.humanBehaviorScore = Math.round(
                sessionStats.humanBehaviorScore / Math.max(sessionStats.sitesVisited, 1)
            );

            await this.completeSession(sessionStats);

            const totalTime = sessionStats.endTime - sessionStats.startTime;
            console.log(`\n✅ [${profileId}] Sesión completada:`);
            console.log(`   🍪 Cookies: ${sessionStats.cookiesCollected}/${targetCookies}`);
            console.log(`   🌐 Sitios: ${sessionStats.sitesVisited}`);
            console.log(`   ⏱️ Tiempo: ${Math.round(totalTime/60000)} minutos`);
            console.log(`   🎭 Puntuación humana: ${sessionStats.humanBehaviorScore}/100`);

            // Emitir evento de sesión completada
            this.emitSessionCompleted(sessionId, profileId, {
                cookiesCollected: sessionStats.cookiesCollected,
                sitesVisited: sessionStats.sitesVisited,
                duration: Date.now() - startTime,
                success: sessionStats.cookiesCollected >= sessionStats.targetCookies
            });

            return {
                profileId,
                success: true,
                cookiesCollected: sessionStats.cookiesCollected,
                sitesVisited: sessionStats.sitesVisited,
                totalInteractions: sessionStats.totalInteractions,
                humanBehaviorScore: sessionStats.humanBehaviorScore,
                duration: totalTime,
                targetReached: sessionStats.cookiesCollected >= targetCookies
            };

        } catch (error) {
            sessionStats.error = error.message;
            sessionStats.endTime = new Date();
            
            console.error(`❌ [${profileId}] Error en sesión: ${error.message}`);

            // Emitir evento de error de sesión
            this.emitSessionError(sessionId, profileId, error);
            
            return {
                profileId,
                success: false,
                error: error.message,
                cookiesCollected: sessionStats.cookiesCollected,
                sitesVisited: sessionStats.sitesVisited,
                duration: Date.now() - startTime
            };

        } finally {
            // Limpiar sesión activa
            this.activeSessions.delete(profileId);
            
            // Cerrar navegador
            if (browserInstance) {
                try {
                    await this.cleanupProfile(profileId, browserInstance);
                    console.log(`🧹 [${profileId}] Navegador cerrado`);
                } catch (cleanupError) {
                    console.warn(`⚠️ [${profileId}] Error cerrando navegador: ${cleanupError.message}`);
                }
            }
        }
    }

    /**
     * Procesa un sitio web con comportamiento humano realista
     * @param {Object} page - Página de Playwright
     * @param {Object} website - Datos del sitio web
     * @param {Object} sessionStats - Estadísticas de la sesión
     * @returns {Promise<Object>} Resultado del procesamiento
     */
    async processSiteWithHumanBehavior(page, website, sessionStats) {
        const cookiesBefore = await this.cookieDetector.getCookieCount(page);
        let visitSuccess = false;
        let errorMessage = null;
        let interactions = 0;
        let humanScore = 0;

        try {
            // erificar que la página siga disponible antes de navegar
            if (!page || (page.isClosed && page.isClosed())) {
                throw new Error('La página del navegador se ha cerrado');
            }

            // Verificar conexión del contexto
            try {
                await page.evaluate(() => document.readyState);
            } catch (evalError) {
                if (evalError.message.includes('Target page, context or browser has been closed')) {
                    throw new Error('Conexión del navegador perdida');
                }
            }

            // Navegar al sitio con reintentos
            let navigationSuccess = false;
            let navAttempt = 0;
            const maxNavAttempts = 3;

            while (!navigationSuccess && navAttempt < maxNavAttempts) {
                try {
                    navAttempt++;
                    console.log(`🔄 [${sessionStats.profileId}] Intento navegación ${navAttempt}/${maxNavAttempts} a ${website.domain}`);
                    
                    await page.goto(website.url, { 
                        waitUntil: 'domcontentloaded',
                        timeout: 30000 
                    });
                    
                    // Verificar que la navegación fue exitosa
                    const currentUrl = page.url();
                    if (currentUrl && currentUrl !== 'about:blank') {
                        navigationSuccess = true;
                        console.log(`✅ [${sessionStats.profileId}] Navegación exitosa a ${website.domain}`);
                    } else {
                        throw new Error('Navegación resultó en página en blanco');
                    }
                    
                } catch (navError) {
                    console.warn(`⚠️ [${sessionStats.profileId}] Error navegación intento ${navAttempt}: ${navError.message}`);
                    
                    // Si es error de conexión cerrada, no reintentar
                    // if (navError.message.includes('Target page, context or browser has been closed') ||
                    //     navError.message.includes('Browser has been closed')) {
                    //     throw new Error('Navegador desconectado durante navegación');
                    // }
                    
                    // Si no es el último intento, esperar antes del siguiente
                    if (navAttempt < maxNavAttempts) {
                        await this.sleep(2000);
                    }
                }
            }

            if (!navigationSuccess) {
                throw new Error(`No se pudo navegar a ${website.domain} después de ${maxNavAttempts} intentos`);
            }

            // Pequeña pausa inicial para estabilización
            await this.sleep(3000);

            // Verificar nuevamente que la página sigue disponible después de navegar
            try {
                await page.evaluate(() => document.readyState);
            } catch (evalError) {
                if (evalError.message.includes('Target page, context or browser has been closed')) {
                    throw new Error('Conexión perdida después de navegación');
                }
            }

            // Detectar y aceptar cookies automáticamente
            const cookieResult = await this.cookieDetector.acceptCookies(page);
            if (cookieResult.success) {
                console.log(`🍪 [${sessionStats.profileId}] Cookies aceptadas: ${cookieResult.method}`);
            }

            // Simular navegación humana en el sitio
            const navigationResult = await this.humanBehaviorSimulator.simulateHumanNavigation(
                page, 
                website, 
                {
                    maxTime: this.randomBetween(30000, 120000), // 30-120 segundos por sitio
                    priority: 'cookies',
                    targetCookies: sessionStats.targetCookies - sessionStats.cookiesCollected
                }
            );

            interactions = navigationResult.interactionsPerformed || 0;
            humanScore = navigationResult.humanLikeScore || 0;
            visitSuccess = true;

            console.log(`🎭 [${sessionStats.profileId}] Navegación humana: ${navigationResult.pagesVisited || 1} páginas, ${interactions} interacciones, score ${humanScore}/100`);

        } catch (error) {
            console.error(`⚠️ [${sessionStats.profileId}] Error en ${website.domain}: ${error.message}`);
            errorMessage = error.message;
            
            // Si el error es por conexión perdida, marcar para reconexión
            if (error.message.includes('Target page, context or browser has been closed') ||
                error.message.includes('Navegador desconectado') ||
                error.message.includes('Conexión perdida') ||
                error.message.includes('Browser has been closed')) {
                errorMessage = `CONEXION_PERDIDA: ${error.message}`;
            }
        }

        const cookiesAfter = await this.cookieDetector.getCookieCount(page);
        const cookiesGained = cookiesAfter - cookiesBefore;

        return {
            cookiesBefore,
            cookiesAfter,
            cookiesGained,
            success: visitSuccess,
            error: errorMessage,
            interactions,
            humanScore,
            duration: 0
        };
    }

    /**
     * Calcula tiempo mínimo de navegación (1 hora para 2500 cookies)
     * @param {number} targetCookies - Cantidad objetivo de cookies
     * @returns {number} Tiempo en millisegundos
     */
    calculateMinimumNavigationTime(targetCookies) {
        // Tiempo base: 1 hora para 2500 cookies
        const baseTime = 60 * 60 * 1000; // 1 hora
        const baseCookies = 2500;
        
        // Escalar proporcionalmente
        const calculatedTime = (targetCookies / baseCookies) * baseTime;
        
        // Mínimo 45 minutos, máximo 3 horas
        return Math.max(45 * 60 * 1000, Math.min(3 * 60 * 60 * 1000, calculatedTime));
    }

    /**
     * Inicia un perfil usando AdsPowerManager global
     * @param {string} profileId - ID del perfil
     * @returns {Promise<Object>} Instancia del navegador
     */
    async startProfile(profileId) {
        // Obtener AdsPowerManager
        const adsPowerManager = this.adsPowerManager;

        if (!adsPowerManager) {
            throw new Error('AdsPowerManager no disponible');
        }
        
        return await adsPowerManager.startProfile(profileId);
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
     * @param {number} percentage - Porcentaje de progreso (puede ser negativo)
     * @param {number} width - Ancho de la barra en caracteres
     * @returns {string} Barra de progreso visual
     */
    createProgressBar(percentage, width = 20) {
        // Validar y normalizar el porcentaje
        const normalizedPercentage = Math.max(0, Math.min(100, percentage || 0));
        
        // Calcular caracteres llenos y vacíos
        const filled = Math.max(0, Math.round((normalizedPercentage / 100) * width));
        const empty = Math.max(0, width - filled);
        
        // Crear la barra asegurando que no hay valores negativos
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    /**
     * Detiene todas las sesiones activas
     */
    async stopAllSessions() {
        // Detener todas las sesiones activas
        this.activeSessions.forEach(async (session, profileId) => {
            try {
                console.log(`🛑 Deteniendo sesión de perfil ${profileId}...`);
                await this.cleanupProfile(profileId, null);
                console.log(`✅ Sesión de perfil ${profileId} detenida`);
            } catch (error) {
                console.warn(`⚠️ Error deteniendo perfil ${profileId}:`, error.message);
            }
        });
        
        this.activeSessions.clear();
    }

    /**
     * Emite evento de progreso de sesión
     * @param {string} sessionId - ID de la sesión
     * @param {string} profileId - ID del perfil
     * @param {Object} data - Datos del progreso
     */
    emitSessionProgress(sessionId, profileId, data) {
        console.log(`📡 [DEBUG] Emitiendo session:progress para ${profileId}: ${data.cookiesCollected}/${data.targetCookies} cookies`);

        this.emit('session:progress', {
            sessionId,
            profileId,
            ...data
        });
    }

    /**
     * Emite evento de sesión iniciada
     * @param {string} sessionId - ID de la sesión
     * @param {string} profileId - ID del perfil
     */
    emitSessionStarted(sessionId, profileId) {
        console.log(`📡 [DEBUG] Emitiendo session:started para ${profileId}`);

        this.emit('session:started', {
            sessionId,
            profileId,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Emite evento de sesión completada
     * @param {string} sessionId - ID de la sesión
     * @param {string} profileId - ID del perfil
     * @param {Object} finalStats - Estadísticas finales
     */
    emitSessionCompleted(sessionId, profileId, finalStats) {
        this.emit('session:completed', {
            sessionId,
            profileId,
            finalStats,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Emite evento de error de sesión
     * @param {string} sessionId - ID de la sesión
     * @param {string} profileId - ID del perfil
     * @param {Error|string} error - Error ocurrido
     */
    emitSessionError(sessionId, profileId, error) {
        this.emit('session:error', {
            sessionId,
            profileId,
            error: error.message || error,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Emite estadísticas globales
     * @param {Object} stats - Estadísticas globales
     */
    emitGlobalStats(stats) {
        this.emit('global:stats', {
            ...stats,
            timestamp: new Date().toISOString()
        });
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