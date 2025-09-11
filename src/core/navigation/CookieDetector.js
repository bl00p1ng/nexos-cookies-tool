/**
 * Detector inteligente de avisos de cookies
 * Implementa estrategia de múltiples capas para detectar y aceptar banners de cookies
 */
class CookieDetector {
    constructor() {
        this.cookiePatterns = this.initializeCookiePatterns();
    }

    /**
     * Inicializa los patrones de búsqueda de cookies
     * @returns {Object} Patrones de cookies organizados por estrategia
     */
    initializeCookiePatterns() {
        return {
            selectors: {
                highPriority: [
                    // IDs comunes
                    '#cookie-notice',
                    '#cookie-consent',
                    '#cookie-banner',
                    '#gdpr',
                    '#gdpr-consent',
                    '#cookie-popup',
                    '#privacy-popup',
                    
                    // Clases comunes
                    '.cookie-notice',
                    '.cookie-consent',
                    '.cookie-banner',
                    '.gdpr-banner',
                    '.cc-banner',
                    '.cookiebar',
                    '.cookie-overlay',
                    
                    // Atributos de datos
                    '[data-cookie-banner]',
                    '[data-gdpr]',
                    '[data-consent]',
                    '[aria-label*="cookie"]',
                    '[aria-label*="privacy"]'
                ],
                
                acceptButtons: [
                    // Por ID
                    '#accept-cookies',
                    '#accept-all',
                    '#allow-cookies',
                    '#agree',
                    '#consent-accept',
                    
                    // Por clase con palabras clave
                    'button[class*="accept"]',
                    'button[class*="agree"]',
                    'button[class*="allow"]',
                    'button[class*="consent"]',
                    'a[class*="accept"]',
                    'div[class*="accept"][role="button"]'
                ]
            },
            
            textPatterns: {
                bannerIndicators: [
                    /cookie/i,
                    /privacy/i,
                    /gdpr/i,
                    /consent/i,
                    /data protection/i,
                    /utilizamos cookies/i,
                    /we use cookies/i,
                    /this site uses cookies/i,
                    /acepta.*cookies/i,
                    /accept.*cookies/i
                ],
                
                acceptTexts: [
                    /^accept$/i,
                    /^agree$/i,
                    /^allow$/i,
                    /accept all/i,
                    /accept cookies/i,
                    /agree & proceed/i,
                    /got it/i,
                    /i agree/i,
                    /i accept/i,
                    /continue/i,
                    /ok/i,
                    /aceptar todo/i,
                    /aceptar/i,
                    /acepto/i,
                    /de acuerdo/i
                ]
            }
        };
    }

    /**
     * Detecta overlays y modales de cookies usando z-index alto
     * @param {Object} page - Instancia de página de Playwright
     * @returns {Promise<Array>} Lista de elementos detectados
     */
    async detectCookieOverlay(page) {
        try {
            // Esperar a que la página cargue completamente
            await page.waitForLoadState('networkidle', { timeout: 10000 });
            await this.sleep(2000); // Muchos banners aparecen con delay

            // Buscar elementos con z-index alto (típico de overlays)
            const overlayElements = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'));
                return elements
                    .filter(el => {
                        const style = window.getComputedStyle(el);
                        const zIndex = parseInt(style.zIndex) || 0;
                        const position = style.position;
                        
                        // Overlays típicamente tienen z-index > 1000 y position fixed/absolute
                        return zIndex > 1000 &&
                               (position === 'fixed' || position === 'absolute') &&
                               el.offsetWidth > 200 && // Mínimo ancho
                               el.offsetHeight > 50;   // Mínimo alto
                    })
                    .map(el => ({
                        tag: el.tagName,
                        classes: el.className,
                        id: el.id,
                        text: el.innerText?.substring(0, 200),
                        html: el.innerHTML?.substring(0, 500),
                        zIndex: window.getComputedStyle(el).zIndex
                    }));
            });

