import MouseMovementSimulator from './MouseMovementSimulator.js';
import ScrollSimulator from './ScrollSimulator.js';
import TimingManager from './TimingManager.js';
import NavigationPatternGenerator from './NavigationPatternGenerator.js';
import ContentAnalyzer from './ContentAnalyzer.js';
import LinkSelector from './LinkSelector.js';

/**
 * Sistema de simulación de comportamiento humano para navegación web
 * Implementa patrones realistas de interacción para evitar detección como bot
 * Basado en las especificaciones del Anexo A
 */
class HumanBehaviorSimulator {
    constructor() {
        this.mouseSimulator = new MouseMovementSimulator();
        this.scrollSimulator = new ScrollSimulator();
        this.timingManager = new TimingManager();
        this.patternGenerator = new NavigationPatternGenerator();
        this.contentAnalyzer = new ContentAnalyzer();
        this.linkSelector = new LinkSelector();
        
        // Estado del comportamiento humano
        this.humanState = {
            fatigue: 0,                    // Nivel de fatiga (0-1)
            attentionSpan: 1,              // Capacidad de atención actual
            readingSpeed: this.generateReadingSpeed(),  // WPM personalizado
            mousePosition: { x: 0, y: 0 }, // Posición actual del mouse
            sessionStartTime: Date.now(),
            interactionHistory: []
        };
    }

    /**
     * Simula navegación humana completa en un sitio web
     * @param {Object} page - Página de Playwright
     * @param {Object} website - Datos del sitio web
     * @param {Object} options - Opciones de navegación
     * @returns {Promise<Object>} Resultado de la navegación
     */
    async simulateHumanNavigation(page, website, options = {}) {
        const startTime = Date.now();
        const siteType = await this.contentAnalyzer.detectSiteType(page, website);
        const pattern = this.patternGenerator.generatePattern(siteType);
        
        console.log(`[HUMAN] Iniciando navegación humana en ${website.domain} (tipo: ${siteType})`);
        
        const navigationResult = {
            siteType,
            pattern,
            pagesVisited: 0,
            timeSpent: 0,
            interactionsPerformed: 0,
            humanLikeScore: 0,
            success: false
        };

        try {
            // Determinar cuántas páginas visitar basado en el patrón
            const pagesToVisit = this.calculatePagesToVisit(pattern, options);
            const visitedUrls = [page.url()];
            
            console.log(`Planificado visitar ${pagesToVisit} páginas`);

            for (let i = 0; i < pagesToVisit; i++) {
                console.log(`\nPágina ${i + 1}/${pagesToVisit} - ${page.url()}`);
                
                // Simular lectura de la página actual
                const readingResult = await this.simulatePageReading(page, pattern);
                navigationResult.interactionsPerformed += readingResult.interactions;
                
                // Actualizar fatiga y atención
                this.updateHumanState(readingResult.timeSpent);
                
                // Si no es la última página, buscar siguiente enlace
                if (i < pagesToVisit - 1) {
                    const nextLink = await this.findAndClickNextLink(page, pattern, visitedUrls);
                    if (nextLink) {
                        visitedUrls.push(nextLink.href);
                        navigationResult.pagesVisited++;
                        
                        // Esperar carga de nueva página con comportamiento humano
                        await this.waitForPageLoadHuman(page);
                    } else {
                        console.log('No se encontraron más enlaces válidos');
                        break;
                    }
                } else {
                    navigationResult.pagesVisited++;
                }
            }

            navigationResult.timeSpent = Date.now() - startTime;
            navigationResult.humanLikeScore = this.calculateHumanLikeScore(navigationResult);
            navigationResult.success = true;
            
            console.log(`Navegación completada: ${navigationResult.pagesVisited} páginas en ${Math.round(navigationResult.timeSpent/1000)}s`);
            console.log(`Puntuación de humanidad: ${navigationResult.humanLikeScore}/100`);
            
            return navigationResult;
            
        } catch (error) {
            console.error('Error en navegación humana:', error.message);
            navigationResult.error = error.message;
            return navigationResult;
        }
    }

