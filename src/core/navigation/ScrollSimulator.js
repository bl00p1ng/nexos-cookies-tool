/**
 * Simulador de scroll natural y patrones de lectura humana
 * Implementa movimientos progresivos que simulan lectura real
 */
class ScrollSimulator {
    constructor() {
        this.scrollHistory = [];
        this.readingPattern = this.generateReadingPattern();
        this.currentScrollPosition = 0;
    }

    /**
     * Simula lectura de página con scroll progresivo
     * @param {Object} page - Página de Playwright
     * @param {Object} options - Opciones de lectura
     * @returns {Promise<Object>} Resultado de la simulación
     */
    async simulateReading(page, options = {}) {
        const {
            totalTime = 30000,
            contentMetrics = {},
            humanState = { fatigue: 0, attentionSpan: 1 }
        } = options;

        console.log(`📖 Iniciando simulación de lectura por ${Math.round(totalTime/1000)}s`);

        const startTime = Date.now();
        let scrollActions = 0;
        let totalScrollDistance = 0;

        try {
            // Obtener dimensiones de la página
            const pageMetrics = await this.getPageMetrics(page);
            console.log(`📏 Página: ${pageMetrics.totalHeight}px alto, viewport: ${pageMetrics.viewportHeight}px`);

            // Calcular patrón de lectura basado en contenido
            const readingSegments = this.calculateReadingSegments(pageMetrics, contentMetrics, totalTime);
            console.log(`📋 Planificados ${readingSegments.length} segmentos de lectura`);

            // Resetear posición de scroll
            await page.evaluate(() => window.scrollTo(0, 0));
            this.currentScrollPosition = 0;

            // Ejecutar cada segmento de lectura
            for (let i = 0; i < readingSegments.length; i++) {
                const segment = readingSegments[i];
                
                console.log(`📖 Segmento ${i + 1}: scroll a ${segment.targetPosition}px por ${Math.round(segment.readingTime/1000)}s`);

                // Scroll hacia la posición objetivo
                const scrollResult = await this.scrollToPositionNaturally(page, segment.targetPosition, segment.scrollSpeed);
                scrollActions += scrollResult.actions;
                totalScrollDistance += scrollResult.distance;

                // Simular tiempo de lectura en esa posición
                await this.simulateReadingPause(segment.readingTime, humanState);

                // Micro-scrolls ocasionales durante la lectura
                if (Math.random() > 0.6 && segment.readingTime > 5000) {
                    const microScrolls = await this.performMicroScrollsDuringReading(page, segment.readingTime * 0.3);
                    scrollActions += microScrolls.actions;
                    totalScrollDistance += microScrolls.distance;
                }

                // Verificar si deberíamos detenernos por fatiga
                if (this.shouldStopReading(humanState, i, readingSegments.length)) {
                    console.log('😴 Deteniendo lectura por fatiga');
                    break;
                }
            }

            // Scroll final aleatorio (exploración)
            if (Math.random() > 0.7) {
                const finalScroll = await this.performFinalExploration(page, pageMetrics);
                scrollActions += finalScroll.actions;
                totalScrollDistance += finalScroll.distance;
            }

            const result = {
                scrollActions,
                totalScrollDistance,
                timeSpent: Date.now() - startTime,
                segmentsCompleted: readingSegments.length,
                finalPosition: await page.evaluate(() => window.pageYOffset),
                readingEfficiency: this.calculateReadingEfficiency(pageMetrics, totalScrollDistance, totalTime)
            };

            console.log(`✅ Lectura completada: ${scrollActions} acciones, ${Math.round(totalScrollDistance)}px recorridos`);
            return result;

        } catch (error) {
            console.error('❌ Error en simulación de lectura:', error.message);
            return {
                scrollActions,
                totalScrollDistance,
                timeSpent: Date.now() - startTime,
                error: error.message
            };
        }
    }

