/**
 * Analizador inteligente de contenido web
 * Detecta tipos de sitio, analiza contenido y extrae métricas para navegación humana
 */
class ContentAnalyzer {
    constructor() {
        this.siteTypePatterns = this.initializeSiteTypePatterns();
        this.contentPatterns = this.initializeContentPatterns();
        this.analysisCache = new Map();
    }

    /**
     * Detecta el tipo de sitio web basado en contenido y estructura
     * @param {Object} page - Página de Playwright
     * @param {Object} website - Información del sitio web
     * @returns {Promise<string>} Tipo de sitio detectado
     */
    async detectSiteType(page, website) {
        const cacheKey = website.domain;
        if (this.analysisCache.has(cacheKey)) {
            return this.analysisCache.get(cacheKey);
        }

        try {
            console.log(`🔍 Analizando tipo de sitio: ${website.domain}`);

            // Análisis por URL y dominio
            const urlTypeScore = this.analyzeByUrl(website.url);
            
            // Análisis por contenido de la página
            const contentTypeScore = await this.analyzePageContent(page);
            
            // Análisis por estructura HTML
            const structureTypeScore = await this.analyzePageStructure(page);
            
            // Combinar puntuaciones
            const combinedScores = this.combineTypeScores(
                urlTypeScore,
                contentTypeScore.typeScores || {},
                structureTypeScore
            );
            
            // Determinar tipo con mayor puntuación
            const detectedType = Object.keys(combinedScores).reduce((a, b) => 
                combinedScores[a] > combinedScores[b] ? a : b
            );

            console.log(`📊 Tipo detectado: ${detectedType} (puntuación: ${combinedScores[detectedType]})`);
            
            this.analysisCache.set(cacheKey, detectedType);
            return detectedType;

        } catch (error) {
            console.warn(`⚠️ Error detectando tipo de sitio: ${error.message}`);
            return 'general'; // Fallback
        }
    }

    /**
     * Analiza el contenido completo de una página
     * @param {Object} page - Página de Playwright
     * @returns {Promise<Object>} Métricas del contenido
     */
    async analyzePageContent(page) {
        try {
            const contentMetrics = await page.evaluate(() => {
                // Función auxiliar para calcular promedio de palabras por oración
                function calculateAverageWordsPerSentence(text) {
                    if (!text || text.length === 0) return 0;
                    
                    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
                    if (sentences.length === 0) return 0;
                    
                    const totalWords = text.split(/\s+/).filter(w => w.length > 0).length;
                    return totalWords / sentences.length;
                }

                // Análisis básico del contenido
                const bodyText = document.body.innerText || '';
                const words = bodyText.trim().split(/\s+/).filter(word => word.length > 0);
                
                // Conteo de elementos
                const images = document.querySelectorAll('img').length;
                const videos = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length;
                const links = document.querySelectorAll('a[href]').length;
                const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
                
                // Análisis de formularios
                const forms = document.querySelectorAll('form').length;
                const inputs = document.querySelectorAll('input, textarea, select').length;
                
                // Análisis de navegación
                const navElements = document.querySelectorAll('nav, [role="navigation"], .navigation, .menu').length;
                const breadcrumbs = document.querySelectorAll('.breadcrumb, .breadcrumbs, [aria-label*="breadcrumb"]').length;
                
                // Análisis de contenido comercial
                const priceElements = document.querySelectorAll('[class*="price"], [class*="cost"], [data-price]').length;
                const cartElements = document.querySelectorAll('[class*="cart"], [class*="basket"], [data-cart]').length;
                const buyButtons = document.querySelectorAll('button[class*="buy"], a[class*="buy"], [class*="purchase"]').length;
                
                // Análisis de contenido social
                const shareButtons = document.querySelectorAll('[class*="share"], [data-share]').length;
                const commentSections = document.querySelectorAll('[class*="comment"], [id*="comment"]').length;
                
                // Análisis de artículos/blog
                const articleElements = document.querySelectorAll('article, [role="article"], .post, .entry').length;
                const authorElements = document.querySelectorAll('.author, [rel="author"], [class*="byline"]').length;
                const dateElements = document.querySelectorAll('time, .date, [datetime]').length;
                
                return {
                    wordCount: words.length,
                    characterCount: bodyText.length,
                    averageWordsPerSentence: calculateAverageWordsPerSentence(bodyText),
                    readingTimeMinutes: Math.ceil(words.length / 250), // 250 WPM average
                    images,
                    videos,
                    links,
                    headings,
                    forms,
                    inputs,
                    navigation: {
                        navElements,
                        breadcrumbs
                    },
                    commerce: {
                        priceElements,
                        cartElements,
                        buyButtons
                    },
                    social: {
                        shareButtons,
                        commentSections
                    },
                    editorial: {
                        articleElements,
                        authorElements,
                        dateElements
                    }
                };
            });

            // Análisis de tipo de sitio basado en contenido
            contentMetrics.typeScores = this.calculateContentTypeScores(contentMetrics);
            
            // Clasificar densidad de contenido
            contentMetrics.contentDensity = this.classifyContentDensity(contentMetrics);
            
            // Estimación de complejidad de navegación
            contentMetrics.navigationComplexity = this.calculateNavigationComplexity(contentMetrics);
            
            return contentMetrics;

        } catch (error) {
            console.warn(`⚠️ Error analizando contenido: ${error.message}`);
            return {
                wordCount: 0,
                images: 0,
                links: 0,
                contentDensity: 'unknown',
                typeScores: { general: 1 }
            };
        }
    }