    /**
     * Simula la lectura humana de una página
     * @param {Object} page - Página de Playwright
     * @param {Object} pattern - Patrón de navegación
     * @returns {Promise<Object>} Resultado de la lectura
     */
    async simulatePageReading(page, pattern) {
        const startTime = Date.now();
        let interactions = 0;

        try {
            // Análisis inicial del contenido
            const contentMetrics = await this.contentAnalyzer.analyzePageContent(page);
            console.log(`Análisis: ${contentMetrics.wordCount} palabras, ${contentMetrics.images} imágenes`);

            // Calcular tiempo de lectura basado en contenido y fatiga
            const readingTime = this.calculateReadingTime(contentMetrics, pattern);
            console.log(`Tiempo de lectura estimado: ${Math.round(readingTime/1000)}s`);

            // Simular movimientos iniciales del mouse
            await this.mouseSimulator.performInitialMovements(page);
            interactions++;

            // Scroll progresivo simulando lectura
            const scrollResult = await this.scrollSimulator.simulateReading(page, {
                totalTime: readingTime,
                contentMetrics,
                humanState: this.humanState
            });
            interactions += scrollResult.scrollActions;

            // Micro-interacciones aleatorias durante la lectura
            if (Math.random() > 0.7) {
                await this.performMicroInteractions(page);
                interactions++;
            }

            // Pausa final antes de decidir siguiente acción
            await this.timingManager.humanPause('decision', this.humanState.fatigue);

            return {
                timeSpent: Date.now() - startTime,
                interactions,
                contentMetrics,
                readingTime
            };

        } catch (error) {
            console.warn('Error simulando lectura:', error.message);
            return {
                timeSpent: Date.now() - startTime,
                interactions,
                error: error.message
            };
        }
    }

    /**
     * Encuentra y hace clic en el siguiente enlace válido
     * @param {Object} page - Página de Playwright
     * @param {Object} pattern - Patrón de navegación
     * @param {Array} visitedUrls - URLs ya visitadas
     * @returns {Promise<Object|null>} Información del enlace clicado
     */
    async findAndClickNextLink(page, pattern, visitedUrls) {
        try {
            // Analizar enlaces disponibles
            const availableLinks = await this.linkSelector.analyzeAvailableLinks(page);
            console.log(`Enlaces encontrados: ${availableLinks.length}`);
            
            if (availableLinks.length === 0) {
                return null;
            }

            // Seleccionar enlace basado en patrón y preferencias humanas
            const selectedLink = this.linkSelector.selectNextLink(
                availableLinks, 
                visitedUrls, 
                pattern,
                this.humanState
            );

            if (!selectedLink) {
                console.log('No hay enlaces válidos para visitar');
                return null;
            }

            console.log(`Seleccionado: ${selectedLink.text} (${selectedLink.href})`);

            // Intentar múltiples estrategias para hacer clic en el enlace
            const clickSuccess = await this.performRobustLinkClick(page, selectedLink);
            
            if (clickSuccess) {
                return selectedLink;
            } else {
                console.warn('No se pudo hacer clic en el enlace, continuando...');
                return null;
            }

        } catch (error) {
            console.warn('Error buscando siguiente enlace:', error.message);
            return null;
        }
    }

    /**
     * Realiza clic en enlace con múltiples estrategias de fallback
     * @param {Object} page - Página de Playwright
     * @param {Object} selectedLink - Enlace seleccionado
     * @returns {Promise<boolean>} True si el clic fue exitoso
     */
    async performRobustLinkClick(page, selectedLink) {
        const strategies = [
            () => this.clickWithMouseSimulation(page, selectedLink),
            () => this.clickWithDirectSelector(page, selectedLink),
            () => this.clickWithNavigation(page, selectedLink)
        ];

        for (let i = 0; i < strategies.length; i++) {
            try {
                console.log(`Intentando estrategia ${i + 1}/3...`);
                const success = await strategies[i]();
                if (success) {
                    console.log(`Estrategia ${i + 1} exitosa`);
                    return true;
                }
            } catch (error) {
                console.warn(`Estrategia ${i + 1} falló: ${error.message}`);
            }
        }

        return false;
    }