    /**
     * Realiza scroll natural hacia una posición específica
     * @param {Object} page - Página de Playwright
     * @param {number} targetPosition - Posición objetivo en pixels
     * @param {string} speed - Velocidad del scroll ('slow', 'medium', 'fast')
     * @returns {Promise<Object>} Resultado del scroll
     */
    async scrollToPositionNaturally(page, targetPosition, speed = 'medium') {
        const currentPos = await page.evaluate(() => window.pageYOffset);
        const distance = Math.abs(targetPosition - currentPos);
        
        if (distance < 10) {
            return { actions: 0, distance: 0 };
        }

        let actions = 0;
        let totalDistance = 0;

        // Configuración de velocidades
        const speedConfigs = {
            slow: { stepSize: { min: 50, max: 150 }, delay: { min: 200, max: 500 } },
            medium: { stepSize: { min: 100, max: 250 }, delay: { min: 100, max: 300 } },
            fast: { stepSize: { min: 200, max: 400 }, delay: { min: 50, max: 150 } }
        };

        const config = speedConfigs[speed] || speedConfigs.medium;
        const direction = targetPosition > currentPos ? 1 : -1;

        let currentPosition = currentPos;

        while (Math.abs(targetPosition - currentPosition) > 20) {
            // Calcular paso de scroll con variación
            const stepSize = this.randomBetween(config.stepSize.min, config.stepSize.max);
            const scrollStep = Math.min(stepSize, Math.abs(targetPosition - currentPosition));
            
            const newPosition = currentPosition + (scrollStep * direction);

            // Realizar scroll
            await page.evaluate((pos) => {
                window.scrollTo({
                    top: pos,
                    behavior: 'auto' // Usamos auto para control manual de velocidad
                });
            }, newPosition);

            currentPosition = newPosition;
            totalDistance += scrollStep;
            actions++;

            // Pausa variable entre scrolls
            const delay = this.randomBetween(config.delay.min, config.delay.max);
            await this.sleep(delay);

            // Ocasionalmente, hacer una pausa más larga (distracción)
            if (Math.random() > 0.9) {
                await this.sleep(this.randomBetween(500, 1500));
            }
        }

        this.currentScrollPosition = currentPosition;
        this.recordScrollAction(currentPos, targetPosition, totalDistance, speed);

        return { actions, distance: totalDistance };
    }

    /**
     * Realiza micro-scrolls durante la lectura
     * @param {Object} page - Página de Playwright
     * @param {number} duration - Duración en millisegundos
     * @returns {Promise<Object>} Resultado de los micro-scrolls
     */
    async performMicroScrollsDuringReading(page, duration) {
        const startTime = Date.now();
        let actions = 0;
        let totalDistance = 0;

        while (Date.now() - startTime < duration) {
            // Pequeño scroll aleatorio (simulando ajuste de posición para leer)
            const microScroll = this.randomBetween(-30, 50); // Principalmente hacia abajo
            
            await page.evaluate((delta) => {
                window.scrollBy(0, delta);
            }, microScroll);

            totalDistance += Math.abs(microScroll);
            actions++;

            // Pausa entre micro-scrolls
            await this.sleep(this.randomBetween(2000, 5000));
        }

        return { actions, distance: totalDistance };
    }

    /**
     * Realiza scroll de exploración final
     * @param {Object} page - Página de Playwright
     * @param {Object} pageMetrics - Métricas de la página
     * @returns {Promise<Object>} Resultado de la exploración
     */
    async performFinalExploration(page, pageMetrics) {
        console.log('🔍 Realizando exploración final');
        
        let actions = 0;
        let totalDistance = 0;

        // Decidir tipo de exploración
        const explorationTypes = ['bottom', 'random', 'top'];
        const explorationType = explorationTypes[Math.floor(Math.random() * explorationTypes.length)];

        switch (explorationType) {
            case 'bottom':
                // Scroll rápido hasta el final
                const scrollToBottom = await this.scrollToPositionNaturally(
                    page, 
                    pageMetrics.totalHeight - pageMetrics.viewportHeight, 
                    'fast'
                );
                actions += scrollToBottom.actions;
                totalDistance += scrollToBottom.distance;
                break;

            case 'random':
                // Algunos scrolls aleatorios
                for (let i = 0; i < 3; i++) {
                    const randomPos = Math.random() * pageMetrics.totalHeight;
                    const randomScroll = await this.scrollToPositionNaturally(page, randomPos, 'medium');
                    actions += randomScroll.actions;
                    totalDistance += randomScroll.distance;
                    await this.sleep(this.randomBetween(1000, 2000));
                }
                break;

            case 'top':
                // Volver al inicio
                const scrollToTop = await this.scrollToPositionNaturally(page, 0, 'medium');
                actions += scrollToTop.actions;
                totalDistance += scrollToTop.distance;
                break;
        }

        return { actions, distance: totalDistance };
    }

