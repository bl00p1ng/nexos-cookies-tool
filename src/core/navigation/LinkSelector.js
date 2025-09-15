/**
 * Selector inteligente de enlaces para navegación humana
 * Analiza y prioriza enlaces basado en contexto, contenido y comportamiento humano
 */
class LinkSelector {
    constructor() {
        this.linkPatterns = this.initializeLinkPatterns();
        this.selectionHistory = [];
        this.blacklistedDomains = new Set();
        this.preferenceProfile = this.generatePreferenceProfile();
    }

    /**
     * Analiza enlaces disponibles en una página
     * @param {Object} page - Página de Playwright
     * @returns {Promise<Array>} Lista de enlaces analizados
     */
    async analyzeAvailableLinks(page) {
        try {
            console.log('🔗 Analizando enlaces disponibles...');

            const links = await page.evaluate(() => {
                const linkElements = Array.from(document.querySelectorAll('a[href]'));
                
                return linkElements.map((link, index) => {
                    const href = link.href;
                    const text = link.textContent?.trim() || '';
                    const title = link.title || '';
                    const rect = link.getBoundingClientRect();
                    
                    // Información del contexto del enlace
                    const parent = link.parentElement;
                    const parentClass = parent?.className || '';
                    const parentTag = parent?.tagName?.toLowerCase() || '';
                    
                    // Detectar si está en área de navegación
                    const isInNavigation = link.closest('nav, .nav, .navigation, .menu, header, footer') !== null;
                    const isInContent = link.closest('main, article, .content, .post, .entry') !== null;
                    
                    // Información visual
                    const isVisible = rect.width > 0 && rect.height > 0;
                    const area = rect.width * rect.height;
                    
                    // Crear selector único
                    function createLinkSelector(linkElement, linkIndex) {
                        // Intentar crear selector por atributos únicos
                        if (linkElement.id) {
                            return `#${linkElement.id}`;
                        }
                        
                        // Usar href como selector si es único
                        const hrefAttr = linkElement.getAttribute('href');
                        if (hrefAttr) {
                            return `a[href="${hrefAttr}"]`;
                        }
                        
                        // Usar texto como selector si es suficientemente único
                        const textContent = linkElement.textContent?.trim();
                        if (textContent && textContent.length > 5 && textContent.length < 50) {
                            return `a:contains("${textContent.substring(0, 30)}")`;
                        }
                        
                        // Fallback a selector por índice
                        return `a:nth-of-type(${linkIndex + 1})`;
                    }
                    
                    return {
                        href,
                        text,
                        title,
                        index,
                        selector: createLinkSelector(link, index),
                        position: {
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height,
                            area
                        },
                        context: {
                            parentClass,
                            parentTag,
                            isInNavigation,
                            isInContent,
                            isVisible
                        },
                        attributes: {
                            target: link.target || '',
                            rel: link.rel || '',
                            download: link.hasAttribute('download')
                        }
                    };
                }).filter(link => {
                    // Filtrar enlaces básicos
                    return link.href && 
                           link.href.startsWith('http') && 
                           link.context.isVisible &&
                           link.text.length > 0;
                });
            });

            console.log(`📊 Enlaces encontrados: ${links.length}`);

            // Enriquecer información de enlaces
            const enrichedLinks = await this.enrichLinkInformation(links, page);

            // Clasificar y puntuar enlaces
            const scoredLinks = this.scoreLinksByRelevance(enrichedLinks);

            return scoredLinks;

        } catch (error) {
            console.error('❌ Error analizando enlaces:', error.message);
            return [];
        }
    }

    /**
     * Selecciona el siguiente enlace más apropiado
     * @param {Array} availableLinks - Enlaces disponibles
     * @param {Array} visitedUrls - URLs ya visitadas
     * @param {Object} pattern - Patrón de navegación del sitio
     * @param {Object} humanState - Estado humano actual
     * @returns {Object|null} Enlace seleccionado
     */
    selectNextLink(availableLinks, visitedUrls, pattern, humanState) {
        try {
            console.log(`🎯 Seleccionando enlace de ${availableLinks.length} opciones`);

            // Filtrar enlaces ya visitados y peligrosos
            let candidateLinks = this.filterCandidateLinks(availableLinks, visitedUrls);
            
            if (candidateLinks.length === 0) {
                console.log('🚫 No hay enlaces candidatos válidos');
                return null;
            }

            // Aplicar filtros por patrón del sitio
            candidateLinks = this.applyPatternFilters(candidateLinks, pattern);

            // Aplicar filtros por estado humano
            candidateLinks = this.applyHumanStateFilters(candidateLinks, humanState);

            if (candidateLinks.length === 0) {
                console.log('🚫 No hay enlaces después de aplicar filtros');
                return null;
            }

            // Seleccionar enlace final usando algoritmo de selección humana
            const selectedLink = this.selectLinkWithHumanBehavior(candidateLinks, pattern, humanState);

            if (selectedLink) {
                console.log(`✅ Enlace seleccionado: "${selectedLink.text}" (puntuación: ${selectedLink.finalScore})`);
                this.recordLinkSelection(selectedLink, candidateLinks.length);
            }

            return selectedLink;

        } catch (error) {
            console.error('❌ Error seleccionando enlace:', error.message);
            return null;
        }
    }

