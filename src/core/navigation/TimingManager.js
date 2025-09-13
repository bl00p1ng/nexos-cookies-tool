/**
 * Gestor de tiempos y pausas humanas realistas
 * Controla los ritmos de navegación para simular comportamiento humano natural
 */
class TimingManager {
    constructor() {
        this.timingProfile = this.generateTimingProfile();
        this.sessionMetrics = {
            startTime: Date.now(),
            totalPauses: 0,
            totalPauseTime: 0,
            actionHistory: []
        };
    }

    /**
     * Realiza pausa humana basada en el contexto
     * @param {string} context - Contexto de la pausa ('reading', 'decision', 'click_hesitation', etc.)
     * @param {number} fatigueLevel - Nivel de fatiga 0-1
     * @param {Object} options - Opciones adicionales
     * @returns {Promise<number>} Tiempo real de pausa en ms
     */
    async humanPause(context, fatigueLevel = 0, options = {}) {
        const pauseTime = this.calculatePauseTime(context, fatigueLevel, options);
        
        console.log(`⏱️ Pausa ${context}: ${Math.round(pauseTime/1000)}s (fatiga: ${Math.round(fatigueLevel*100)}%)`);
        
        // Realizar pausa con posibles micro-interrupciones
        await this.performPauseWithVariation(pauseTime, context);
        
        // Registrar pausa para análisis
        this.recordPause(context, pauseTime, fatigueLevel);
        
        return pauseTime;
    }

    /**
     * Calcula tiempo de pausa basado en contexto y estado humano
     * @param {string} context - Contexto de la pausa
     * @param {number} fatigueLevel - Nivel de fatiga
     * @param {Object} options - Opciones adicionales
     * @returns {number} Tiempo de pausa en millisegundos
     */
    calculatePauseTime(context, fatigueLevel, options = {}) {
        // Configuraciones base por contexto
        const contextConfigs = {
            reading: {
                base: { min: 2000, max: 8000 },
                description: 'Tiempo de lectura por sección'
            },
            decision: {
                base: { min: 800, max: 2500 },
                description: 'Tiempo para decidir siguiente acción'
            },
            click_hesitation: {
                base: { min: 200, max: 800 },
                description: 'Hesitación antes de hacer clic'
            },
            page_processing: {
                base: { min: 1000, max: 3000 },
                description: 'Tiempo para procesar nueva página'
            },
            hover: {
                base: { min: 300, max: 1200 },
                description: 'Tiempo de hover antes de clic'
            },
            distraction: {
                base: { min: 2000, max: 6000 },
                description: 'Pausa por distracción'
            },
            fatigue_break: {
                base: { min: 5000, max: 15000 },
                description: 'Descanso por fatiga'
            },
            content_analysis: {
                base: { min: 1500, max: 4000 },
                description: 'Análisis inicial de contenido'
            },
            typing_delay: {
                base: { min: 100, max: 500 },
                description: 'Delay entre teclas'
            },
            scroll_pause: {
                base: { min: 500, max: 2000 },
                description: 'Pausa entre scrolls'
            }
        };

        const config = contextConfigs[context] || contextConfigs.decision;
        
        // Tiempo base
        let pauseTime = this.randomBetween(config.base.min, config.base.max);

        // Ajustes por fatiga
        pauseTime = this.applyFatigueAdjustment(pauseTime, fatigueLevel, context);

        // Ajustes por perfil de timing personal
        pauseTime = this.applyPersonalityAdjustment(pauseTime, context);

        // Ajustes por tiempo de sesión
        pauseTime = this.applySessionAdjustment(pauseTime);

        // Ajustes por opciones específicas
        if (options.urgency) {
            pauseTime *= (1 - options.urgency * 0.5); // Reducir tiempo si hay urgencia
        }

        if (options.complexity) {
            pauseTime *= (1 + options.complexity * 0.3); // Aumentar tiempo si es complejo
        }

        // Variación final aleatoria
        const variation = pauseTime * 0.2 * (Math.random() - 0.5);
        pauseTime += variation;

        // Límites mínimos y máximos
        return Math.max(50, Math.min(30000, Math.round(pauseTime)));
    }