            return overlayElements;
        } catch (error) {
            console.error('Error detectando overlays de cookies:', error.message);
            return [];
        }
    }

    /**
     * Busca banners de cookies usando selectores conocidos
     * @param {Object} page - Instancia de página de Playwright
     * @returns {Promise<Object|null>} Banner encontrado o null
     */
    async findCookieBannerBySelectors(page) {
        try {
            for (const selector of this.cookiePatterns.selectors.highPriority) {
                try {
                    const element = await page.$(selector);
                    if (element && await element.isVisible()) {
                        const text = await element.innerText();
                        
                        // Verificar que el texto contiene indicadores de cookies
                        const hasIndicators = this.cookiePatterns.textPatterns.bannerIndicators.some(
                            pattern => pattern.test(text)
                        );
                        
                        if (hasIndicators) {
                            return {
                                element,
                                selector,
                                text: text.substring(0, 200),
                                method: 'selector'
                            };
                        }
                    }
                } catch (error) {
                    // Continuar con siguiente selector
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error buscando banner por selectores:', error.message);
            return null;
        }
    }

    /**
     * Busca botón de aceptación dentro de un banner detectado
     * @param {Object} page - Instancia de página de Playwright
     * @param {Object} cookieBanner - Banner de cookies detectado
     * @returns {Promise<Object|null>} Botón encontrado o null
     */
    async findAcceptButtonInBanner(page, cookieBanner) {
        try {
            if (!cookieBanner || !cookieBanner.element) {
                return null;
            }

            // Buscar botones dentro del banner
            const buttons = await cookieBanner.element.$$('button, a, div[role="button"], input[type="button"]');
            
            let bestButton = null;
            let highestScore = 0;

            for (const button of buttons) {
                try {
                    const isVisible = await button.isVisible();
                    if (!isVisible) continue;

                    const text = await button.innerText();
                    const classes = await button.getAttribute('class') || '';
                    const id = await button.getAttribute('id') || '';
                    
                    // Sistema de puntuación basado en probabilidad
                    let score = 0;
                    
                    // Textos positivos
                    if (/accept|agree|allow|consent|ok|continue/i.test(text)) score += 10;
                    if (/all|todo/i.test(text)) score += 5;
                    
                    // Clases e IDs positivos
                    if (/accept|agree|allow|consent/i.test(classes + id)) score += 8;
                    
                    // Textos negativos (evitar)
                    if (/reject|decline|deny|manage|settings|customize/i.test(text)) score -= 20;
                    if (/necessary|essential/i.test(text)) score -= 10;
                    
                    // Longitud de texto apropiada
                    if (text.length > 3 && text.length < 30) score += 3;
                    
                    if (score > highestScore && score > 5) {
                        highestScore = score;
                        bestButton = {
                            element: button,
                            text: text,
                            score: score,
                            method: 'banner-search'
                        };
                    }
                } catch (error) {
                    // Continuar con siguiente botón
                    continue;
                }
            }
            
            return bestButton;
        } catch (error) {
            console.error('Error buscando botón en banner:', error.message);
            return null;
        }
    }

    /**
     * Busca botón de aceptación usando selectores globales conocidos
     * @param {Object} page - Instancia de página de Playwright
     * @returns {Promise<Object|null>} Botón encontrado o null
     */
    async findAcceptButtonBySelectors(page) {
        try {
            for (const selector of this.cookiePatterns.selectors.acceptButtons) {
                try {
                    const element = await page.$(selector);
                    if (element && await element.isVisible()) {
                        const text = await element.innerText();
                        
                        // Verificar que es realmente un botón de aceptación
                        const isAcceptButton = this.cookiePatterns.textPatterns.acceptTexts.some(
                            pattern => pattern.test(text)
                        );
                        
                        if (isAcceptButton || text.length < 20) { // Botones cortos suelen ser de aceptación
                            return {
                                element,
                                selector,
                                text,
                                method: 'global-selector'
                            };
                        }
                    }
                } catch (error) {
                    // Continuar con siguiente selector
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error buscando botón por selectores globales:', error.message);
            return null;
        }
    }

    /**
     * Busca botón de aceptación por análisis de texto
     * @param {Object} page - Instancia de página de Playwright
     * @returns {Promise<Object|null>} Botón encontrado o null
     */
    async findAcceptButtonByText(page) {
        try {
            const textButton = await page.evaluate((patterns) => {
                const allButtons = document.querySelectorAll('button, a, div[role="button"], input[type="button"]');
                let bestMatch = null;
                let highestScore = 0;

                allButtons.forEach(btn => {
                    const text = btn.innerText?.trim() || '';
                    const isVisible = btn.offsetWidth > 0 && btn.offsetHeight > 0;
                    
                    if (!isVisible || text.length > 50) return; // Evitar textos muy largos

                    let score = 0;
                    
                    // Verificar patrones de texto
                    patterns.forEach(pattern => {
                        const regex = new RegExp(pattern.source, pattern.flags);
                        if (regex.test(text)) {
                            score += 10;
                            
                            // Bonus por textos exactos cortos
                            if (text.length < 20) score += 5;
                            
                            // Bonus por estar en un contexto de cookies
                            const parent = btn.closest('[class*="cookie"], [id*="cookie"], [class*="gdpr"], [data-consent]');
                            if (parent) score += 10;
                        }
                    });

                    if (score > highestScore && score > 5) {
                        highestScore = score;
                        bestMatch = {
                            element: btn,
                            text: text,
                            score: score
                        };
                    }
                });

                return bestMatch;
            }, this.cookiePatterns.textPatterns.acceptTexts.map(r => ({ source: r.source, flags: r.flags })));

            if (textButton) {
                // Recrear el elemento en el contexto de Playwright
                const element = await page.evaluateHandle(el => el, textButton.element);
                return {
                    element,
                    text: textButton.text,
                    score: textButton.score,
                    method: 'text-analysis'
                };
            }

            return null;
        } catch (error) {
            console.error('Error buscando botón por texto:', error.message);
            return null;
        }
    }

    /**
     * Flujo completo de detección y aceptación de cookies
     * @param {Object} page - Instancia de página de Playwright
     * @returns {Promise<Object>} Resultado de la operación
     */
    async acceptCookies(page) {
        const maxAttempts = 3;
        let attempts = 0;

        console.log('🍪 Iniciando detección de avisos de cookies...');

        while (attempts < maxAttempts) {
            try {
                attempts++;
                console.log(`   Intento ${attempts}/${maxAttempts}`);

                // ESTRATEGIA 1: Detectar overlays con z-index alto
                const overlays = await this.detectCookieOverlay(page);
                if (overlays.length > 0) {
                    console.log(`   Detectados ${overlays.length} overlays potenciales`);
                }

                // ESTRATEGIA 2: Buscar banner por selectores conocidos
                let cookieBanner = await this.findCookieBannerBySelectors(page);
                if (cookieBanner) {
                    console.log(`   Banner encontrado: ${cookieBanner.method}`);
                }

                // ESTRATEGIA 3: Buscar botón de aceptación
                let acceptButton = null;

                // Primero buscar dentro del banner si existe
                if (cookieBanner) {
                    acceptButton = await this.findAcceptButtonInBanner(page, cookieBanner);
                }

                // Si no se encontró, buscar globalmente
                if (!acceptButton) {
                    acceptButton = await this.findAcceptButtonBySelectors(page);
                }

                // Como último recurso, buscar por análisis de texto
                if (!acceptButton) {
                    acceptButton = await this.findAcceptButtonByText(page);
                }

                if (acceptButton) {
                    console.log(`   Botón encontrado: "${acceptButton.text}" (${acceptButton.method})`);
                    
                    // Simular comportamiento humano antes del clic
                    await this.humanLikeDelay(500, 1500);
                    
                    // Hacer clic en el botón
                    await acceptButton.element.click();
                    console.log('   ✅ Clic realizado en botón de aceptación');

                    // Verificar que el banner desapareció
                    await this.sleep(1000);
                    const bannersAfter = await this.detectCookieOverlay(page);
                    
                    if (bannersAfter.length < overlays.length || !cookieBanner) {
                        return {
                            success: true,
                            method: acceptButton.method,
                            attempts: attempts,
                            buttonText: acceptButton.text
                        };
                    }
                }

                // Si es el primer intento y no se encontró nada, esperar más tiempo
                if (attempts === 1) {
                    console.log('   Esperando más tiempo para que aparezcan banners...');
                    await this.sleep(3000);
                } else {
                    await this.sleep(1000);
                }

            } catch (error) {
                console.error(`   Error en intento ${attempts}:`, error.message);
                if (attempts === maxAttempts) {
                    return {
                        success: false,
                        reason: 'Error en todos los intentos',
                        error: error.message,
                        attempts: attempts
                    };
                }
            }
        }

        console.log('   ⚠️  No se pudo encontrar o aceptar aviso de cookies');
        return {
            success: false,
            reason: 'No se encontró botón de aceptación válido',
            attempts: attempts
        };
    }

    /**
     * Cuenta las cookies actuales en el contexto
     * @param {Object} page - Instancia de página de Playwright
     * @returns {Promise<number>} Cantidad de cookies
     */
    async getCookieCount(page) {
        try {
            const cookies = await page.context().cookies();
            return cookies.length;
        } catch (error) {
            console.error('Error obteniendo cookies:', error.message);
            return 0;
        }
    }

    /**
     * Utilidad para pausas con variabilidad humana
     * @param {number} min - Tiempo mínimo en ms
     * @param {number} max - Tiempo máximo en ms
     * @returns {Promise<void>}
     */
    async humanLikeDelay(min, max) {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        const variation = delay * 0.2; // ±20% de variación
        const finalDelay = delay + Math.floor(Math.random() * (variation * 2)) - variation;
        await this.sleep(Math.max(finalDelay, min));
    }

    /**
     * Utilidad para pausas simples
     * @param {number} ms - Milisegundos a esperar
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default CookieDetector;