    /**
     * Enriquece información de enlaces con análisis adicional
     * @param {Array} links - Enlaces básicos
     * @param {Object} page - Página de Playwright
     * @returns {Promise<Array>} Enlaces enriquecidos
     */
    async enrichLinkInformation(links, page) {
        return links.map(link => {
            // Analizar tipo de enlace por URL
            link.linkType = this.classifyLinkType(link.href, link.text);
            
            // Analizar dominio
            link.domain = this.extractDomain(link.href);
            link.isInternal = this.isInternalLink(link.href, page.url());
            link.isExternal = !link.isInternal;
            
            // Analizar profundidad del enlace
            link.depth = this.calculateLinkDepth(link.href);
            
            // Detectar características especiales
            link.characteristics = this.detectLinkCharacteristics(link);
            
            // Calcular prioridad base
            link.baseScore = this.calculateBaseLinkScore(link);
            
            return link;
        });
    }

    /**
     * Puntúa enlaces por relevancia para navegación humana
     * @param {Array} links - Enlaces a puntuar
     * @returns {Array} Enlaces con puntuaciones
     */
    scoreLinksByRelevance(links) {
        return links.map(link => {
            let score = link.baseScore;

            // Bonus por estar en área de contenido principal
            if (link.context.isInContent) score += 15;
            
            // Bonus por texto descriptivo
            if (link.text.length > 10 && link.text.length < 50) score += 10;
            
            // Bonus por enlaces internos (más seguro navegar)
            if (link.isInternal) score += 20;
            
            // Bonus por profundidad apropiada
            if (link.depth <= 3) score += 10;
            
            // Penalty por características peligrosas
            if (link.characteristics.isDangerous) score -= 50;
            if (link.characteristics.isCommercial) score -= 20;
            if (link.characteristics.requiresAuth) score -= 30;
            
            // Bonus por tipo de contenido valioso
            if (link.linkType === 'article') score += 15;
            if (link.linkType === 'category') score += 10;
            if (link.linkType === 'content') score += 12;
            
            // Penalty por enlaces de navegación repetitiva
            if (link.context.isInNavigation && link.linkType === 'navigation') score -= 5;
            
            // Ajuste por tamaño visual (enlaces más grandes son más prominentes)
            const visualBonus = Math.min(10, link.position.area / 1000);
            score += visualBonus;

            link.relevanceScore = Math.max(0, score);
            return link;
        }).sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    /**
     * Filtra enlaces candidatos eliminando visitados y peligrosos
     * @param {Array} availableLinks - Enlaces disponibles
     * @param {Array} visitedUrls - URLs visitadas
     * @returns {Array} Enlaces candidatos
     */
    filterCandidateLinks(availableLinks, visitedUrls) {
        return availableLinks.filter(link => {
            // Eliminar enlaces ya visitados
            if (visitedUrls.includes(link.href)) return false;
            
            // Eliminar enlaces peligrosos
            if (link.characteristics.isDangerous) return false;
            
            // Eliminar enlaces a dominios bloqueados
            if (this.blacklistedDomains.has(link.domain)) return false;
            
            // Eliminar enlaces de descarga
            if (link.attributes.download) return false;
            
            // Eliminar enlaces externos con target="_blank" (pueden ser ads)
            if (link.isExternal && link.attributes.target === '_blank') return false;
            
            // Mantener solo enlaces con puntuación mínima
            return link.relevanceScore > 10;
        });
    }

    /**
     * Aplica filtros basados en el patrón de navegación del sitio
     * @param {Array} candidateLinks - Enlaces candidatos
     * @param {Object} pattern - Patrón de navegación
     * @returns {Array} Enlaces filtrados
     */
    applyPatternFilters(candidateLinks, pattern) {
        // Filtrar por preferencias del patrón
        const filteredLinks = candidateLinks.filter(link => {
            // Verificar si el tipo de enlace está en preferencias
            const isPreferred = pattern.preferredLinks.some(pref => 
                link.linkType.includes(pref.toLowerCase()) || 
                link.text.toLowerCase().includes(pref.toLowerCase())
            );
            
            // Si hay preferencias específicas, solo mantener enlaces preferidos
            if (pattern.preferredLinks.length > 0 && pattern.preferredLinks[0] !== 'any') {
                return isPreferred;
            }
            
            return true;
        });

        // Si el filtro fue muy restrictivo, usar candidatos originales
        return filteredLinks.length > 0 ? filteredLinks : candidateLinks;
    }

    /**
     * Aplica filtros basados en el estado humano
     * @param {Array} candidateLinks - Enlaces candidatos
     * @param {Object} humanState - Estado humano
     * @returns {Array} Enlaces filtrados
     */
    applyHumanStateFilters(candidateLinks, humanState) {
        // Con alta fatiga, preferir enlaces más simples y directos
        if (humanState.fatigue > 0.7) {
            return candidateLinks.filter(link => {
                return link.text.length < 30 && // Texto corto
                       link.depth <= 2 &&        // Poca profundidad
                       link.context.isInContent; // En contenido principal
            });
        }

        // Con baja atención, evitar enlaces complejos
        if (humanState.attentionSpan < 0.5) {
            return candidateLinks.filter(link => {
                return !link.linkType.includes('complex') &&
                       link.relevanceScore > 20;
            });
        }

        return candidateLinks;
    }

    /**
     * Selecciona enlace usando comportamiento humano (no puramente algorítmico)
     * @param {Array} candidateLinks - Enlaces candidatos
     * @param {Object} pattern - Patrón de navegación
     * @param {Object} humanState - Estado humano
     * @returns {Object} Enlace seleccionado
     */
    selectLinkWithHumanBehavior(candidateLinks, pattern, humanState) {
        // Ordenar por puntuación pero no siempre elegir el primero
        const sortedLinks = candidateLinks.sort((a, b) => b.relevanceScore - a.relevanceScore);
        
        // Crear distribución de probabilidades (los mejores tienen más probabilidad)
        const probabilities = this.calculateSelectionProbabilities(sortedLinks, humanState);
        
        // Selección ponderada aleatoria
        const selectedIndex = this.weightedRandomSelection(probabilities);
        const selectedLink = sortedLinks[selectedIndex];
        
        // Agregar puntuación final para logging
        selectedLink.finalScore = selectedLink.relevanceScore + (Math.random() * 10);
        
        return selectedLink;
    }

    /**
     * Calcula probabilidades de selección para cada enlace
     * @param {Array} sortedLinks - Enlaces ordenados por puntuación
     * @param {Object} humanState - Estado humano
     * @returns {Array} Probabilidades de selección
     */
    calculateSelectionProbabilities(sortedLinks, humanState) {
        const probabilities = [];
        const baseDecayRate = 0.7; // Qué tan rápido decae la probabilidad
        
        // Ajustar tasa de decaimiento por estado humano
        let decayRate = baseDecayRate;
        if (humanState.fatigue > 0.5) {
            decayRate = 0.9; // Menos exploración cuando cansado
        }
        if (humanState.attentionSpan < 0.5) {
            decayRate = 0.8; // Menos variación con poca atención
        }

        // Calcular probabilidades con decaimiento exponencial
        for (let i = 0; i < sortedLinks.length; i++) {
            const probability = Math.pow(decayRate, i);
            probabilities.push(probability);
        }

        // Normalizar probabilidades
        const sum = probabilities.reduce((a, b) => a + b, 0);
        return probabilities.map(p => p / sum);
    }

    /**
     * Selección aleatoria ponderada
     * @param {Array} probabilities - Probabilidades de cada opción
     * @returns {number} Índice seleccionado
     */
    weightedRandomSelection(probabilities) {
        const random = Math.random();
        let cumulative = 0;
        
        for (let i = 0; i < probabilities.length; i++) {
            cumulative += probabilities[i];
            if (random <= cumulative) {
                return i;
            }
        }
        
        return 0; // Fallback al primer elemento
    }

    /**
     * Clasifica el tipo de enlace basado en URL y texto
     * @param {string} href - URL del enlace
     * @param {string} text - Texto del enlace
     * @returns {string} Tipo de enlace
     */
    classifyLinkType(href, text) {
        const url = href.toLowerCase();
        const linkText = text.toLowerCase();
        
        // Clasificación por patrones en URL
        if (url.includes('/article/') || url.includes('/post/') || url.includes('/story/')) {
            return 'article';
        }
        if (url.includes('/category/') || url.includes('/tag/') || url.includes('/section/')) {
            return 'category';
        }
        if (url.includes('/product/') || url.includes('/item/')) {
            return 'product';
        }
        if (url.includes('/user/') || url.includes('/profile/') || url.includes('/author/')) {
            return 'profile';
        }
        
        // Clasificación por texto del enlace
        const textPatterns = {
            article: ['read more', 'full article', 'continue reading', 'leer más', 'artículo completo'],
            category: ['category', 'section', 'topic', 'categoría', 'sección', 'tema'],
            navigation: ['home', 'about', 'contact', 'menu', 'inicio', 'acerca', 'contacto'],
            product: ['buy', 'shop', 'product', 'comprar', 'producto', 'tienda'],
            external: ['link', 'visit', 'external', 'enlace', 'visitar', 'externo'],
            content: ['page', 'content', 'info', 'details', 'página', 'contenido', 'información']
        };
        
        for (const [type, patterns] of Object.entries(textPatterns)) {
            if (patterns.some(pattern => linkText.includes(pattern))) {
                return type;
            }
        }
        
        // Clasificación por longitud y características del texto
        if (linkText.length > 50) return 'content_long';
        if (linkText.length < 5) return 'navigation_short';
        
        return 'content'; // Tipo por defecto
    }

    /**
     * Extrae dominio de una URL
     * @param {string} url - URL completa
     * @returns {string} Dominio extraído
     */
    extractDomain(url) {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return '';
        }
    }