    /**
     * Realiza pausa con micro-variaciones realistas
     * @param {number} totalTime - Tiempo total de pausa
     * @param {string} context - Contexto de la pausa
     */
    async performPauseWithVariation(totalTime, context) {
        const startTime = Date.now();
        let remainingTime = totalTime;

        // Para pausas largas, dividir en segmentos con micro-interrupciones
        if (totalTime > 5000) {
            while (remainingTime > 1000) {
                const segmentTime = Math.min(remainingTime, this.randomBetween(2000, 4000));
                await this.sleep(segmentTime);
                remainingTime -= segmentTime;

                // Micro-interrupción ocasional
                if (remainingTime > 1000 && Math.random() > 0.8) {
                    const microBreak = this.randomBetween(100, 500);
                    await this.sleep(microBreak);
                    remainingTime -= microBreak;
                }
            }
        }

        // Tiempo restante
        if (remainingTime > 0) {
            await this.sleep(remainingTime);
        }

        this.sessionMetrics.totalPauses++;
        this.sessionMetrics.totalPauseTime += Date.now() - startTime;
    }

    /**
     * Aplica ajustes por fatiga al tiempo de pausa
     * @param {number} baseTime - Tiempo base
     * @param {number} fatigueLevel - Nivel de fatiga 0-1
     * @param {string} context - Contexto
     * @returns {number} Tiempo ajustado
     */
    applyFatigueAdjustment(baseTime, fatigueLevel, context) {
        // La fatiga afecta diferentes contextos de manera distinta
        const fatigueMultipliers = {
            reading: 1 + fatigueLevel * 0.8,     // Lectura más lenta cuando cansado
            decision: 1 + fatigueLevel * 1.2,    // Decisiones más lentas
            click_hesitation: 1 + fatigueLevel * 0.5, // Ligero aumento en hesitación
            page_processing: 1 + fatigueLevel * 0.6,  // Procesamiento más lento
            hover: 1 + fatigueLevel * 0.3,       // Poco efecto en hover
            distraction: 1 + fatigueLevel * 2.0  // Más distracciones cuando cansado
        };

        const multiplier = fatigueMultipliers[context] || (1 + fatigueLevel * 0.5);
        return baseTime * multiplier;
    }

    /**
     * Aplica ajustes por personalidad al timing
     * @param {number} baseTime - Tiempo base
     * @param {string} context - Contexto
     * @returns {number} Tiempo ajustado
     */
    applyPersonalityAdjustment(baseTime, context) {
        const profile = this.timingProfile;
        
        let multiplier = 1;

        // Ajuste por velocidad general
        multiplier *= profile.speed;

        // Ajustes específicos por contexto
        switch (context) {
            case 'reading':
                multiplier *= profile.readingPace;
                break;
            case 'decision':
                multiplier *= profile.decisiveness;
                break;
            case 'click_hesitation':
                multiplier *= profile.confidence;
                break;
            case 'distraction':
                multiplier *= profile.focus;
                break;
        }

        return baseTime * multiplier;
    }

    /**
     * Aplica ajustes por duración de sesión
     * @param {number} baseTime - Tiempo base
     * @returns {number} Tiempo ajustado
     */
    applySessionAdjustment(baseTime) {
        const sessionDuration = Date.now() - this.sessionMetrics.startTime;
        const sessionMinutes = sessionDuration / (1000 * 60);

        // Ligero aumento de tiempos después de 30 minutos
        if (sessionMinutes > 30) {
            const slowdownFactor = Math.min(1.3, 1 + (sessionMinutes - 30) * 0.01);
            return baseTime * slowdownFactor;
        }

        return baseTime;
    }

    /**
     * Calcula tiempo mínimo de navegación para mantener realismo
     * @param {number} targetCookies - Cantidad objetivo de cookies
     * @param {boolean} enforceMinimum - Si debe forzar mínimo de 1 hora
     * @returns {number} Tiempo mínimo en millisegundos
     */
    calculateMinimumNavigationTime(targetCookies, enforceMinimum = true) {
        // Tiempo base mínimo de 1 hora para 2500 cookies (por defecto)
        const baseMinimumTime = 60 * 60 * 1000; // 1 hora en ms
        const baseCookies = 2500;

        if (!enforceMinimum) {
            // Modo de prueba rápida: 2-5 minutos
            return this.randomBetween(2 * 60 * 1000, 5 * 60 * 1000);
        }

        // Escalar tiempo basado en cantidad de cookies
        const timePerCookie = baseMinimumTime / baseCookies;
        const calculatedTime = targetCookies * timePerCookie;

        // Mínimo absoluto de 45 minutos, máximo de 3 horas
        const minimumTime = Math.max(45 * 60 * 1000, calculatedTime);
        const maximumTime = 3 * 60 * 60 * 1000;

        return Math.min(maximumTime, minimumTime);
    }

