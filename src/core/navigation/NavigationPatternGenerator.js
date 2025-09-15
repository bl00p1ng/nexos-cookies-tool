/**
 * Generador de patrones de navegación humana
 * Crea patrones específicos según el tipo de sitio y comportamiento del usuario
 */
class NavigationPatternGenerator {
    constructor() {
        this.basePatterns = this.initializeBasePatterns();
        this.userBehaviorProfile = this.generateUserBehaviorProfile();
    }

    /**
     * Genera patrón de navegación basado en el tipo de sitio
     * @param {string} siteType - Tipo de sitio detectado
     * @param {Object} options - Opciones adicionales
     * @returns {Object} Patrón de navegación personalizado
     */
    generatePattern(siteType, options = {}) {
        const basePattern = this.basePatterns[siteType] || this.basePatterns.default;
        
        // Crear copia del patrón base
        const pattern = JSON.parse(JSON.stringify(basePattern));
        
        // Aplicar personalización del usuario
        this.applyUserPersonalization(pattern);
        
        // Aplicar modificaciones por contexto
        this.applyContextualModifications(pattern, options);
        
        // Aplicar variación aleatoria para naturalidad
        this.applyRandomVariation(pattern);
        
        console.log(`🎯 Patrón generado para ${siteType}:`, {
            pages: `${pattern.pagesMin}-${pattern.pagesMax}`,
            timePerPage: `${Math.round(pattern.timePerPage.min/1000)}-${Math.round(pattern.timePerPage.max/1000)}s`,
            clickProb: `${Math.round(pattern.clickProbability * 100)}%`
        });
        
        return pattern;
    }