    /**
     * Determina si un enlace es interno
     * @param {string} linkUrl - URL del enlace
     * @param {string} currentUrl - URL actual de la página
     * @returns {boolean} True si es enlace interno
     */
    isInternalLink(linkUrl, currentUrl) {
        try {
            const linkDomain = new URL(linkUrl).hostname;
            const currentDomain = new URL(currentUrl).hostname;
            return linkDomain === currentDomain;
        } catch {
            return false;
        }
    }

    /**
     * Calcula la profundidad de un enlace (número de segmentos en el path)
     * @param {string} url - URL del enlace
     * @returns {number} Profundidad del enlace
     */
    calculateLinkDepth(url) {
        try {
            const path = new URL(url).pathname;
            const segments = path.split('/').filter(segment => segment.length > 0);
            return segments.length;
        } catch {
            return 0;
        }
    }

    /**
     * Detecta características especiales del enlace
     * @param {Object} link - Objeto del enlace
     * @returns {Object} Características detectadas
     */
    detectLinkCharacteristics(link) {
        const characteristics = {
            isDangerous: false,
            isCommercial: false,
            requiresAuth: false,
            isMedia: false,
            isDownload: false,
            isForm: false
        };

        const url = link.href.toLowerCase();
        const text = link.text.toLowerCase();

        // Detectar enlaces peligrosos
        const dangerousPatterns = [
            'logout', 'signout', 'sign-out', 'cerrar sesión',
            'login', 'signin', 'sign-in', 'iniciar sesión',
            'register', 'signup', 'sign-up', 'registrarse',
            'checkout', 'cart', 'purchase', 'buy', 'order',
            'download', 'install', 'descargar', 'instalar'
        ];
        
        characteristics.isDangerous = dangerousPatterns.some(pattern => 
            url.includes(pattern) || text.includes(pattern)
        );

        // Detectar enlaces comerciales
        const commercialPatterns = [
            'shop', 'store', 'buy', 'cart', 'checkout', 'payment',
            'price', 'cost', 'subscribe', 'premium', 'pro'
        ];
        
        characteristics.isCommercial = commercialPatterns.some(pattern =>
            url.includes(pattern) || text.includes(pattern)
        );

        // Detectar enlaces que requieren autenticación
        const authPatterns = [
            'account', 'profile', 'dashboard', 'admin', 'settings',
            'preferences', 'my-', 'user/', 'member'
        ];
        
        characteristics.requiresAuth = authPatterns.some(pattern =>
            url.includes(pattern)
        );

        // Detectar enlaces de media
        const mediaPatterns = [
            'video', 'audio', 'image', 'gallery', 'photo',
            'watch', 'listen', 'view', 'play'
        ];
        
        characteristics.isMedia = mediaPatterns.some(pattern =>
            url.includes(pattern) || text.includes(pattern)
        );

        // Detectar enlaces de descarga
        characteristics.isDownload = link.attributes.download || 
            url.match(/\.(pdf|doc|docx|zip|exe|dmg|pkg)$/);

        return characteristics;
    }