    /**
     * Estrategia 1: Clic con simulación de mouse
     * @param {Object} page - Página de Playwright
     * @param {Object} selectedLink - Enlace seleccionado
     * @returns {Promise<boolean>} True si fue exitoso
     */
    async clickWithMouseSimulation(page, selectedLink) {
        const linkElement = await page.$(selectedLink.selector);
        if (!linkElement) return false;

        // Verificar que el elemento sea clickeable
        const isVisible = await linkElement.isVisible();
        if (!isVisible) return false;

        try {
            // Movimiento del mouse hacia el enlace
            await this.mouseSimulator.moveToElementNaturally(page, linkElement);
            
            // Pausa antes del clic
            await this.timingManager.humanPause('click_hesitation', this.humanState.fatigue);
            
            // Hover con timeout reducido
            await linkElement.hover({ timeout: 5000 });
            
            // Clic con comportamiento humano
            await this.performHumanClick(linkElement);
            
            // Verificar navegación
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            return true;

        } catch (error) {
            // Si hay error de hover por popup, intentar clic directo
            if (error.message.includes('intercepts pointer events') || 
                error.message.includes('Timeout')) {
                try {
                    await this.performHumanClick(linkElement);
                    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
                    return true;
                } catch (clickError) {
                    throw clickError;
                }
            }
            throw error;
        }
    }