    /**
     * Inicializa patrones base por tipo de sitio
     * @returns {Object} Patrones base organizados por tipo
     */
    initializeBasePatterns() {
        return {
            news: {
                pagesMin: 3,
                pagesMax: 8,
                timePerPage: { min: 15000, max: 45000 }, // 15-45 segundos
                scrollDepth: { min: 0.4, max: 0.9 },
                clickProbability: 0.7,
                preferredLinks: ['article', 'headline', 'category', 'breaking'],
                avoidLinks: ['subscribe', 'newsletter', 'register'],
                readingIntensity: 'high', // Tiempo dedicado a leer
                explorationLevel: 'medium', // Qué tanto explora el sitio
                interactionStyle: 'content-focused' // Enfoque en contenido vs navegación
            },
            
            ecommerce: {
                pagesMin: 5,
                pagesMax: 15,
                timePerPage: { min: 8000, max: 25000 }, // 8-25 segundos
                scrollDepth: { min: 0.3, max: 0.7 },
                clickProbability: 0.8,
                preferredLinks: ['product', 'category', 'brand', 'collection'],
                avoidLinks: ['checkout', 'cart', 'buy now', 'add to cart'],
                readingIntensity: 'medium',
                explorationLevel: 'high',
                interactionStyle: 'exploration-focused'
            },
            
            blog: {
                pagesMin: 2,
                pagesMax: 6,
                timePerPage: { min: 20000, max: 60000 }, // 20-60 segundos
                scrollDepth: { min: 0.5, max: 1.0 },
                clickProbability: 0.6,
                preferredLinks: ['post', 'article', 'related', 'category'],
                avoidLinks: ['subscribe', 'comment', 'login'],
                readingIntensity: 'very_high',
                explorationLevel: 'low',
                interactionStyle: 'deep-reading'
            },
            
            social: {
                pagesMin: 4,
                pagesMax: 12,
                timePerPage: { min: 5000, max: 20000 }, // 5-20 segundos
                scrollDepth: { min: 0.2, max: 0.6 },
                clickProbability: 0.9,
                preferredLinks: ['profile', 'post', 'topic', 'feed'],
                avoidLinks: ['login', 'register', 'message', 'follow'],
                readingIntensity: 'low',
                explorationLevel: 'very_high',
                interactionStyle: 'rapid-browsing'
            },
            
            reference: {
                pagesMin: 2,
                pagesMax: 5,
                timePerPage: { min: 25000, max: 90000 }, // 25-90 segundos
                scrollDepth: { min: 0.6, max: 1.0 },
                clickProbability: 0.5,
                preferredLinks: ['article', 'definition', 'category', 'related'],
                avoidLinks: ['edit', 'history', 'discussion', 'talk'],
                readingIntensity: 'very_high',
                explorationLevel: 'medium',
                interactionStyle: 'research-focused'
            },
            
            entertainment: {
                pagesMin: 3,
                pagesMax: 10,
                timePerPage: { min: 10000, max: 30000 }, // 10-30 segundos
                scrollDepth: { min: 0.3, max: 0.7 },
                clickProbability: 0.8,
                preferredLinks: ['video', 'episode', 'series', 'genre'],
                avoidLinks: ['subscribe', 'premium', 'signup'],
                readingIntensity: 'low',
                explorationLevel: 'high',
                interactionStyle: 'media-browsing'
            },
            
            tech: {
                pagesMin: 3,
                pagesMax: 8,
                timePerPage: { min: 30000, max: 120000 }, // 30-120 segundos
                scrollDepth: { min: 0.7, max: 1.0 },
                clickProbability: 0.4,
                preferredLinks: ['documentation', 'guide', 'tutorial', 'example'],
                avoidLinks: ['download', 'signup', 'trial', 'pricing'],
                readingIntensity: 'very_high',
                explorationLevel: 'low',
                interactionStyle: 'technical-study'
            },
            
            finance: {
                pagesMin: 3,
                pagesMax: 7,
                timePerPage: { min: 15000, max: 40000 }, // 15-40 segundos
                scrollDepth: { min: 0.5, max: 0.8 },
                clickProbability: 0.6,
                preferredLinks: ['news', 'analysis', 'market', 'report'],
                avoidLinks: ['trade', 'invest', 'signup', 'account'],
                readingIntensity: 'high',
                explorationLevel: 'medium',
                interactionStyle: 'analytical-reading'
            },
            
            sports: {
                pagesMin: 4,
                pagesMax: 10,
                timePerPage: { min: 12000, max: 35000 }, // 12-35 segundos
                scrollDepth: { min: 0.4, max: 0.8 },
                clickProbability: 0.75,
                preferredLinks: ['game', 'team', 'player', 'score', 'news'],
                avoidLinks: ['bet', 'gamble', 'subscription'],
                readingIntensity: 'medium',
                explorationLevel: 'high',
                interactionStyle: 'results-focused'
            },
            
            default: {
                pagesMin: 3,
                pagesMax: 10,
                timePerPage: { min: 10000, max: 30000 }, // 10-30 segundos
                scrollDepth: { min: 0.3, max: 0.8 },
                clickProbability: 0.65,
                preferredLinks: ['content', 'page', 'section'],
                avoidLinks: ['signup', 'login', 'subscribe'],
                readingIntensity: 'medium',
                explorationLevel: 'medium',
                interactionStyle: 'general-browsing'
            }
        };
    }

    /**
     * Aplica personalización basada en el perfil del usuario
     * @param {Object} pattern - Patrón a personalizar
     */
    applyUserPersonalization(pattern) {
        const profile = this.userBehaviorProfile;
        
        // Ajustar número de páginas por perfil de exploración
        const pagesRange = pattern.pagesMax - pattern.pagesMin;
        const explorationAdjustment = (profile.explorationTendency - 0.5) * pagesRange * 0.4;
        pattern.pagesMin = Math.max(1, Math.round(pattern.pagesMin + explorationAdjustment));
        pattern.pagesMax = Math.max(pattern.pagesMin + 1, Math.round(pattern.pagesMax + explorationAdjustment));
        
        // Ajustar tiempo de lectura por velocidad de lectura
        const readingSpeedMultiplier = 250 / profile.readingSpeed; // 250 WPM base
        pattern.timePerPage.min = Math.round(pattern.timePerPage.min * readingSpeedMultiplier);
        pattern.timePerPage.max = Math.round(pattern.timePerPage.max * readingSpeedMultiplier);
        
        // Ajustar scroll depth por preferencia de profundidad
        const depthAdjustment = (profile.scrollDepthPreference - 0.5) * 0.3;
        pattern.scrollDepth.min = Math.max(0.1, pattern.scrollDepth.min + depthAdjustment);
        pattern.scrollDepth.max = Math.min(1.0, pattern.scrollDepth.max + depthAdjustment);
        
        // Ajustar probabilidad de clic por tendencia de interacción
        const clickAdjustment = (profile.interactionTendency - 0.5) * 0.3;
        pattern.clickProbability = Math.max(0.1, Math.min(0.95, pattern.clickProbability + clickAdjustment));
    }

