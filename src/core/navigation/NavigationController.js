import { EventEmitter } from 'events';
import CookieDetector from './CookieDetector.js';
import HumanBehaviorSimulator from './HumanBehaviorSimulator.js';

/**
 * Controlador principal de navegación
 * Coordina la navegación automática entre sitios web y recolección de cookies
 * Soporta múltiples perfiles simultáneos
 */
class NavigationController extends EventEmitter {
    constructor(databaseManager, configStore, adsPowerManager = null) {
        super(); // Llamar constructor de EventEmitter

        this.databaseManager = databaseManager;
        this.configStore = configStore;
        this.adsPowerManager = adsPowerManager;
        this.cookieDetector = new CookieDetector();
        this.humanBehaviorSimulator = new HumanBehaviorSimulator();
        this.activeSessions = new Map();
        this.stopFlags = new Map(); // Flags para detener sesiones individualmente
        this.globalStats = {
            totalSessions: 0,
            completedSessions: 0,
            totalCookiesCollected: 0,
            totalSitesVisited: 0,
            errors: 0,
            startTime: null
        };
    }

    //#region Setters
    /**
     * Establece flag de detención para una sesión específica
     * @param {string} profileId - ID del perfil a detener
     */
    setStopFlag(profileId) {
        this.stopFlags.set(profileId, true);
        console.log(`[${profileId}] Flag de detención establecido`);
    }
    //#endregion Setters

    //#region Public state queries
    /**
     * Cantidad de sesiones de navegación activas.
     * @returns {number}
     */
    getActiveSessionCount() {
        return this.activeSessions.size;
    }

    /**
     * Snapshot serializable de sesiones activas para enviar a la UI.
     * No expone las Maps internas — devuelve una copia plana.
     * @returns {Array<{profileId:string, sessionId:string, cookiesCollected:number, targetCookies:number, sitesVisited:number, status:string}>}
     */
    getActiveSessionsSnapshot() {
        const sessions = [];
        this.activeSessions.forEach((sessionData, profileId) => {
            sessions.push({
                profileId,
                sessionId: sessionData.sessionId,
                cookiesCollected: sessionData.cookiesCollected || 0,
                targetCookies: sessionData.targetCookies || 0,
                sitesVisited: sessionData.sitesVisited || 0,
                status: sessionData.status || 'running'
            });
        });
        return sessions;
    }
    /**
     * Devuelve el estado global agregado para consumo del renderer vía IPC.
     * Reusa getActiveSessionsSnapshot para no duplicar la lógica de serialización
     * y devuelve una copia superficial de globalStats para evitar mutación
     * accidental del estado interno.
     * @returns {{activeSessions: Array, globalStats: Object, isRunning: boolean}}
     */
    getGlobalStatus() {
        return {
            activeSessions: this.getActiveSessionsSnapshot(),
            globalStats: { ...this.globalStats },
            isRunning: this.activeSessions.size > 0
        };
    }
    //#endregion Public state queries