    /**
     * Distribuye tiempo total entre sitios web de forma realista
     * @param {number} totalTime - Tiempo total disponible
     * @param {number} siteCount - Número de sitios a visitar
     * @returns {Array} Array de tiempos por sitio
     */
    distributeTimeAcrossSites(totalTime, siteCount) {
        const siteTimings = [];
        let remainingTime = totalTime;

        for (let i = 0; i < siteCount; i++) {
            let siteTime;
            
            if (i === siteCount - 1) {
                // Último sitio: usar tiempo restante
                siteTime = remainingTime;
            } else {
                // Calcular tiempo para este sitio con variación
                const averageTimePerSite = remainingTime / (siteCount - i);
                const variation = averageTimePerSite * 0.4 * (Math.random() - 0.5);
                siteTime = Math.max(
                    30000, // Mínimo 30 segundos por sitio
                    Math.round(averageTimePerSite + variation)
                );
                
                // No gastar más del 60% del tiempo restante en un solo sitio
                siteTime = Math.min(siteTime, remainingTime * 0.6);
            }

            remainingTime -= siteTime;
            siteTimings.push({
                siteIndex: i,
                allocatedTime: siteTime,
                priority: this.calculateSitePriority(i, siteCount)
            });
        }

        return siteTimings;
    }

    /**
     * Calcula prioridad de un sitio basado en posición
     * @param {number} siteIndex - Índice del sitio
     * @param {number} totalSites - Total de sitios
     * @returns {string} Prioridad ('high', 'medium', 'low')
     */
    calculateSitePriority(siteIndex, totalSites) {
        const progress = siteIndex / totalSites;
        
        if (progress < 0.3) return 'high';      // Primeros sitios: alta prioridad
        if (progress < 0.7) return 'medium';   // Sitios medios: prioridad media
        return 'low';                          // Últimos sitios: baja prioridad
    }

    /**
     * Genera perfil de timing personalizado
     * @returns {Object} Perfil de timing
     */
    generateTimingProfile() {
        return {
            speed: 0.8 + Math.random() * 0.4,          // 0.8-1.2x velocidad base
            readingPace: 0.7 + Math.random() * 0.6,    // 0.7-1.3x velocidad lectura
            decisiveness: 0.6 + Math.random() * 0.8,   // 0.6-1.4x velocidad decisiones
            confidence: 0.8 + Math.random() * 0.4,     // 0.8-1.2x confianza (menos hesitación)
            focus: 0.5 + Math.random() * 1.0,          // 0.5-1.5x capacidad de foco
            patience: 0.6 + Math.random() * 0.8,       // 0.6-1.4x paciencia
            consistency: 0.7 + Math.random() * 0.6     // 0.7-1.3x consistencia temporal
        };
    }

    /**
     * Registra una pausa en el historial
     * @param {string} context - Contexto de la pausa
     * @param {number} duration - Duración real
     * @param {number} fatigueLevel - Nivel de fatiga
     */
    recordPause(context, duration, fatigueLevel) {
        this.sessionMetrics.actionHistory.push({
            timestamp: Date.now(),
            action: 'pause',
            context,
            duration,
            fatigueLevel
        });

        // Mantener solo las últimas 100 acciones
        if (this.sessionMetrics.actionHistory.length > 100) {
            this.sessionMetrics.actionHistory.shift();
        }
    }

    /**
     * Calcula tiempo de espera para carga de página
     * @param {string} pageType - Tipo de página ('heavy', 'light', 'medium')
     * @param {number} fatigueLevel - Nivel de fatiga
     * @returns {number} Tiempo de espera en ms
     */
    calculatePageLoadWaitTime(pageType = 'medium', fatigueLevel = 0) {
        const baseWaitTimes = {
            light: { min: 500, max: 1500 },
            medium: { min: 1000, max: 3000 },
            heavy: { min: 2000, max: 5000 }
        };

        const config = baseWaitTimes[pageType] || baseWaitTimes.medium;
        let waitTime = this.randomBetween(config.min, config.max);

        // Personas cansadas son menos pacientes
        if (fatigueLevel > 0.5) {
            waitTime *= 0.7; // Reducir tiempo de espera
        }

        // Aplicar personalidad
        waitTime *= this.timingProfile.patience;

        return Math.round(waitTime);
    }