    /**
     * Aplica modificaciones por contexto específico
     * @param {Object} pattern - Patrón a modificar
     * @param {Object} options - Opciones contextuales
     */
    applyContextualModifications(pattern, options) {
        // Ajuste por tiempo disponible
        if (options.timeConstraint) {
            const timeMultiplier = options.timeConstraint === 'low' ? 0.7 : 
                                 options.timeConstraint === 'high' ? 1.3 : 1.0;
            
            pattern.timePerPage.min = Math.round(pattern.timePerPage.min * timeMultiplier);
            pattern.timePerPage.max = Math.round(pattern.timePerPage.max * timeMultiplier);
            pattern.pagesMax = Math.round(pattern.pagesMax * (2 - timeMultiplier));
        }
        
        // Ajuste por objetivo específico
        if (options.objective) {
            switch (options.objective) {
                case 'cookies_focused':
                    pattern.clickProbability *= 1.2; // Más clicks para más cookies
                    pattern.pagesMax = Math.round(pattern.pagesMax * 1.3);
                    break;
                case 'content_focused':
                    pattern.timePerPage.min *= 1.4;
                    pattern.timePerPage.max *= 1.4;
                    pattern.scrollDepth.max = Math.min(1.0, pattern.scrollDepth.max + 0.2);
                    break;
                case 'exploration_focused':
                    pattern.pagesMax = Math.round(pattern.pagesMax * 1.5);
                    pattern.clickProbability *= 1.1;
                    break;
            }
        }
        
        // Ajuste por calidad del sitio detectada
        if (options.siteQuality) {
            const qualityMultiplier = options.siteQuality === 'high' ? 1.2 :
                                    options.siteQuality === 'low' ? 0.8 : 1.0;
            
            pattern.timePerPage.min = Math.round(pattern.timePerPage.min * qualityMultiplier);
            pattern.timePerPage.max = Math.round(pattern.timePerPage.max * qualityMultiplier);
        }
    }

    /**
     * Aplica variación aleatoria para mayor naturalidad
     * @param {Object} pattern - Patrón a variar
     */
    applyRandomVariation(pattern) {
        // Variación en número de páginas (±20%)
        const pagesVariation = 0.2;
        const pagesRange = pattern.pagesMax - pattern.pagesMin;
        const pagesAdjustment = (Math.random() - 0.5) * pagesRange * pagesVariation;
        
        pattern.pagesMin = Math.max(1, Math.round(pattern.pagesMin + pagesAdjustment));
        pattern.pagesMax = Math.max(pattern.pagesMin + 1, Math.round(pattern.pagesMax + pagesAdjustment));

        // Variación en tiempo por página (±15%)
        const timeVariation = 0.15;
        const timeMinAdjustment = (Math.random() - 0.5) * pattern.timePerPage.min * timeVariation;
        const timeMaxAdjustment = (Math.random() - 0.5) * pattern.timePerPage.max * timeVariation;
        
        pattern.timePerPage.min = Math.max(2000, Math.round(pattern.timePerPage.min + timeMinAdjustment));
        pattern.timePerPage.max = Math.max(pattern.timePerPage.min + 1000, Math.round(pattern.timePerPage.max + timeMaxAdjustment));

        // Variación en scroll depth (±10%)
        const scrollVariation = 0.1;
        const scrollMinAdjustment = (Math.random() - 0.5) * scrollVariation;
        const scrollMaxAdjustment = (Math.random() - 0.5) * scrollVariation;
        
        pattern.scrollDepth.min = Math.max(0.1, Math.min(0.9, pattern.scrollDepth.min + scrollMinAdjustment));
        pattern.scrollDepth.max = Math.max(pattern.scrollDepth.min + 0.1, Math.min(1.0, pattern.scrollDepth.max + scrollMaxAdjustment));

        // Variación en probabilidad de clic (±10%)
        const clickVariation = (Math.random() - 0.5) * 0.1;
        pattern.clickProbability = Math.max(0.1, Math.min(0.95, pattern.clickProbability + clickVariation));
    }