    /**
     * Calcula puntuación base del enlace
     * @param {Object} link - Objeto del enlace
     * @returns {number} Puntuación base
     */
    calculateBaseLinkScore(link) {
        let score = 50; // Puntuación base

        // Bonus por posición visible
        if (link.context.isVisible) score += 10;

        // Bonus por texto descriptivo apropiado
        const textLength = link.text.length;
        if (textLength >= 5 && textLength <= 60) {
            score += 15;
        } else if (textLength > 60) {
            score -= 5; // Penalizar texto muy largo
        }

        // Bonus por título descriptivo
        if (link.title && link.title.length > 5) score += 5;

        // Ajuste por contexto
        if (link.context.isInContent) score += 10;
        if (link.context.isInNavigation) score += 5;

        // Ajuste por área visual
        const area = link.position.area;
        if (area > 500 && area < 10000) { // Tamaño apropiado
            score += 8;
        } else if (area > 10000) { // Muy grande, posiblemente banner
            score -= 5;
        }

        return score;
    }

    /**
     * Crea selector único para un enlace
     * @param {Element} link - Elemento del enlace
     * @param {number} index - Índice del enlace
     * @returns {string} Selector único
     */
    // createLinkSelector(link, index) {
    //     // Intentar crear selector por atributos únicos
    //     if (link.id) {
    //         return `#${link.id}`;
    //     }
        