    //#region Starters
    /**
     * Inicia múltiples sesiones de navegación en paralelo
     * @param {Array|string} profileIds - Array de IDs o ID único de perfil
     * @param {number} targetCookies - Cantidad objetivo de cookies por perfil
     * @returns {Promise<Object>} Resultado agregado de todas las sesiones
     */
    async startMultipleNavigationSessions(profileIds, targetCookies = null) {
        const profiles = Array.isArray(profileIds) ? profileIds : [profileIds];
        const effectiveTarget = targetCookies || this.configStore.getDefaultCookieTarget();

        console.log(`Iniciando navegación con ${profiles.length} perfil(es)`);
        console.log(`Objetivo por perfil: ${effectiveTarget} cookies`);
        console.log(`Perfiles: ${profiles.join(', ')}`);

        this.globalStats.totalSessions = profiles.length;
        this.globalStats.startTime = new Date();

        // Emitir estadísticas globales actualizadas
        this.emitGlobalStats(this.globalStats);

        // Configurar WAL mode para SQLite (mejora concurrencia)
        await this.setupDatabaseConcurrency();

        // Iniciar todas las sesiones en paralelo
        const sessionPromises = profiles.map(profileId =>
            this.startSingleNavigationSession(profileId, effectiveTarget)
                .catch(error => {
                    console.error(`Error en perfil ${profileId}:`, error.message);
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
        
        console.log(`[${profileId}] Iniciando sesión...`);

        if (!this.adsPowerManager) {
            throw new Error('AdsPowerManager no está disponible en NavigationController');
        }

        // Emitir evento de sesión iniciada
        this.emitSessionStarted(sessionId, profileId, targetCookies);
        
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
            // SDD: must remain 'let' — page is reassigned in the reconnection path (line ~336).
            let page = browserInstance.page;
            
            console.log(`[${profileId}] Navegador iniciado`);

            // Establecer baseline inicial de cookies del perfil
            const initialCookieCount = await this.cookieDetector.getCookieCount(page, profileId);
            sessionStats.initialCookieBaseline = initialCookieCount;
            console.log(`[${profileId}] Baseline inicial: ${initialCookieCount} cookies`);

            // Obtener sitios web para navegar
            let websites = await this.databaseManager.getRandomWebsites(100);
            if (websites.length === 0) {
                throw new Error('No hay sitios web disponibles en la base de datos');
            }

            console.log(`[${profileId}] ${websites.length} sitios disponibles`);

            // Calcular tiempo mínimo para navegación realista
            const minimumTime = this.calculateMinimumNavigationTime(targetCookies);
            console.log(`[${profileId}] Tiempo mínimo: ${Math.round(minimumTime/60000)} minutos`);

            // Navegar por sitios hasta alcanzar objetivo Y tiempo mínimo
            let siteIndex = 0;
            const endTime = startTime + minimumTime;
            let consecutiveConnectionErrors = 0;
            const maxConnectionErrors = 3;

            // BUCLE PRINCIPAL: Continuar hasta cumplir AMBAS condiciones
            while (true) {
                // Verificar interrupción manual PRIMERO
                try {
                    this.checkStopFlagOrThrow(profileId);
                } catch (stopError) {
                    if (stopError.code === 'STOP_REQUESTED') {
                        console.log(`[${profileId}] Sesión interrumpida por flag de detención`);
                        throw stopError; // Propagar para salir completamente
                    }
                }

                const cookiesReached = sessionStats.cookiesCollected >= targetCookies;
                const timeReached = Date.now() >= endTime;
                
                // Solo terminar si se cumplieron AMBAS condiciones
                if (cookiesReached && timeReached) {
                    console.log(`[${profileId}] Objetivos completados: ${sessionStats.cookiesCollected}/${targetCookies} cookies en ${Math.round((Date.now() - startTime)/60000)} minutos`);
                    break;
                }
                
                // Mostrar progreso si ya alcanzó cookies pero sigue por tiempo
                if (cookiesReached && !timeReached) {
                    const remainingMinutes = Math.round((endTime - Date.now()) / 60000);
                    console.log(`[${profileId}] Objetivo alcanzado, continuando ${remainingMinutes} min más por realismo`);
                }

                // Si se acabaron los sitios, reiniciar la lista
                if (siteIndex >= websites.length) {
                    console.log(`[${profileId}] Reiniciando lista de sitios`);
                    siteIndex = 0;
                    websites = await this.databaseManager.getRandomWebsites(100);
                }

                const website = websites[siteIndex];
                sessionStats.currentSite = website.domain;
                
                console.log(`\n[${profileId}] Sitio ${siteIndex + 1}: ${website.domain}`);

                // Emitir progreso inmediatamente cuando comience navegación a un sitio
                this.emitSessionProgress(sessionId, profileId, {
                    cookiesCollected: sessionStats.cookiesCollected,
                    targetCookies: sessionStats.targetCookies,
                    sitesVisited: sessionStats.sitesVisited,
                    currentSite: website.domain || website.url,
                    progress: Math.min((sessionStats.cookiesCollected / sessionStats.targetCookies) * 100, 100)
                });
                
                try {
                    // Verificar que el navegador sigue conectado antes de procesar
                    try {
                        await page.evaluate(() => document.readyState);
                    } catch (evalError) {
                        if (evalError.message.includes('Target page, context or browser has been closed')) {
                            // Antes de intentar reconectar, verificar si fue detención manual
                            if (this.shouldStopSession(profileId)) {
                                console.log(`[${profileId}] Navegador cerrado debido a detención manual`);
                                const stopError = new Error('Sesión detenida por solicitud del usuario');
                                stopError.code = 'STOP_REQUESTED';
                                stopError.profileId = profileId;
                                throw stopError;
                            }
                            
                            consecutiveConnectionErrors++;
                            
                            if (consecutiveConnectionErrors >= maxConnectionErrors) {
                                throw new Error('CONEXION_PERDIDA: Navegador perdió conexión permanentemente');
                            }
                            
                            console.warn(`[${profileId}] Conexión perdida temporalmente, reintentando...`);
                            await this.sleep(2000);
                            
                            // Verificar otra vez después del sleep
                            this.checkStopFlagOrThrow(profileId);
                            
                            continue;
                        }
                        throw evalError;
                    }

                    // Resetear contador si la conexión está bien
                    consecutiveConnectionErrors = 0;
                    
                    // VERIFICACIÓN: Después de confirmar conexión
                    this.checkStopFlagOrThrow(profileId);

                    // Procesar sitio con comportamiento humano
                    const siteResult = await this.processSiteWithHumanBehavior(
                        page, 
                        website, 
                        sessionStats,
                        profileId,
                        sessionId
                    );

                    // Verificar si hubo error de conexión
                    if (siteResult.error && siteResult.error.startsWith('CONEXION_PERDIDA')) {
                        consecutiveConnectionErrors++;
                        console.warn(`[${profileId}] Error de conexión ${consecutiveConnectionErrors}/${maxConnectionErrors}: ${siteResult.error}`);
                        
                        if (consecutiveConnectionErrors >= maxConnectionErrors) {
                            console.error(`[${profileId}] Demasiados errores de conexión consecutivos, terminando sesión`);
                            throw new Error('Navegador perdió conexión permanentemente');
                        }
                        
                        // Intentar reconectar
                        console.log(`[${profileId}] Intentando reconectar navegador...`);
                        
                        try {
                            // Cerrar instancia actual si existe
                            if (browserInstance && browserInstance.browser) {
                                try {
                                    await browserInstance.browser.close();
                                } catch (closeError) {
                                    console.warn(`[${profileId}] Error cerrando navegador anterior: ${closeError.message}`);
                                }
                            }
                            
                            // Esperar antes de reconectar
                            await this.sleep(5000);

                            // Verificar si se debe detener la sesión antes de reconectar
                            if (this.shouldStopSession(profileId)) {
                                console.log(`[${profileId}] Pausa interrumpida por flag de detención`);
                                break;
                            }
                            
                            // Reconectar
                            browserInstance = await this.startProfile(profileId);
                            page = browserInstance.page;
                            
                            console.log(`[${profileId}] Navegador reconectado exitosamente`);
                            consecutiveConnectionErrors = 0; // Resetear contador
                            
                            // No incrementar siteIndex para reintentar el mismo sitio
                            continue;
                            
                        } catch (reconnectError) {
                            console.error(`[${profileId}] Error reconectando: ${reconnectError.message}`);
                            throw new Error(`No se pudo reconectar navegador: ${reconnectError.message}`);
                        }
                    } else {
                        // Resetear contador si no hubo error de conexión
                        consecutiveConnectionErrors = 0;
                    }

                    // Validar progreso antes de acumular
                    const progressValidation = this.validateCookieProgress(sessionStats, siteResult.cookiesGained);

                    // Aplicar ganancia validada
                    sessionStats.cookiesCollected += progressValidation.validatedGain;

                    // Log de ajustes si hubo cambios
                    if (progressValidation.wasAdjusted) {
                        console.warn(`[${profileId}] Progreso ajustado: ${progressValidation.originalGain} ${progressValidation.validatedGain} (${progressValidation.adjustmentReason})`);
                        console.log(`Total resultante: ${progressValidation.newTotal} (baseline: ${progressValidation.baseline})`);
                    }

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

                    await this.registerSiteVisit(sessionStats, website, siteResult);

                    console.log(`[${profileId}] +${siteResult.cookiesGained} cookies (Total: ${sessionStats.cookiesCollected}/${targetCookies})`);

                    // VERIFICACIÓN: Después de procesar sitio exitosamente
                    this.checkStopFlagOrThrow(profileId);

                    // Pausa entre sitios para parecer humano
                    const pauseTime = this.randomBetween(3000, 8000);
                    console.log(`[${profileId}] Pausa de ${Math.round(pauseTime/1000)}s antes del siguiente sitio`);
                    
                    // Hacer la pausa en incrementos pequeños para poder interrumpir rápidamente
                    const pauseIncrements = 500; // Verificar cada 500ms
                    const totalIncrements = Math.ceil(pauseTime / pauseIncrements);
                    
                    for (let i = 0; i < totalIncrements; i++) {
                        const currentIncrement = Math.min(pauseIncrements, pauseTime - (i * pauseIncrements));
                        await this.sleep(currentIncrement);
                        
                        // VERIFICACIÓN: Durante la pausa, cada 500ms
                        this.checkStopFlagOrThrow(profileId);
                    }

                } catch (siteError) {
                    // VERIFICACIÓN: Si el error es detención manual, propagar inmediatamente
                    if (siteError.code === 'STOP_REQUESTED') {
                        console.log(`[${profileId}] Detención detectada durante procesamiento de sitio`);
                        throw siteError;
                    }
                    
                    console.warn(`[${profileId}] Error en ${website.domain}: ${siteError.message}`);
                    
                    // VERIFICACIÓN: Antes de continuar con el siguiente sitio después de un error
                    if (this.shouldStopSession(profileId)) {
                        console.log(`[${profileId}] Detención solicitada después de error en sitio`);
                        const stopError = new Error('Sesión detenida por solicitud del usuario');
                        stopError.code = 'STOP_REQUESTED';
                        stopError.profileId = profileId;
                        throw stopError;
                    }
                    
                    // Si es error crítico de conexión, propagar hacia arriba
                    if (siteError.message.includes('Navegador perdió conexión permanentemente') ||
                        siteError.message.includes('No se pudo reconectar navegador')) {
                        throw siteError;
                    }
                }

                // VERIFICACIÓN: Antes de avanzar al siguiente sitio
                this.checkStopFlagOrThrow(profileId);

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
            console.log(`\n[${profileId}] Sesión completada:`);
            console.log(`Cookies: ${sessionStats.cookiesCollected}/${targetCookies}`);
            console.log(`Sitios: ${sessionStats.sitesVisited}`);
            console.log(`Tiempo: ${Math.round(totalTime/60000)} minutos (mín: ${Math.round(minimumTime/60000)})`);
            console.log(`Puntuación humana: ${sessionStats.humanBehaviorScore}/100`);

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
            // Verificar si es detención intencional del usuario
            if (error.code === 'STOP_REQUESTED') {
                console.log(`[${profileId}] Sesión detenida correctamente por solicitud del usuario`);
                
                sessionStats.success = false;
                sessionStats.error = 'Detenido por el usuario';
                sessionStats.endTime = new Date();
                
                // Registrar como detenida, no como error
                await this.markSessionStopped(sessionStats, 'stopped_manually');
                
                // NO emitir como error, sino como detenida
                this.emit('session:stopped', {
                    sessionId,
                    profileId,
                    reason: 'user_request',
                    stats: {
                        cookiesCollected: sessionStats.cookiesCollected,
                        sitesVisited: sessionStats.sitesVisited
                    },
                    timestamp: new Date().toISOString()
                });
                
                return {
                    profileId,
                    success: true, // Marcar como success porque se detuvo limpiamente
                    stopped: true,
                    reason: 'user_request',
                    cookiesCollected: sessionStats.cookiesCollected,
                    sitesVisited: sessionStats.sitesVisited
                };
            }
            
            // Error genuino (no detención intencional)
            console.error(`[${profileId}] Error en sesión:`, error.message);
            
            sessionStats.success = false;
            sessionStats.error = error.message;
            sessionStats.endTime = new Date();
            
            // Registrar error en base de datos
            await this.markSessionStopped(sessionStats, 'error');
            
            this.emitSessionError(sessionId, profileId, error);
            
            return {
                profileId,
                success: false,
                error: error.message,
                cookiesCollected: sessionStats.cookiesCollected,
                sitesVisited: sessionStats.sitesVisited
            };

        } finally {
            // Limpiar sesión activa
            this.activeSessions.delete(profileId);
            
            // Cerrar navegador
            if (browserInstance) {
                try {
                    await this.cleanupProfile(profileId, browserInstance);
                    console.log(`[${profileId}] Navegador cerrado`);
                } catch (cleanupError) {
                    console.warn(`[${profileId}] Error cerrando navegador: ${cleanupError.message}`);
                }
            }
        }
    }

    /**
     * Inicia un perfil usando el AdsPowerManager inyectado por DI.
     * @param {string} profileId - ID del perfil
     * @returns {Promise<Object>} Instancia del navegador
     */
    async startProfile(profileId) {
        if (!this.adsPowerManager) {
            throw new Error('AdsPowerManager no disponible');
        }
        return await this.adsPowerManager.startProfile(profileId);
    }
    //#endregion Starters

    /**
     * Procesa un sitio web con comportamiento humano realista
     * @param {Object} page - Página de Playwright
     * @param {Object} website - Datos del sitio web
     * @param {Object} sessionStats - Estadísticas de la sesión
     * @param {string} profileId - ID del perfil
     * @param {string} sessionId - ID de la sesión
     * @returns {Promise<Object>} Resultado del procesamiento
     */
    async processSiteWithHumanBehavior(page, website, sessionStats, profileId, sessionId) {
        const cookiesBefore = await this.cookieDetector.getCookieCount(page, sessionStats.profileId);

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
                    console.log(`[${sessionStats.profileId}] Intento navegación ${navAttempt}/${maxNavAttempts} a ${website.domain}`);
                    
                    await page.goto(website.url, { 
                        waitUntil: 'domcontentloaded',
                        timeout: 30000 
                    });
                    
                    // Verificar que la navegación fue exitosa
                    const currentUrl = page.url();
                    if (currentUrl && currentUrl !== 'about:blank') {
                        navigationSuccess = true;
                        console.log(`[${sessionStats.profileId}] Navegación exitosa a ${website.domain}`);

                        // Actualizar sitio actual antes de intentar navegar
                        this.emitSessionProgress(sessionId, profileId, {
                            cookiesCollected: sessionStats.cookiesCollected,
                            targetCookies: sessionStats.targetCookies,
                            sitesVisited: sessionStats.sitesVisited,
                            currentSite: `Navegando a ${website.domain}...`,
                            progress: Math.min((sessionStats.cookiesCollected / sessionStats.targetCookies) * 100, 100)
                        });
                    } else {
                        throw new Error('Navegación resultó en página en blanco');
                    }
                    
                } catch (navError) {
                    console.warn(`[${sessionStats.profileId}] Error navegación intento ${navAttempt}: ${navError.message}`);
                    
                    // Si no es el último intento, esperar antes del siguiente
                    if (navAttempt < maxNavAttempts) {
                        await this.sleep(2000);

                        // Verificar si se debe detener la sesión antes de reintentar
                        if (this.shouldStopSession(profileId)) {
                            console.log(`[${profileId}] Pausa interrumpida por flag de detención`);
                            break;
                        }
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
                console.log(`[${sessionStats.profileId}] Cookies aceptadas: ${cookieResult.method}`);
            }

            // Verificar si se debe detener la sesión antes de simular comportamiento humano
            if (this.shouldStopSession(profileId || sessionStats.profileId)) {
                console.log(`[${sessionStats.profileId}] Simulación humana interrumpida por flag de detención`);
                return {
                    success: false,
                    error: 'SESION_DETENIDA: Navegación interrumpida por usuario',
                    cookiesGained: 0,
                    interactions: 0,
                    humanScore: 0
                };
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

            console.log(`[${sessionStats.profileId}] Navegación humana: ${navigationResult.pagesVisited || 1} páginas, ${interactions} interacciones, score ${humanScore}/100`);

        } catch (error) {
            console.error(`[${sessionStats.profileId}] Error en ${website.domain}: ${error.message}`);
            errorMessage = error.message;
            
            // Si el error es por conexión perdida, marcar para reconexión
            if (error.message.includes('Target page, context or browser has been closed') ||
                error.message.includes('Navegador desconectado') ||
                error.message.includes('Conexión perdida') ||
                error.message.includes('Browser has been closed')) {
                errorMessage = `CONEXION_PERDIDA: ${error.message}`;
            }
        }

        const cookiesAfter = await this.cookieDetector.getCookieCount(page, sessionStats.profileId);
        
        const cookieDiff = this.cookieDetector.cookieCounterManager.calculateSafeCookieDifference(
            cookiesBefore, 
            cookiesAfter, 
            { 
                profileId: sessionStats.profileId,
                allowNegative: false,
                maxNegativeDiff: -50
            }
        );

        const cookiesGained = cookieDiff.safeDifference;

        if (cookieDiff.wasAdjusted) {
            console.warn(`[${sessionStats.profileId}] Diferencia ajustada: ${cookieDiff.rawDifference} ${cookieDiff.safeDifference} (${cookieDiff.adjustmentReason})`);
        }

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
     * Calcula tiempo mínimo realista para navegación humana
     * @param {number} targetCookies - Objetivo de cookies
     * @returns {number} Tiempo mínimo en milisegundos
     */
    calculateMinimumNavigationTime(targetCookies) {
        // Tiempo base: 1-2 horas (aleatorio para cada sesión)
        const baseTimeMinutes = this.randomBetween(60, 120); // 1-2 horas
        
        // Si el objetivo es mayor a 2500, aumentar tiempo proporcionalmente
        let adjustedTimeMinutes = baseTimeMinutes;
        if (targetCookies > 2500) {
            const extraRatio = targetCookies / 2500;
            adjustedTimeMinutes = baseTimeMinutes * extraRatio;
        }
        
        return adjustedTimeMinutes * 60 * 1000; // Convertir a milisegundos
    }

    /**
     * Valida que el progreso de cookies sea consistente y realista
     * @param {Object} sessionStats - Estadísticas de la sesión
     * @param {number} siteGained - Cookies ganadas en el sitio actual
     * @returns {Object} Resultado de validación con valor seguro
     */
    validateCookieProgress(sessionStats, siteGained) {
        const currentTotal = sessionStats.cookiesCollected;
        const proposedTotal = currentTotal + siteGained;
        const baseline = sessionStats.initialCookieBaseline || 0;
        const profileId = sessionStats.profileId;
        
        // Validación 1: No permitir caídas drásticas
        const minimumAllowed = Math.max(0, baseline - 100);
        
        // Validación 2: No permitir saltos irreales
        const maximumGainPerSite = 500; // Máximo realista por sitio
        
        // Validación 3: Detectar patrones sospechosos
        const isSuspiciousLoss = siteGained < -50;
        const isSuspiciousGain = siteGained > maximumGainPerSite;
        
        let validatedGain = siteGained;
        let adjustmentReason = null;
        
        if (isSuspiciousLoss) {
            console.warn(`[${profileId}] Pérdida sospechosa detectada: ${siteGained} cookies`);
            validatedGain = 0; // No aplicar pérdidas grandes
            adjustmentReason = 'suspicious_loss_prevented';
        } else if (isSuspiciousGain) {
            console.warn(`[${profileId}] Ganancia sospechosa detectada: ${siteGained} cookies`);
            validatedGain = Math.min(siteGained, 100); // Limitar a ganancia realista
            adjustmentReason = 'excessive_gain_capped';
        } else if (proposedTotal < minimumAllowed) {
            console.warn(`[${profileId}] Total propuesto (${proposedTotal}) menor que mínimo (${minimumAllowed})`);
            validatedGain = minimumAllowed - currentTotal; // Ajustar para alcanzar mínimo
            adjustmentReason = 'minimum_threshold_enforced';
        }
        
        return {
            originalGain: siteGained,
            validatedGain: validatedGain,
            wasAdjusted: validatedGain !== siteGained,
            adjustmentReason: adjustmentReason,
            newTotal: currentTotal + validatedGain,
            baseline: baseline
        };
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
                console.log(`[${sessionStats.profileId}] Cookies aceptadas en ${website.domain}`);
            }
            
            // Simular navegación básica (scroll, tiempo en página)
            await this.simulateBasicNavigation(page);
            
            visitSuccess = true;
            
        } catch (error) {
            console.error(`[${sessionStats.profileId}] Error en ${website.domain}:`, error.message);
            errorMessage = error.message;
        }
        
        const cookiesAfter = await this.cookieDetector.getCookieCount(page);
        const cookiesGained = cookiesAfter - cookiesBefore;
        
        if (cookiesGained > 0) {
            console.log(`[${sessionStats.profileId}] +${cookiesGained} cookies de ${website.domain}`);
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
            
            console.log('Base de datos configurada para concurrencia');
        } catch (error) {
            console.warn('No se pudo optimizar la base de datos:', error.message);
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
            console.warn(`Error registrando sesión ${sessionStats.profileId}:`, error.message);
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
            console.warn(`Error registrando visita:`, error.message);
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
            console.warn(`Error completando sesión:`, error.message);
        }
    }

    /**
     * Marca una sesión como interrumpida en la base de datos
     * @param {Object} sessionStats - Estadísticas de la sesión
     * @param {string} reason - Razón de la interrupción (ej: "stopped_manually", "error")
     */
    async markSessionStopped(sessionStats, reason = 'stopped_manually') {
        try {
            const currentTime = new Date().toISOString();
            const status = reason === 'error' ? 'error' : 'stopped';
            
            await this.databaseManager.db.runAsync(`
                UPDATE navigation_sessions 
                SET completed_at = ?, 
                    cookies_collected = ?, 
                    sites_visited = ?, 
                    status = ?,
                    error_log = ?
                WHERE session_id = ?
            `, [
                currentTime,
                sessionStats.cookiesCollected || 0,
                sessionStats.sitesVisited || 0,
                status,
                reason,
                sessionStats.sessionId
            ]);
            
            console.log(`[${sessionStats.profileId}] Sesión marcada como ${status} en BD`);
            
        } catch (error) {
            console.warn(`Error marcando sesión como detenida:`, error.message);
        }
    }

    /**
     * Muestra progreso global de todas las sesiones
     */
    showGlobalProgress() {
        const activeSessions = Array.from(this.activeSessions.values());
        if (activeSessions.length === 0) return;
        
        console.log('\nPROGRESO GLOBAL:');
        console.log('═'.repeat(60));
        
        activeSessions.forEach(session => {
            const progress = Math.min((session.cookiesCollected / session.targetCookies) * 100, 100);
            const progressBar = this.createProgressBar(progress);
            
            console.log(`[${session.profileId}] ${progressBar} ${progress.toFixed(1)}% (${session.cookiesCollected}/${session.targetCookies})`);
            if (session.currentSite) {
                console.log(`Actual: ${session.currentSite}`);
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
        console.log('\nREPORTE FINAL DE NAVEGACIÓN');
        console.log('═'.repeat(80));
        console.log(`Perfiles procesados: ${stats.totalProfiles}`);
        console.log(`Exitosos: ${stats.successfulProfiles}`);
        console.log(`Fallidos: ${stats.failedProfiles}`);
        console.log(`Total cookies recolectadas: ${stats.totalCookiesCollected}`);
        console.log(`Total sitios visitados: ${stats.totalSitesVisited}`);
        console.log(`Promedio cookies/perfil: ${stats.averageCookiesPerProfile.toFixed(0)}`);
        console.log(`Duración total: ${(stats.duration / 1000 / 60).toFixed(1)} minutos`);
        console.log(`Tasa de éxito: ${stats.successRate.toFixed(1)}%`);
        
        console.log('\nDETALLE POR PERFIL:');
        stats.results.forEach(result => {
            const status = result.success ? '✅' : '❌';
            const target = result.targetReached ? '🎯' : '⏳';
            console.log(`${status} ${target} [${result.profileId}] ${result.cookiesCollected} cookies, ${result.sitesVisited} sitios`);
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
     * Emite evento de progreso de sesión
     * @param {string} sessionId - ID de la sesión
     * @param {string} profileId - ID del perfil
     * @param {Object} data - Datos del progreso
     */
    emitSessionProgress(sessionId, profileId, data) {
        console.log(`[DEBUG] Emitiendo session:progress para ${profileId}: ${data.cookiesCollected}/${data.targetCookies} cookies`);

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
     * @param {number} targetCookies - Objetivo de cookies para esta sesión
     */
    emitSessionStarted(sessionId, profileId, targetCookies) {
        console.log(`[DEBUG] Emitiendo session:started para ${profileId} con objetivo ${targetCookies} cookies`);

        this.emit('session:started', {
            sessionId,
            profileId,
            targetCookies,
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

    //#region Stop
    /**
     * Detiene todas las sesiones activas de forma segura y completa
     * @returns {Promise<void>}
     */
    async stopAllSessions() {
        console.log(`Iniciando detención de ${this.activeSessions.size} sesiones activas...`);
        
        if (this.activeSessions.size === 0) {
            console.log('No hay sesiones activas para detener');
            return;
        }
        
        // PASO 1: Establecer flags de detención para todas las sesiones
        const profileIds = Array.from(this.activeSessions.keys());
        profileIds.forEach(profileId => {
            this.setStopFlag(profileId);
            console.log(`[${profileId}] Flag de detención establecido`);
        });
        
        // PASO 2: Crear array de promesas para limpiar todas las sesiones en paralelo
        const cleanupPromises = profileIds.map(async (profileId) => {
            try {
                console.log(`Deteniendo sesión de perfil ${profileId}...`);
                
                // Obtener datos de la sesión activa
                const sessionData = this.activeSessions.get(profileId);
                const browserInstance = sessionData?.browserInstance || sessionData;
                
                // Llamar a cleanupProfile con la instancia correcta del navegador
                await this.cleanupProfile(profileId, browserInstance);
                
                console.log(`Sesión de perfil ${profileId} detenida`);
                return { profileId, success: true };
                
            } catch (error) {
                console.warn(`Error deteniendo perfil ${profileId}: ${error.message}`);
                return { profileId, success: false, error: error.message };
            }
        });
        
        // PASO 3: Esperar a que todas las operaciones de limpieza terminen
        try {
            const results = await Promise.allSettled(cleanupPromises);
            
            // PASO 4: Reportar resultados
            let successCount = 0;
            let errorCount = 0;
            
            results.forEach((result, index) => {
                const profileId = profileIds[index];
                
                if (result.status === 'fulfilled' && result.value.success) {
                    successCount++;
                } else {
                    errorCount++;
                    const error = result.status === 'rejected' ? result.reason : result.value.error;
                    console.error(`[${profileId}] Falló detención: ${error}`);
                }
            });
            
            console.log(`Detención completada: ${successCount} exitosas, ${errorCount} con errores`);
            
        } catch (error) {
            console.error(`Error crítico durante detención masiva: ${error.message}`);
        }

        // PASO 5: Actualizar base de datos para sesiones no completadas
        console.log('Actualizando base de datos para sesiones interrumpidas...');
        for (const [profileId, sessionStats] of this.activeSessions) {
            try {
                // Marcar sesión como detenida manualmente
                await this.markSessionStopped(sessionStats, 'stopped_manually');
            } catch (error) {
                console.warn(`Error actualizando sesión ${profileId} en BD:`, error.message);
            }
        }
        
        // PASO 6: Limpiar todas las estructuras internas como failsafe
        this.activeSessions.clear();
        this.stopFlags.clear();
        
        // PASO 7: Reiniciar estadísticas globales
        this.globalStats = {
            totalSessions: 0,
            completedSessions: 0,
            totalCookiesCollected: 0,
            totalSitesVisited: 0,
            errors: 0,
            startTime: null
        };
        
        console.log('Todas las sesiones han sido procesadas y recursos limpiados');
    }

    /**
     * Verifica si una sesión debe detenerse
     * @param {string} profileId - ID del perfil
     * @returns {boolean} True si debe detenerse
     */
    shouldStopSession(profileId) {
        return this.stopFlags.get(profileId) === true;
    }

    /**
     * Verifica si una sesión debe detenerse y lanza excepción si es necesario
     * @param {string} profileId - ID del perfil
     * @throws {Error} Lanza error especial STOP_REQUESTED si debe detenerse
     */
    checkStopFlagOrThrow(profileId) {
        if (this.stopFlags.get(profileId) === true) {
            console.log(`[${profileId}] Stop flag detectado - interrumpiendo operación`);
            const error = new Error('Sesión detenida por solicitud del usuario');
            error.code = 'STOP_REQUESTED';
            error.profileId = profileId;
            throw error;
        }
    }

    /**
     * Limpia flag de detención para una sesión
     * @param {string} profileId - ID del perfil
     */
    clearStopFlag(profileId) {
        this.stopFlags.delete(profileId);
    }

    /**
     * Limpia completamente un perfil y sus recursos asociados
     * @param {string} profileId - ID del perfil a limpiar
     * @param {Object} browserInstance - Instancia del navegador (opcional)
     * @returns {Promise<void>}
     */
    async cleanupProfile(profileId, browserInstance = null) {
        console.log(`[${profileId}] Iniciando limpieza completa del perfil...`);
        
        try {
            // PASO 1: Establecer flag de detención inmediatamente
            this.setStopFlag(profileId);
            
            // PASO 2: Obtener instancia del navegador si no se proporcionó
            if (!browserInstance && this.activeSessions.has(profileId)) {
                const sessionData = this.activeSessions.get(profileId);
                browserInstance = sessionData.browserInstance || sessionData;
            }
            
            // PASO 3: Cerrar navegador de Playwright si existe
            if (browserInstance) {
                try {
                    // Cerrar todas las páginas primero
                    if (browserInstance.context) {
                        const pages = browserInstance.context.pages();
                        for (const page of pages) {
                            try {
                                if (!page.isClosed()) {
                                    await page.close();
                                }
                            } catch (pageError) {
                                console.warn(`[${profileId}] Error cerrando página: ${pageError.message}`);
                            }
                        }
                    }
                    
                    // Cerrar el navegador completo
                    if (browserInstance.browser && !browserInstance.browser.isConnected || !browserInstance.browser.isConnected()) {
                        await browserInstance.browser.close();
                        console.log(`[${profileId}] Navegador Playwright cerrado`);
                    } else {
                        console.log(`[${profileId}] Navegador ya estaba cerrado`);
                    }
                    
                } catch (browserError) {
                    console.warn(`[${profileId}] Error cerrando navegador Playwright: ${browserError.message}`);
                }
            }
            
            // PASO 4: Detener perfil en Ads Power
            try {
                if (this.adsPowerManager) {
                    await this.adsPowerManager.stopProfile(profileId);
                    console.log(`[${profileId}] Perfil detenido en Ads Power`);
                } else {
                    console.warn(`[${profileId}] AdsPowerManager no disponible`);
                }
            } catch (adsPowerError) {
                console.warn(`[${profileId}] Error deteniendo perfil en Ads Power: ${adsPowerError.message}`);
            }
            
            // PASO 5: Limpiar de sesiones activas
            this.activeSessions.delete(profileId);
            
            // PASO 6: Limpiar flag de detención
            this.clearStopFlag(profileId);
            
            // PASO 7: Emitir evento de sesión detenida
            this.emit('session:stopped', {
                profileId,
                timestamp: new Date().toISOString(),
                reason: 'manual_stop'
            });
            
            console.log(`[${profileId}] Limpieza completa finalizada`);
            
        } catch (error) {
            console.error(`[${profileId}] Error durante limpieza: ${error.message}`);
            
            // Asegurar que al menos se limpie de las estructuras internas
            this.activeSessions.delete(profileId);
            this.clearStopFlag(profileId);
            
            throw error;
        }
    }
    //#endregion Stop
}

export default NavigationController;