    /**
     * Analiza la estructura HTML de la página
     * @param {Object} page - Página de Playwright
     * @returns {Promise<Object>} Puntuaciones por tipo de estructura
     */
    async analyzePageStructure(page) {
        try {
            return await page.evaluate(() => {
                const scores = {
                    news: 0,
                    ecommerce: 0,
                    blog: 0,
                    social: 0,
                    reference: 0,
                    entertainment: 0,
                    finance: 0,
                    tech: 0,
                    general: 0
                };

                // Selectores específicos por tipo de sitio
                const structurePatterns = {
                    news: [
                        '.headline', '.breaking', '.news-item', '.article-list',
                        '[class*="headline"]', '[class*="news"]', '.ticker'
                    ],
                    ecommerce: [
                        '.product', '.cart', '.checkout', '.price', '.add-to-cart',
                        '[class*="product"]', '[class*="shop"]', '[class*="store"]'
                    ],
                    blog: [
                        '.post', '.entry', '.blog-post', '.article',
                        '[class*="post"]', '[class*="blog"]', '.entry-content'
                    ],
                    social: [
                        '.feed', '.timeline', '.profile', '.user-content',
                        '[class*="social"]', '[class*="feed"]', '[class*="user"]'
                    ],
                    reference: [
                        '.wiki', '.definition', '.reference', '.encyclopedia',
                        '[class*="wiki"]', '[class*="reference"]', '.toc'
                    ],
                    entertainment: [
                        '.video-player', '.playlist', '.episode', '.season',
                        '[class*="video"]', '[class*="media"]', '[class*="player"]'
                    ],
                    finance: [
                        '.stock', '.ticker', '.quote', '.chart', '.financial',
                        '[class*="stock"]', '[class*="chart"]', '[class*="finance"]'
                    ],
                    tech: [
                        '.code', '.documentation', '.api', '.tech-specs',
                        '[class*="code"]', '[class*="tech"]', '[class*="dev"]'
                    ]
                };

                // Puntuar cada tipo basado en presencia de elementos
                Object.keys(structurePatterns).forEach(type => {
                    structurePatterns[type].forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            scores[type] += Math.min(10, elements.length);
                        }
                    });
                });

                return scores;
            });

        } catch (error) {
            console.warn(`⚠️ Error analizando estructura: ${error.message}`);
            return { general: 1 };
        }
    }

    /**
     * Analiza tipo de sitio basado en URL
     * @param {string} url - URL a analizar
     * @returns {Object} Puntuaciones por tipo
     */
    analyzeByUrl(url) {
        const scores = {
            news: 0, ecommerce: 0, blog: 0, social: 0,
            reference: 0, entertainment: 0, finance: 0,
            tech: 0, sports: 0, general: 0
        };

        const urlLower = url.toLowerCase();

        // Patrones en la URL
        const urlPatterns = {
            news: ['news', 'noticias', 'breaking', 'headlines', 'press', 'media'],
            ecommerce: ['shop', 'store', 'buy', 'cart', 'product', 'tienda', 'compra'],
            blog: ['blog', 'post', 'diary', 'journal', 'personal'],
            social: ['social', 'community', 'forum', 'chat', 'profile'],
            reference: ['wiki', 'reference', 'encyclopedia', 'definition', 'learn'],
            entertainment: ['video', 'movie', 'game', 'entertainment', 'fun', 'watch'],
            finance: ['bank', 'finance', 'money', 'invest', 'stock', 'trading'],
            tech: ['tech', 'dev', 'code', 'programming', 'software', 'api'],
            sports: ['sport', 'football', 'soccer', 'basketball', 'tennis', 'game']
        };

        // Puntuar basado en patrones encontrados
        Object.keys(urlPatterns).forEach(type => {
            urlPatterns[type].forEach(pattern => {
                if (urlLower.includes(pattern)) {
                    scores[type] += 5;
                }
            });
        });

        return scores;
    }

    /**
     * Calcula puntuaciones de tipo de sitio basado en métricas de contenido
     * @param {Object} contentMetrics - Métricas del contenido
     * @returns {Object} Puntuaciones por tipo
     */
    calculateContentTypeScores(contentMetrics) {
        const scores = {
            news: 0, ecommerce: 0, blog: 0, social: 0,
            reference: 0, entertainment: 0, finance: 0,
            tech: 0, general: 0
        };

        // Puntuación para sitios de noticias
        scores.news += contentMetrics.editorial.articleElements * 3;
        scores.news += contentMetrics.editorial.dateElements * 2;
        scores.news += contentMetrics.headings * 0.5;
        if (contentMetrics.wordCount > 500) scores.news += 2;

        // Puntuación para e-commerce
        scores.ecommerce += contentMetrics.commerce.priceElements * 4;
        scores.ecommerce += contentMetrics.commerce.cartElements * 5;
        scores.ecommerce += contentMetrics.commerce.buyButtons * 3;
        scores.ecommerce += contentMetrics.images * 0.3; // Muchas imágenes de productos

        // Puntuación para blogs
        scores.blog += contentMetrics.editorial.authorElements * 3;
        scores.blog += contentMetrics.editorial.articleElements * 2;
        scores.blog += contentMetrics.social.commentSections * 2;
        if (contentMetrics.wordCount > 800) scores.blog += 3;

        // Puntuación para sitios sociales
        scores.social += contentMetrics.social.shareButtons * 3;
        scores.social += contentMetrics.social.commentSections * 4;
        scores.social += contentMetrics.forms * 2; // Formularios de registro/login

        // Puntuación para sitios de referencia
        scores.reference += contentMetrics.navigation.breadcrumbs * 3;
        scores.reference += contentMetrics.links * 0.2; // Muchos enlaces
        if (contentMetrics.wordCount > 1000) scores.reference += 4;

        // Puntuación para entretenimiento
        scores.entertainment += contentMetrics.videos * 5;
        scores.entertainment += contentMetrics.images * 0.4;

        return scores;
    }

    /**
     * Combina puntuaciones de diferentes análisis
     * @param {Object} urlScores - Puntuaciones por URL
     * @param {Object} contentScores - Puntuaciones por contenido
     * @param {Object} structureScores - Puntuaciones por estructura
     * @returns {Object} Puntuaciones combinadas
     */
    combineTypeScores(urlScores, contentScores, structureScores) {
        const combinedScores = {};
        const allTypes = new Set([
            ...Object.keys(urlScores),
            ...Object.keys(contentScores),
            ...Object.keys(structureScores)
        ]);

        allTypes.forEach(type => {
            combinedScores[type] = (
                (urlScores[type] || 0) * 0.3 +         // 30% peso URL
                (contentScores[type] || 0) * 0.5 +     // 50% peso contenido
                (structureScores[type] || 0) * 0.2     // 20% peso estructura
            );
        });

        return combinedScores;
    }

    /**
     * Clasifica la densidad del contenido
     * @param {Object} contentMetrics - Métricas del contenido
     * @returns {string} Clasificación de densidad
     */
    classifyContentDensity(contentMetrics) {
        const wordsPerElement = contentMetrics.wordCount / Math.max(1, contentMetrics.links + contentMetrics.images);
        
        if (wordsPerElement > 50) return 'high';      // Mucho texto por elemento
        if (wordsPerElement > 20) return 'medium';    // Balance texto/elementos
        return 'low';                                 // Muchos elementos, poco texto
    }

    /**
     * Calcula complejidad de navegación
     * @param {Object} contentMetrics - Métricas del contenido
     * @returns {string} Nivel de complejidad
     */
    calculateNavigationComplexity(contentMetrics) {
        let complexity = 0;
        
        // Más enlaces = más opciones de navegación
        complexity += Math.min(10, contentMetrics.links / 10);
        
        // Más formularios = más interacciones complejas
        complexity += contentMetrics.forms * 2;
        
        // Más elementos de navegación = más complejo
        complexity += contentMetrics.navigation.navElements * 1.5;
        
        if (complexity > 15) return 'high';
        if (complexity > 7) return 'medium';
        return 'low';
    }

    /**
     * Inicializa patrones para detección de tipos de sitio
     * @returns {Object} Patrones organizados por tipo
     */
    initializeSiteTypePatterns() {
        return {
            news: {
                keywords: ['breaking', 'news', 'headline', 'story', 'reporter', 'journalist'],
                domains: ['cnn', 'bbc', 'reuters', 'ap', 'bloomberg', 'guardian'],
                structures: ['.article', '.news-item', '.headline']
            },
            ecommerce: {
                keywords: ['buy', 'cart', 'shop', 'product', 'price', 'checkout'],
                domains: ['amazon', 'ebay', 'shop', 'store', 'buy'],
                structures: ['.product', '.cart', '.price', '.checkout']
            },
            blog: {
                keywords: ['blog', 'post', 'author', 'comment', 'tag', 'category'],
                domains: ['blog', 'wordpress', 'medium', 'substack'],
                structures: ['.post', '.blog-entry', '.article']
            },
            social: {
                keywords: ['social', 'profile', 'friend', 'follow', 'like', 'share'],
                domains: ['facebook', 'twitter', 'instagram', 'linkedin', 'reddit'],
                structures: ['.feed', '.post', '.profile']
            }
        };
    }

    /**
     * Inicializa patrones de contenido
     * @returns {Object} Patrones de contenido
     */
    initializeContentPatterns() {
        return {
            readingIndicators: [
                /read more/i, /continue reading/i, /full article/i,
                /leer más/i, /seguir leyendo/i, /artículo completo/i
            ],
            navigationIndicators: [
                /next page/i, /previous/i, /página siguiente/i, /anterior/i,
                /more/i, /load more/i, /cargar más/i
            ],
            interactionElements: [
                /click here/i, /learn more/i, /sign up/i, /register/i,
                /haga clic/i, /aprenda más/i, /regístrese/i
            ]
        };
    }

    /**
     * Obtiene recomendaciones de navegación para un tipo de sitio
     * @param {string} siteType - Tipo de sitio
     * @param {Object} contentMetrics - Métricas del contenido
     * @returns {Object} Recomendaciones de navegación
     */
    getNavigationRecommendations(siteType, contentMetrics) {
        const recommendations = {
            news: {
                preferredLinks: ['article', 'headline', 'category', 'more news'],
                avoidLinks: ['subscribe', 'newsletter', 'ads'],
                readingTime: { min: 15000, max: 45000 },
                scrollDepth: { min: 0.4, max: 0.8 },
                clickProbability: 0.7
            },
            ecommerce: {
                preferredLinks: ['product', 'category', 'brand', 'reviews'],
                avoidLinks: ['checkout', 'cart', 'buy now', 'add to cart'],
                readingTime: { min: 8000, max: 25000 },
                scrollDepth: { min: 0.3, max: 0.7 },
                clickProbability: 0.8
            },
            blog: {
                preferredLinks: ['post', 'article', 'category', 'tag', 'author'],
                avoidLinks: ['subscribe', 'comment', 'login'],
                readingTime: { min: 20000, max: 60000 },
                scrollDepth: { min: 0.5, max: 0.9 },
                clickProbability: 0.6
            },
            social: {
                preferredLinks: ['profile', 'post', 'topic', 'community'],
                avoidLinks: ['login', 'register', 'message', 'friend'],
                readingTime: { min: 5000, max: 20000 },
                scrollDepth: { min: 0.2, max: 0.6 },
                clickProbability: 0.9
            },
            reference: {
                preferredLinks: ['article', 'definition', 'category', 'related'],
                avoidLinks: ['edit', 'history', 'discussion'],
                readingTime: { min: 25000, max: 90000 },
                scrollDepth: { min: 0.6, max: 1.0 },
                clickProbability: 0.5
            },
            entertainment: {
                preferredLinks: ['video', 'episode', 'series', 'channel'],
                avoidLinks: ['subscribe', 'premium', 'ads'],
                readingTime: { min: 10000, max: 30000 },
                scrollDepth: { min: 0.3, max: 0.7 },
                clickProbability: 0.8
            },
            tech: {
                preferredLinks: ['documentation', 'guide', 'tutorial', 'example'],
                avoidLinks: ['download', 'signup', 'trial'],
                readingTime: { min: 30000, max: 120000 },
                scrollDepth: { min: 0.7, max: 1.0 },
                clickProbability: 0.4
            },
            finance: {
                preferredLinks: ['news', 'analysis', 'market', 'report'],
                avoidLinks: ['trade', 'invest', 'signup', 'account'],
                readingTime: { min: 15000, max: 40000 },
                scrollDepth: { min: 0.5, max: 0.8 },
                clickProbability: 0.6
            },
            general: {
                preferredLinks: ['content', 'article', 'page', 'section'],
                avoidLinks: ['signup', 'login', 'subscribe'],
                readingTime: { min: 10000, max: 30000 },
                scrollDepth: { min: 0.3, max: 0.8 },
                clickProbability: 0.65
            }
        };

        const baseRecommendation = recommendations[siteType] || recommendations.general;

        // Ajustar recomendaciones basado en métricas de contenido
        const adjustedRecommendation = { ...baseRecommendation };

        // Ajustar tiempo de lectura basado en cantidad de contenido
        if (contentMetrics.wordCount > 1500) {
            adjustedRecommendation.readingTime.min *= 1.3;
            adjustedRecommendation.readingTime.max *= 1.3;
        } else if (contentMetrics.wordCount < 300) {
            adjustedRecommendation.readingTime.min *= 0.7;
            adjustedRecommendation.readingTime.max *= 0.7;
        }

        // Ajustar scroll depth basado en altura estimada
        if (contentMetrics.images > 10) {
            adjustedRecommendation.scrollDepth.max = Math.min(1.0, adjustedRecommendation.scrollDepth.max + 0.2);
        }

        // Ajustar probabilidad de clic basado en cantidad de enlaces
        if (contentMetrics.links > 50) {
            adjustedRecommendation.clickProbability = Math.min(1.0, adjustedRecommendation.clickProbability + 0.1);
        } else if (contentMetrics.links < 10) {
            adjustedRecommendation.clickProbability = Math.max(0.1, adjustedRecommendation.clickProbability - 0.1);
        }

        return adjustedRecommendation;
    }

    /**
     * Identifica elementos peligrosos a evitar
     * @param {Object} page - Página de Playwright
     * @returns {Promise<Array>} Lista de selectores a evitar
     */
    async identifyDangerousElements(page) {
        try {
            return await page.evaluate(() => {
                const dangerousSelectors = [];
                
                // Patrones de elementos peligrosos
                const dangerousPatterns = [
                    // Elementos de logout/login
                    '[href*="logout"]', '[href*="signout"]', '[href*="sign-out"]',
                    'a[href*="login"]', 'a[href*="signin"]', 'a[href*="sign-in"]',
                    
                    // Elementos de compra/checkout
                    '[href*="checkout"]', '[href*="cart"]', '[href*="buy"]',
                    '[href*="purchase"]', '[href*="order"]', '[href*="payment"]',
                    
                    // Formularios de registro/suscripción
                    'form[action*="register"]', 'form[action*="signup"]',
                    'form[action*="subscribe"]', 'form[action*="newsletter"]',
                    
                    // Enlaces de descarga
                    '[href*="download"]', '[href$=".exe"]', '[href$=".zip"]',
                    '[href$=".dmg"]', '[href$=".pkg"]',
                    
                    // Enlaces externos sospechosos
                    '[target="_blank"][href*="ad"]', '[href*="affiliate"]',
                    '[href*="referral"]', '[href*="tracking"]',
                    
                    // Elementos de configuración/admin
                    '[href*="admin"]', '[href*="settings"]', '[href*="config"]',
                    '[href*="preferences"]', '[href*="account"]'
                ];

                // Buscar elementos que coincidan con patrones peligrosos
                dangerousPatterns.forEach(pattern => {
                    const elements = document.querySelectorAll(pattern);
                    if (elements.length > 0) {
                        dangerousSelectors.push(pattern);
                    }
                });

                // Buscar por texto también
                const dangerousTexts = [
                    'logout', 'sign out', 'log out', 'cerrar sesión',
                    'buy now', 'comprar', 'add to cart', 'añadir al carrito',
                    'checkout', 'finalizar compra', 'download', 'descargar',
                    'subscribe', 'suscribirse', 'register', 'registrarse'
                ];

                const allLinks = document.querySelectorAll('a, button');
                allLinks.forEach(link => {
                    const text = link.textContent.toLowerCase().trim();
                    dangerousTexts.forEach(dangerousText => {
                        if (text.includes(dangerousText)) {
                            // Crear selector único para este elemento
                            const selector = this.createUniqueSelector(link);
                            if (selector && !dangerousSelectors.includes(selector)) {
                                dangerousSelectors.push(selector);
                            }
                        }
                    });
                });

                return dangerousSelectors;
            });

        } catch (error) {
            console.warn(`⚠️ Error identificando elementos peligrosos: ${error.message}`);
            return [];
        }
    }

    /**
     * Calcula métricas de legibilidad del contenido
     * @param {Object} page - Página de Playwright
     * @returns {Promise<Object>} Métricas de legibilidad
     */
    async calculateReadabilityMetrics(page) {
        try {
            return await page.evaluate(() => {
                const text = document.body.innerText || '';
                const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
                const words = text.split(/\s+/).filter(w => w.length > 0);
                const syllables = words.reduce((count, word) => {
                    return count + this.countSyllables(word);
                }, 0);

                const avgWordsPerSentence = words.length / Math.max(1, sentences.length);
                const avgSyllablesPerWord = syllables / Math.max(1, words.length);

                // Índice de legibilidad Flesch-Kincaid simplificado
                const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);

                let readabilityLevel;
                if (fleschScore >= 90) readabilityLevel = 'very_easy';
                else if (fleschScore >= 80) readabilityLevel = 'easy';
                else if (fleschScore >= 70) readabilityLevel = 'fairly_easy';
                else if (fleschScore >= 60) readabilityLevel = 'standard';
                else if (fleschScore >= 50) readabilityLevel = 'fairly_difficult';
                else if (fleschScore >= 30) readabilityLevel = 'difficult';
                else readabilityLevel = 'very_difficult';

                return {
                    fleschScore: Math.round(fleschScore),
                    readabilityLevel,
                    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
                    avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 10) / 10,
                    estimatedReadingTimeMinutes: Math.ceil(words.length / 250),
                    textComplexity: readabilityLevel
                };
            });

        } catch (error) {
            console.warn(`⚠️ Error calculando legibilidad: ${error.message}`);
            return {
                readabilityLevel: 'unknown',
                estimatedReadingTimeMinutes: 2
            };
        }
    }

    /**
     * Detecta áreas de contenido principal
     * @param {Object} page - Página de Playwright
     * @returns {Promise<Array>} Áreas de contenido detectadas
     */
    async detectContentAreas(page) {
        try {
            return await page.evaluate(() => {
                const contentAreas = [];

                // Selectores comunes para contenido principal
                const contentSelectors = [
                    'main', '[role="main"]', '.main-content', '#main-content',
                    'article', '[role="article"]', '.article', '.post-content',
                    '.content', '#content', '.entry-content', '.page-content'
                ];

                contentSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        const rect = element.getBoundingClientRect();
                        const text = element.innerText || '';
                        
                        if (rect.width > 0 && rect.height > 0 && text.length > 100) {
                            contentAreas.push({
                                selector,
                                position: {
                                    x: rect.x,
                                    y: rect.y,
                                    width: rect.width,
                                    height: rect.height
                                },
                                textLength: text.length,
                                wordCount: text.split(/\s+/).length,
                                priority: this.calculateContentPriority(element, rect, text)
                            });
                        }
                    });
                });

                // Ordenar por prioridad
                contentAreas.sort((a, b) => b.priority - a.priority);

                return contentAreas.slice(0, 5); // Top 5 áreas
            });

        } catch (error) {
            console.warn(`⚠️ Error detectando áreas de contenido: ${error.message}`);
            return [];
        }
    }

    /**
     * Evalúa la calidad del sitio web para navegación
     * @param {Object} contentMetrics - Métricas del contenido
     * @param {string} siteType - Tipo de sitio
     * @returns {Object} Evaluación de calidad
     */
    evaluateSiteQuality(contentMetrics, siteType) {
        let qualityScore = 50; // Score base

        // Evaluación por cantidad de contenido
        if (contentMetrics.wordCount > 500) qualityScore += 10;
        if (contentMetrics.wordCount > 1500) qualityScore += 10;

        // Evaluación por estructura
        if (contentMetrics.headings > 3) qualityScore += 5;
        if (contentMetrics.links > 10) qualityScore += 5;

        // Evaluación por navegabilidad
        if (contentMetrics.navigation.navElements > 0) qualityScore += 10;
        if (contentMetrics.navigation.breadcrumbs > 0) qualityScore += 5;

        // Penalizaciones
        if (contentMetrics.wordCount < 100) qualityScore -= 20; // Muy poco contenido
        if (contentMetrics.links < 3) qualityScore -= 10; // Pocas opciones de navegación

        // Ajustes específicos por tipo
        const typeAdjustments = {
            news: contentMetrics.editorial.dateElements > 0 ? 10 : -5,
            ecommerce: contentMetrics.commerce.priceElements > 0 ? 10 : -5,
            blog: contentMetrics.editorial.authorElements > 0 ? 10 : -5,
            reference: contentMetrics.wordCount > 1000 ? 15 : -10
        };

        if (typeAdjustments[siteType]) {
            qualityScore += typeAdjustments[siteType];
        }

        // Clasificación final
        let qualityLevel;
        if (qualityScore >= 80) qualityLevel = 'excellent';
        else if (qualityScore >= 65) qualityLevel = 'good';
        else if (qualityScore >= 50) qualityLevel = 'average';
        else if (qualityScore >= 35) qualityLevel = 'poor';
        else qualityLevel = 'very_poor';

        return {
            score: Math.max(0, Math.min(100, qualityScore)),
            level: qualityLevel,
            recommendedVisitTime: this.calculateRecommendedVisitTime(qualityScore, contentMetrics),
            navigationValue: qualityScore > 50 ? 'high' : 'low'
        };
    }

    /**
     * Calcula tiempo de visita recomendado basado en calidad
     * @param {number} qualityScore - Puntuación de calidad
     * @param {Object} contentMetrics - Métricas del contenido
     * @returns {Object} Tiempo recomendado min/max
     */
    calculateRecommendedVisitTime(qualityScore, contentMetrics) {
        let baseTime = {
            min: 10000, // 10 segundos mínimo
            max: 30000  // 30 segundos máximo
        };

        // Ajustar por calidad
        const qualityMultiplier = qualityScore / 50; // 0.7 - 2.0
        baseTime.min *= qualityMultiplier;
        baseTime.max *= qualityMultiplier;

        // Ajustar por cantidad de contenido
        const contentMultiplier = Math.min(2, Math.max(0.5, contentMetrics.wordCount / 500));
        baseTime.min *= contentMultiplier;
        baseTime.max *= contentMultiplier;

        return {
            min: Math.round(baseTime.min),
            max: Math.round(baseTime.max)
        };
    }

    /**
     * Limpia la caché de análisis
     */
    clearCache() {
        this.analysisCache.clear();
        console.log('🗑️ Caché de análisis limpiada');
    }

    /**
     * Obtiene estadísticas de la caché
     * @returns {Object} Estadísticas de caché
     */
    getCacheStats() {
        return {
            size: this.analysisCache.size,
            entries: Array.from(this.analysisCache.keys())
        };
    }
}

export default ContentAnalyzer;