    //     // Usar href como selector si es único
    //     const href = link.getAttribute('href');
    //     if (href) {
    //         return `a[href="${href}"]`;
    //     }
        
    //     // Usar texto como selector si es suficientemente único
    //     const text = link.textContent?.trim();
    //     if (text && text.length > 5 && text.length < 50) {
    //         return `a:contains("${text.substring(0, 30)}")`;
    //     }
        
    //     // Fallback a selector por índice
    //     return `a:nth-of-type(${index + 1})`;
    // }

    /**
     * Registra selección de enlace para análisis
     * @param {Object} selectedLink - Enlace seleccionado
     * @param {number} totalCandidates - Total de candidatos disponibles
     */
    recordLinkSelection(selectedLink, totalCandidates) {
        this.selectionHistory.push({
            timestamp: Date.now(),
            linkType: selectedLink.linkType,
            isInternal: selectedLink.isInternal,
            relevanceScore: selectedLink.relevanceScore,
            finalScore: selectedLink.finalScore,
            textLength: selectedLink.text.length,
            totalCandidates,
            characteristics: selectedLink.characteristics
        });

        // Mantener solo las últimas 50 selecciones
        if (this.selectionHistory.length > 50) {
            this.selectionHistory.shift();
        }
    }

    /**
     * Genera perfil de preferencias personalizadas
     * @returns {Object} Perfil de preferencias
     */
    generatePreferenceProfile() {
        return {
            contentPreference: Math.random(), // 0-1: prefer navigation vs content links
            riskTolerance: 0.3 + Math.random() * 0.4, // 0.3-0.7: tolerance for risky links
            explorationTendency: Math.random(), // 0-1: tendency to explore vs stick to obvious paths
            textLengthPreference: {
                min: 5 + Math.random() * 10, // 5-15 chars minimum
                max: 30 + Math.random() * 30  // 30-60 chars maximum
            },
            depthPreference: 1 + Math.random() * 3, // 1-4: preferred link depth
            internalLinkBias: 0.6 + Math.random() * 0.3 // 0.6-0.9: bias towards internal links
        };
    }

    /**
     * Inicializa patrones de enlaces
     * @returns {Object} Patrones organizados
     */
    initializeLinkPatterns() {
        return {
            dangerous: [
                'logout', 'signout', 'sign-out', 'login', 'signin', 'sign-in',
                'register', 'signup', 'checkout', 'cart', 'buy', 'purchase',
                'download', 'install', 'subscribe', 'payment'
            ],
            preferred: {
                news: ['article', 'story', 'headline', 'breaking', 'report'],
                ecommerce: ['product', 'category', 'brand', 'collection'],
                blog: ['post', 'article', 'entry', 'read more', 'continue'],
                reference: ['definition', 'article', 'topic', 'category'],
                entertainment: ['video', 'episode', 'series', 'watch', 'play']
            },
            contextual: {
                navigation: ['nav', 'menu', 'header', 'footer', 'sidebar'],
                content: ['main', 'article', 'post', 'content', 'entry'],
                sidebar: ['aside', 'sidebar', 'widget', 'related']
            }
        };
    }