    /**
     * Genera perfil de comportamiento del usuario
     * @returns {Object} Perfil de comportamiento personalizado
     */
    generateUserBehaviorProfile() {
        return {
            // Velocidad de lectura en palabras por minuto
            readingSpeed: this.randomBetween(180, 320),
            
            // Tendencia de exploración (0 = conservador, 1 = explorador)
            explorationTendency: Math.random(),
            
            // Preferencia de profundidad de scroll (0 = superficial, 1 = profundo)
            scrollDepthPreference: 0.3 + Math.random() * 0.7,
            
            // Tendencia de interacción (0 = pasivo, 1 = muy activo)
            interactionTendency: 0.4 + Math.random() * 0.6,
            
            // Paciencia para contenido lento (0 = impaciente, 1 = muy paciente)
            patience: 0.3 + Math.random() * 0.7,
            
            // Enfoque en contenido vs navegación (0 = navegación, 1 = contenido)
            contentFocus: Math.random(),
            
            // Tolerancia al riesgo en enlaces (0 = conservador, 1 = arriesgado)
            riskTolerance: 0.2 + Math.random() * 0.5,
            
            // Consistencia de comportamiento (0 = errático, 1 = muy consistente)
            behaviorConsistency: 0.6 + Math.random() * 0.4,
            
            // Preferencias específicas
            preferences: {
                shortContent: Math.random() > 0.7, // Prefiere contenido corto
                visualContent: Math.random() > 0.6, // Prefiere contenido visual
                technicalContent: Math.random() > 0.8, // Cómodo con contenido técnico
                socialFeatures: Math.random() > 0.5 // Interés en features sociales
            }
        };
    }

    /**
     * Adapta patrón basado en métricas de sitio específico
     * @param {Object} pattern - Patrón base
     * @param {Object} siteMetrics - Métricas del sitio actual
     * @returns {Object} Patrón adaptado
     */
    adaptToSiteMetrics(pattern, siteMetrics) {
        const adaptedPattern = { ...pattern };

        // Ajustar por cantidad de contenido
        if (siteMetrics.wordCount) {
            const contentMultiplier = Math.min(2, Math.max(0.5, siteMetrics.wordCount / 500));
            adaptedPattern.timePerPage.min = Math.round(adaptedPattern.timePerPage.min * contentMultiplier);
            adaptedPattern.timePerPage.max = Math.round(adaptedPattern.timePerPage.max * contentMultiplier);
        }

        // Ajustar por número de enlaces disponibles
        if (siteMetrics.links) {
            if (siteMetrics.links > 50) {
                adaptedPattern.clickProbability = Math.min(0.95, adaptedPattern.clickProbability + 0.1);
                adaptedPattern.pagesMax = Math.round(adaptedPattern.pagesMax * 1.2);
            } else if (siteMetrics.links < 10) {
                adaptedPattern.clickProbability = Math.max(0.1, adaptedPattern.clickProbability - 0.2);
                adaptedPattern.pagesMax = Math.max(2, Math.round(adaptedPattern.pagesMax * 0.8));
            }
        }

        // Ajustar por cantidad de imágenes
        if (siteMetrics.images > 10) {
            adaptedPattern.scrollDepth.max = Math.min(1.0, adaptedPattern.scrollDepth.max + 0.2);
            adaptedPattern.timePerPage.min = Math.round(adaptedPattern.timePerPage.min * 1.1);
        }

        return adaptedPattern;
    }