    /**
     * Realiza un micro-scroll simple
     * @param {Object} page - Página de Playwright
     */
    async performMicroScroll(page) {
        const scrollDelta = this.randomBetween(-20, 40);
        
        await page.evaluate((delta) => {
            window.scrollBy(0, delta);
        }, scrollDelta);

        this.currentScrollPosition += scrollDelta;
    }

    /**
     * Simula pausa de lectura humana
     * @param {number} duration - Duración de la pausa
     * @param {Object} humanState - Estado humano actual
     */
    async simulateReadingPause(duration, humanState) {
        // Ajustar duración por fatiga y atención
        const fatigueMultiplier = 1 - (humanState.fatigue * 0.3);
        const attentionMultiplier = humanState.attentionSpan;
        
        const adjustedDuration = duration * fatigueMultiplier * attentionMultiplier;

        // Pausas con pequeñas interrupciones ocasionales
        const chunks = Math.floor(adjustedDuration / 3000); // Chunks de 3 segundos
        
        for (let i = 0; i < chunks; i++) {
            await this.sleep(3000);
            
            // Ocasionalmente, pequeña pausa extra (distracción)
            if (Math.random() > 0.8) {
                await this.sleep(this.randomBetween(500, 1500));
            }
        }

        // Tiempo restante
        const remaining = adjustedDuration % 3000;
        if (remaining > 0) {
            await this.sleep(remaining);
        }
    }

    /**
     * Obtiene métricas de la página para scroll
     * @param {Object} page - Página de Playwright
     * @returns {Promise<Object>} Métricas de la página
     */
    async getPageMetrics(page) {
        return await page.evaluate(() => {
            return {
                totalHeight: document.body.scrollHeight,
                viewportHeight: window.innerHeight,
                viewportWidth: window.innerWidth,
                currentScroll: window.pageYOffset
            };
        });
    }

    /**
     * Calcula segmentos de lectura basado en contenido
     * @param {Object} pageMetrics - Métricas de la página
     * @param {Object} contentMetrics - Métricas del contenido
     * @param {number} totalTime - Tiempo total disponible
     * @returns {Array} Array de segmentos de lectura
     */
    calculateReadingSegments(pageMetrics, contentMetrics, totalTime) {
        const segments = [];
        const readableHeight = pageMetrics.totalHeight - pageMetrics.viewportHeight;
        
        if (readableHeight <= 0) {
            return [{ targetPosition: 0, readingTime: totalTime, scrollSpeed: 'slow' }];
        }

        // Determinar número de segmentos basado en altura de página
        const segmentCount = Math.min(8, Math.max(3, Math.floor(readableHeight / pageMetrics.viewportHeight) + 1));
        const timePerSegment = totalTime / segmentCount;

        for (let i = 0; i < segmentCount; i++) {
            const progress = i / (segmentCount - 1);
            const targetPosition = progress * readableHeight;
            
            // Tiempo de lectura con variación
            const baseTime = timePerSegment;
            const variation = baseTime * 0.3 * (Math.random() - 0.5);
            const readingTime = Math.max(2000, baseTime + variation);

            // Velocidad de scroll basada en progreso
            let scrollSpeed = 'medium';
            if (i === 0) scrollSpeed = 'slow';  // Inicio más lento
            else if (i === segmentCount - 1) scrollSpeed = 'slow'; // Final más lento
            else if (Math.random() > 0.7) scrollSpeed = 'fast'; // Ocasionalmente rápido

            segments.push({
                targetPosition: Math.round(targetPosition),
                readingTime: Math.round(readingTime),
                scrollSpeed,
                segmentIndex: i
            });
        }

        return segments;
    }