    /**
     * Obtiene estadísticas de selección de enlaces
     * @returns {Object} Estadísticas de comportamiento
     */
    getSelectionStats() {
        if (this.selectionHistory.length === 0) return null;

        const stats = {
            totalSelections: this.selectionHistory.length,
            averageScore: 0,
            linkTypeDistribution: {},
            internalLinkPercentage: 0,
            averageTextLength: 0,
            riskProfile: 'unknown'
        };

        // Calcular estadísticas
        let totalScore = 0;
        let totalTextLength = 0;
        let internalCount = 0;
        let dangerousCount = 0;

        this.selectionHistory.forEach(selection => {
            totalScore += selection.relevanceScore;
            totalTextLength += selection.textLength;
            
            if (selection.isInternal) internalCount++;
            if (selection.characteristics.isDangerous) dangerousCount++;
            
            // Distribución por tipo
            if (!stats.linkTypeDistribution[selection.linkType]) {
                stats.linkTypeDistribution[selection.linkType] = 0;
            }
            stats.linkTypeDistribution[selection.linkType]++;
        });

        stats.averageScore = totalScore / this.selectionHistory.length;
        stats.averageTextLength = totalTextLength / this.selectionHistory.length;
        stats.internalLinkPercentage = (internalCount / this.selectionHistory.length) * 100;
        
        // Determinar perfil de riesgo
        const dangerousPercentage = (dangerousCount / this.selectionHistory.length) * 100;
        if (dangerousPercentage > 20) stats.riskProfile = 'high';
        else if (dangerousPercentage > 10) stats.riskProfile = 'medium';
        else stats.riskProfile = 'low';

        return stats;
    }

    /**
     * Evalúa qué tan humano parece el comportamiento de selección
     * @returns {number} Puntuación de humanidad 0-100
     */
    evaluateSelectionHumanness() {
        const stats = this.getSelectionStats();
        if (!stats) return 50;

        let humanScore = 50;

        // Bonus por variedad en tipos de enlaces
        const typeVariety = Object.keys(stats.linkTypeDistribution).length;
        humanScore += Math.min(20, typeVariety * 3);

        // Bonus por preferencia hacia enlaces internos (comportamiento seguro)
        if (stats.internalLinkPercentage > 60 && stats.internalLinkPercentage < 90) {
            humanScore += 15;
        }

        // Bonus por perfil de riesgo apropiado (bajo riesgo es más humano)
        if (stats.riskProfile === 'low') humanScore += 10;
        else if (stats.riskProfile === 'high') humanScore -= 15;

        // Bonus por longitud de texto apropiada
        if (stats.averageTextLength > 8 && stats.averageTextLength < 40) {
            humanScore += 10;
        }

        // Penalización por puntuaciones muy consistentes (comportamiento robótico)
        const scoreVariation = this.calculateScoreVariation();
        if (scoreVariation < 0.1) humanScore -= 20; // Muy consistente = robótico

        return Math.max(0, Math.min(100, humanScore));
    }

    /**
     * Calcula variación en las puntuaciones de selección
     * @returns {number} Coeficiente de variación
     */
    calculateScoreVariation() {
        if (this.selectionHistory.length < 3) return 0.5;

        const scores = this.selectionHistory.map(s => s.relevanceScore);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
        const stdDev = Math.sqrt(variance);

        return stdDev / mean; // Coeficiente de variación
    }

    /**
     * Limpia historial de selecciones
     */
    clearHistory() {
        this.selectionHistory = [];
        console.log('🗑️ Historial de selección de enlaces limpiado');
    }

    /**
     * Añade dominio a lista negra
     * @param {string} domain - Dominio a bloquear
     */
    blacklistDomain(domain) {
        this.blacklistedDomains.add(domain);
        console.log(`🚫 Dominio añadido a lista negra: ${domain}`);
    }

    /**
     * Obtiene información del estado actual del selector
     * @returns {Object} Estado del selector
     */
    getState() {
        return {
            selectionHistory: this.selectionHistory.length,
            blacklistedDomains: Array.from(this.blacklistedDomains),
            preferenceProfile: this.preferenceProfile,
            humanness: this.evaluateSelectionHumanness()
        };
    }
}

export default LinkSelector;