    /**
     * Genera patrón específico para sesión de cookies
     * @param {number} targetCookies - Objetivo de cookies
     * @param {number} timeAvailable - Tiempo disponible en ms
     * @param {string} priority - Prioridad ('cookies', 'stealth', 'balanced')
     * @returns {Object} Patrón optimizado para recolección
     */
    generateCookieOptimizedPattern(targetCookies, timeAvailable, priority = 'balanced') {
        const basePattern = this.basePatterns.default;
        const optimizedPattern = JSON.parse(JSON.stringify(basePattern));

        // Calcular número estimado de sitios necesarios
        const avgCookiesPerSite = 15; // Estimación conservadora
        const estimatedSites = Math.ceil(targetCookies / avgCookiesPerSite);
        const timePerSite = timeAvailable / estimatedSites;

        console.log(`🎯 Optimizando para ${targetCookies} cookies en ${Math.round(timeAvailable/60000)} min`);
        console.log(`📊 Estimado: ${estimatedSites} sitios, ${Math.round(timePerSite/1000)}s por sitio`);

        switch (priority) {
            case 'cookies':
                // Máxima eficiencia en recolección
                optimizedPattern.pagesMin = 2;
                optimizedPattern.pagesMax = 6;
                optimizedPattern.timePerPage = {
                    min: Math.max(3000, timePerSite * 0.3),
                    max: Math.max(8000, timePerSite * 0.8)
                };
                optimizedPattern.clickProbability = 0.9;
                optimizedPattern.scrollDepth = { min: 0.2, max: 0.6 };
                break;

            case 'stealth':
                // Máximo realismo humano
                optimizedPattern.pagesMin = 3;
                optimizedPattern.pagesMax = 10;
                optimizedPattern.timePerPage = {
                    min: Math.max(8000, timePerSite * 0.4),
                    max: Math.max(20000, timePerSite * 1.2)
                };
                optimizedPattern.clickProbability = 0.65;
                optimizedPattern.scrollDepth = { min: 0.4, max: 0.9 };
                break;

            case 'balanced':
            default:
                // Balance entre eficiencia y realismo
                optimizedPattern.pagesMin = 2;
                optimizedPattern.pagesMax = 8;
                optimizedPattern.timePerPage = {
                    min: Math.max(5000, timePerSite * 0.35),
                    max: Math.max(15000, timePerSite * 1.0)
                };
                optimizedPattern.clickProbability = 0.75;
                optimizedPattern.scrollDepth = { min: 0.3, max: 0.7 };
                break;
        }

        // Aplicar personalización y variación
        this.applyUserPersonalization(optimizedPattern);
        this.applyRandomVariation(optimizedPattern);

        return optimizedPattern;
    }

    /**
     * Calcula el tiempo estimado para completar navegación
     * @param {Object} pattern - Patrón de navegación
     * @param {number} sitesToVisit - Número de sitios a visitar
     * @returns {Object} Estimación temporal
     */
    calculateTimeEstimate(pattern, sitesToVisit) {
        const avgPagesPerSite = (pattern.pagesMin + pattern.pagesMax) / 2;
        const avgTimePerPage = (pattern.timePerPage.min + pattern.timePerPage.max) / 2;
        const transitionTime = 2000; // Tiempo promedio entre sitios

        const totalPageTime = sitesToVisit * avgPagesPerSite * avgTimePerPage;
        const totalTransitionTime = (sitesToVisit - 1) * transitionTime;
        const totalTime = totalPageTime + totalTransitionTime;

        return {
            totalTimeMs: totalTime,
            totalTimeMinutes: Math.round(totalTime / 60000),
            avgTimePerSite: (totalTime / sitesToVisit),
            avgPagesPerSite,
            avgTimePerPage
        };
    }