    /**
     * Estrategia 2: Clic directo con selector
     * @param {Object} page - Página de Playwright
     * @param {Object} selectedLink - Enlace seleccionado
     * @returns {Promise<boolean>} True si fue exitoso
     */
    async clickWithDirectSelector(page, selectedLink) {
        try {
            await page.click(selectedLink.selector, { timeout: 5000 });
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Estrategia 3: Navegación directa por URL
     * @param {Object} page - Página de Playwright
     * @param {Object} selectedLink - Enlace seleccionado
     * @returns {Promise<boolean>} True si fue exitoso
     */
    async clickWithNavigation(page, selectedLink) {
        try {
            // Solo para enlaces internos válidos
            if (selectedLink.href && selectedLink.href.startsWith('http')) {
                await page.goto(selectedLink.href, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 15000 
                });
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Realiza un clic con comportamiento humano
     * @param {Object} element - Elemento a hacer clic
     */
    async performHumanClick(element) {
        // Posible hover antes del clic
        if (Math.random() > 0.7) {
            await element.hover();
            await this.timingManager.humanPause('hover', this.humanState.fatigue);
        }

        // Clic con pequeña variación de posición
        const box = await element.boundingBox();
        if (box) {
            const clickX = box.x + box.width * (0.3 + Math.random() * 0.4);
            const clickY = box.y + box.height * (0.3 + Math.random() * 0.4);
            
            await element.click({ position: { x: clickX - box.x, y: clickY - box.y } });
        } else {
            await element.click();
        }

        this.humanState.interactionHistory.push({
            type: 'click',
            timestamp: Date.now(),
            fatigue: this.humanState.fatigue
        });
    }

    /**
     * Realiza micro-interacciones para parecer más humano
     * @param {Object} page - Página de Playwright
     */
    async performMicroInteractions(page) {
        const interactions = [
            () => this.mouseSimulator.performRandomMovement(page),
            () => this.scrollSimulator.performMicroScroll(page),
            () => this.timingManager.humanPause('distraction', this.humanState.fatigue)
        ];

        const selectedInteraction = interactions[Math.floor(Math.random() * interactions.length)];
        await selectedInteraction();
    }

    /**
     * Espera la carga de página con comportamiento humano
     * @param {Object} page - Página de Playwright
     */
    async waitForPageLoadHuman(page) {
        try {
            // Esperar navegación básica
            await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
            
            // Pausa humana adicional para "procesar" la nueva página
            await this.timingManager.humanPause('page_processing', this.humanState.fatigue);
            
            // Pequeño movimiento de mouse al cargar
            await this.mouseSimulator.performPageLoadMovement(page);
            
        } catch (error) {
            console.warn('Timeout esperando carga de página');
        }
    }

    /**
     * Calcula el número de páginas a visitar basado en patrón
     * @param {Object} pattern - Patrón de navegación
     * @param {Object} options - Opciones adicionales
     * @returns {number} Número de páginas a visitar
     */
    calculatePagesToVisit(pattern, options = {}) {
        if (options.maxPages) {
            return Math.min(options.maxPages, pattern.pagesMax);
        }
        
        // Cálculo basado en fatiga y atención
        const fatigueReduction = Math.floor(this.humanState.fatigue * 2);
        const basePages = this.randomBetween(pattern.pagesMin, pattern.pagesMax);
        
        return Math.max(pattern.pagesMin, basePages - fatigueReduction);
    }

    /**
     * Calcula tiempo de lectura basado en contenido y comportamiento humano
     * @param {Object} contentMetrics - Métricas del contenido
     * @param {Object} pattern - Patrón de navegación
     * @returns {number} Tiempo de lectura en millisegundos
     */
    calculateReadingTime(contentMetrics, pattern) {
        // Tiempo base del patrón
        const baseTime = this.randomBetween(pattern.timePerPage.min, pattern.timePerPage.max);
        
        // Ajuste por contenido (más palabras = más tiempo)
        const contentMultiplier = Math.min(2, 1 + (contentMetrics.wordCount / 1000));
        
        // Ajuste por fatiga (más fatiga = menos tiempo)
        const fatigueMultiplier = 1 - (this.humanState.fatigue * 0.3);
        
        // Ajuste por velocidad de lectura personalizada
        const readingSpeedMultiplier = 250 / this.humanState.readingSpeed; // 250 WPM base
        
        return Math.round(baseTime * contentMultiplier * fatigueMultiplier * readingSpeedMultiplier);
    }

    /**
     * Actualiza el estado humano basado en la actividad
     * @param {number} timeSpent - Tiempo gastado en la actividad
     */
    updateHumanState(timeSpent) {
        // Incrementar fatiga gradualmente
        const sessionDuration = Date.now() - this.humanState.sessionStartTime;
        this.humanState.fatigue = Math.min(1, sessionDuration / (60 * 60 * 1000)); // Máxima fatiga en 1 hora
        
        // Reducir capacidad de atención con el tiempo
        this.humanState.attentionSpan = Math.max(0.3, 1 - (this.humanState.fatigue * 0.5));
        
        // Agregar algo de variabilidad aleatoria
        this.humanState.fatigue += (Math.random() - 0.5) * 0.05;
        this.humanState.fatigue = Math.max(0, Math.min(1, this.humanState.fatigue));
    }

    /**
     * Calcula puntuación de qué tan humano parece el comportamiento
     * @param {Object} navigationResult - Resultado de la navegación
     * @returns {number} Puntuación 0-100
     */
    calculateHumanLikeScore(navigationResult) {
        let score = 70; // Score base
        
        // Puntos por tiempo realista en página
        const avgTimePerPage = navigationResult.timeSpent / navigationResult.pagesVisited;
        if (avgTimePerPage > 10000 && avgTimePerPage < 120000) { // 10s - 2min
            score += 15;
        }
        
        // Puntos por número de interacciones
        if (navigationResult.interactionsPerformed > navigationResult.pagesVisited * 2) {
            score += 10;
        }
        
        // Puntos por diversidad en navegación
        if (navigationResult.pagesVisited > 2) {
            score += 5;
        }
        
        return Math.min(100, score);
    }

    /**
     * Genera velocidad de lectura personalizada
     * @returns {number} Palabras por minuto
     */
    generateReadingSpeed() {
        // Velocidad de lectura promedio: 200-300 WPM
        return this.randomBetween(180, 320);
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
}

export default HumanBehaviorSimulator;