    /**
     * Determina si se debe parar la lectura por fatiga
     * @param {Object} humanState - Estado humano
     * @param {number} currentSegment - Segmento actual
     * @param {number} totalSegments - Total de segmentos
     * @returns {boolean} True si debe parar
     */
    shouldStopReading(humanState, currentSegment, totalSegments) {
        // Probabilidad de parar aumenta con fatiga
        const fatigueStopProbability = humanState.fatigue * 0.3;
        
        // Menor probabilidad de parar al inicio
        if (currentSegment < 2) return false;
        
        // Mayor probabilidad de parar si está muy cansado
        if (humanState.fatigue > 0.8 && Math.random() < fatigueStopProbability) {
            return true;
        }

        return false;
    }

    /**
     * Calcula eficiencia de lectura
     * @param {Object} pageMetrics - Métricas de página
     * @param {number} totalScrollDistance - Distancia total scrolleada
     * @param {number} totalTime - Tiempo total
     * @returns {number} Puntuación de eficiencia 0-100
     */
    calculateReadingEfficiency(pageMetrics, totalScrollDistance, totalTime) {
        // Puntuación base
        let efficiency = 50;

        // Bonus por cobertura de página
        const coverage = Math.min(1, totalScrollDistance / pageMetrics.totalHeight);
        efficiency += coverage * 30;

        // Bonus por tiempo apropiado (no muy rápido, no muy lento)
        const timeScore = totalTime > 10000 && totalTime < 180000 ? 20 : 0;
        efficiency += timeScore;

        return Math.min(100, Math.round(efficiency));
    }

    /**
     * Genera patrón de lectura personalizado
     * @returns {Object} Patrón de lectura
     */
    generateReadingPattern() {
        return {
            readingSpeed: this.randomBetween(180, 320), // WPM
            scrollPreference: Math.random() > 0.5 ? 'gradual' : 'jumping',
            attentionSpan: 0.7 + Math.random() * 0.3, // 0.7 - 1.0
            explorationTendency: Math.random() // 0 - 1
        };
    }

    /**
     * Registra acción de scroll en historial
     * @param {number} startPos - Posición inicial
     * @param {number} endPos - Posición final
     * @param {number} distance - Distancia scrolleada
     * @param {string} speed - Velocidad utilizada
     */
    recordScrollAction(startPos, endPos, distance, speed) {
        this.scrollHistory.push({
            timestamp: Date.now(),
            startPosition: startPos,
            endPosition: endPos,
            distance,
            speed,
            direction: endPos > startPos ? 'down' : 'up'
        });

        // Mantener solo las últimas 50 acciones
        if (this.scrollHistory.length > 50) {
            this.scrollHistory.shift();
        }
    }

    /**
     * Obtiene estadísticas del comportamiento de scroll
     * @returns {Object} Estadísticas
     */
    getScrollStats() {
        if (this.scrollHistory.length === 0) return null;

        const totalDistance = this.scrollHistory.reduce((sum, action) => sum + action.distance, 0);
        const avgDistance = totalDistance / this.scrollHistory.length;
        
        const downScrolls = this.scrollHistory.filter(action => action.direction === 'down').length;
        const upScrolls = this.scrollHistory.filter(action => action.direction === 'up').length;

        return {
            totalActions: this.scrollHistory.length,
            totalDistance,
            averageDistance: avgDistance,
            downScrollPercentage: (downScrolls / this.scrollHistory.length) * 100,
            upScrollPercentage: (upScrolls / this.scrollHistory.length) * 100,
            readingPattern: this.readingPattern
        };
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

export default ScrollSimulator;