    /**
     * Valida que un patrón sea realista y ejecutable
     * @param {Object} pattern - Patrón a validar
     * @returns {Object} Resultado de validación
     */
    validatePattern(pattern) {
        const issues = [];
        const warnings = [];

        // Validar rangos básicos
        if (pattern.pagesMin < 1) issues.push('Mínimo de páginas debe ser al menos 1');
        if (pattern.pagesMax < pattern.pagesMin) issues.push('Máximo de páginas debe ser mayor que mínimo');
        if (pattern.timePerPage.min < 1000) warnings.push('Tiempo mínimo por página muy bajo (< 1s)');
        if (pattern.timePerPage.max > 300000) warnings.push('Tiempo máximo por página muy alto (> 5min)');
        if (pattern.clickProbability < 0 || pattern.clickProbability > 1) {
            issues.push('Probabilidad de clic debe estar entre 0 y 1');
        }

        // Validar realismo
        if (pattern.timePerPage.min > pattern.timePerPage.max) {
            issues.push('Tiempo mínimo no puede ser mayor que tiempo máximo');
        }
        if (pattern.scrollDepth.min > pattern.scrollDepth.max) {
            issues.push('Scroll depth mínimo no puede ser mayor que máximo');
        }

        // Validar eficiencia
        const avgTimePerPage = (pattern.timePerPage.min + pattern.timePerPage.max) / 2;
        if (avgTimePerPage < 3000) warnings.push('Tiempo promedio muy bajo para lectura humana');
        if (avgTimePerPage > 120000) warnings.push('Tiempo promedio muy alto, podría ser ineficiente');

        return {
            isValid: issues.length === 0,
            issues,
            warnings,
            score: this.calculatePatternQualityScore(pattern)
        };
    }

    /**
     * Calcula puntuación de calidad del patrón
     * @param {Object} pattern - Patrón a evaluar
     * @returns {number} Puntuación 0-100
     */
    calculatePatternQualityScore(pattern) {
        let score = 50; // Base score

        // Puntuación por rangos realistas
        const avgTimePerPage = (pattern.timePerPage.min + pattern.timePerPage.max) / 2;
        if (avgTimePerPage >= 5000 && avgTimePerPage <= 60000) score += 20;

        // Puntuación por número de páginas apropiado
        const avgPages = (pattern.pagesMin + pattern.pagesMax) / 2;
        if (avgPages >= 3 && avgPages <= 10) score += 15;

        // Puntuación por probabilidad de clic realista
        if (pattern.clickProbability >= 0.3 && pattern.clickProbability <= 0.8) score += 10;

        // Puntuación por scroll depth apropiado
        const avgScrollDepth = (pattern.scrollDepth.min + pattern.scrollDepth.max) / 2;
        if (avgScrollDepth >= 0.3 && avgScrollDepth <= 0.8) score += 10;

        // Bonus por variación apropiada (no muy rígido)
        const timeVariation = pattern.timePerPage.max / pattern.timePerPage.min;
        if (timeVariation >= 1.5 && timeVariation <= 4.0) score += 5;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Obtiene estadísticas del generador
     * @returns {Object} Estadísticas
     */
    getGeneratorStats() {
        return {
            userProfile: this.userBehaviorProfile,
            availablePatterns: Object.keys(this.basePatterns),
            profileCharacteristics: {
                readingSpeed: `${this.userBehaviorProfile.readingSpeed} WPM`,
                explorationLevel: this.userBehaviorProfile.explorationTendency > 0.7 ? 'high' : 
                                this.userBehaviorProfile.explorationTendency > 0.3 ? 'medium' : 'low',
                contentFocus: this.userBehaviorProfile.contentFocus > 0.6 ? 'content-focused' : 'navigation-focused',
                riskLevel: this.userBehaviorProfile.riskTolerance > 0.5 ? 'moderate' : 'conservative'
            }
        };
    }

    /**
     * Reinicia el perfil del usuario con nuevos valores aleatorios
     */
    regenerateUserProfile() {
        this.userBehaviorProfile = this.generateUserBehaviorProfile();
        console.log('🔄 Perfil de usuario regenerado');
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

export default NavigationPatternGenerator;