    /**
     * Simula tiempo de "pensamiento" antes de una acción
     * @param {string} actionType - Tipo de acción ('click', 'type', 'navigate')
     * @param {number} complexity - Complejidad 0-1
     * @returns {Promise<number>} Tiempo de pensamiento
     */
    async simulateThinkingTime(actionType, complexity = 0.5) {
        const baseThinkingTimes = {
            click: { min: 200, max: 800 },
            type: { min: 500, max: 2000 },
            navigate: { min: 800, max: 2500 },
            scroll: { min: 100, max: 500 }
        };

        const config = baseThinkingTimes[actionType] || baseThinkingTimes.click;
        let thinkingTime = this.randomBetween(config.min, config.max);

        // Ajustar por complejidad
        thinkingTime *= (1 + complexity * 0.5);

        // Aplicar personalidad
        thinkingTime *= this.timingProfile.decisiveness;

        // Realizar pausa
        await this.sleep(Math.round(thinkingTime));
        
        return thinkingTime;
    }

    /**
     * Calcula intervalos entre visitas a sitios
     * @param {number} siteIndex - Índice del sitio actual
     * @param {number} totalSites - Total de sitios
     * @returns {number} Intervalo en ms
     */
    calculateSiteTransitionTime(siteIndex, totalSites) {
        // Tiempo base entre sitios
        let baseTime = this.randomBetween(1000, 3000);

        // Primeros sitios: transiciones más rápidas (entusiasmo)
        if (siteIndex < 3) {
            baseTime *= 0.7;
        }
        // Últimos sitios: transiciones más lentas (fatiga)
        else if (siteIndex > totalSites - 3) {
            baseTime *= 1.3;
        }

        // Aplicar personalidad
        baseTime *= this.timingProfile.consistency;

        return Math.round(baseTime);
    }

    /**
     * Obtiene estadísticas de timing de la sesión
     * @returns {Object} Estadísticas de timing
     */
    getTimingStats() {
        const sessionDuration = Date.now() - this.sessionMetrics.startTime;
        const avgPauseTime = this.sessionMetrics.totalPauseTime / this.sessionMetrics.totalPauses || 0;
        
        // Analizar patrones de pausas
        const pausesByContext = {};
        this.sessionMetrics.actionHistory
            .filter(action => action.action === 'pause')
            .forEach(pause => {
                if (!pausesByContext[pause.context]) {
                    pausesByContext[pause.context] = {
                        count: 0,
                        totalTime: 0,
                        avgTime: 0
                    };
                }
                pausesByContext[pause.context].count++;
                pausesByContext[pause.context].totalTime += pause.duration;
            });

        // Calcular promedios por contexto
        Object.keys(pausesByContext).forEach(context => {
            const data = pausesByContext[context];
            data.avgTime = data.totalTime / data.count;
        });

        return {
            sessionDuration,
            totalPauses: this.sessionMetrics.totalPauses,
            totalPauseTime: this.sessionMetrics.totalPauseTime,
            averagePauseTime: avgPauseTime,
            pausesByContext,
            timingProfile: this.timingProfile,
            pausePercentage: (this.sessionMetrics.totalPauseTime / sessionDuration) * 100
        };
    }

    /**
     * Evalúa qué tan humano parece el timing
     * @returns {number} Puntuación de humanidad 0-100
     */
    evaluateTimingHumanness() {
        const stats = this.getTimingStats();
        let score = 50; // Score base

        // Bonus por variedad de tipos de pausas
        const contextVariety = Object.keys(stats.pausesByContext).length;
        score += Math.min(20, contextVariety * 3);

        // Bonus por porcentaje realista de pausas (20-40% es humano)
        const pausePercentage = stats.pausePercentage;
        if (pausePercentage > 15 && pausePercentage < 45) {
            score += 15;
        }

        // Bonus por duración promedio de pausas realista
        if (stats.averagePauseTime > 500 && stats.averagePauseTime < 5000) {
            score += 10;
        }

        // Penalización por demasiada consistencia (comportamiento robótico)
        const consistency = this.calculateTimingConsistency();
        if (consistency > 0.9) {
            score -= 20; // Demasiado consistente = robótico
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Calcula consistencia de timing (para detectar comportamiento robótico)
     * @returns {number} Consistencia 0-1
     */
    calculateTimingConsistency() {
        const recentPauses = this.sessionMetrics.actionHistory
            .filter(action => action.action === 'pause')
            .slice(-10); // Últimas 10 pausas

        if (recentPauses.length < 3) return 0;

        const durations = recentPauses.map(pause => pause.duration);
        const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
        
        // Calcular desviación estándar
        const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
        const stdDev = Math.sqrt(variance);
        
        // Coeficiente de variación (menor = más consistente)
        const coefficientOfVariation = stdDev / mean;
        
        // Convertir a escala 0-1 (1 = muy consistente, 0 = muy variable)
        return Math.max(0, 1 - coefficientOfVariation);
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
     * Utilidad para pausas
     * @param {number} ms - Millisegundos a esperar
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default TimingManager;