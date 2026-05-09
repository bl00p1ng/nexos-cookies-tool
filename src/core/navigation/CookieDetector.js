/**
 * Detector inteligente de avisos de cookies
 * Implementa estrategia de múltiples capas para detectar y aceptar banners de cookies
 */

import CookieCounterManager from './CookieCounterManager.js';
class CookieDetector {
    constructor() {
        this.cookiePatterns = this.initializeCookiePatterns();
        this.cookieCounterManager = new CookieCounterManager();
    }

    /**
     * Inicializa los patrones de búsqueda de cookies
     * @returns {Object} Patrones de cookies organizados por estrategia
     */
    initializeCookiePatterns() {
        return {
            selectors: {
                highPriority: [
                    // IDs comunes más específicos
                    '#cookie-notice', '#cookie-consent', '#cookie-banner', '#gdpr', '#gdpr-consent',
                    '#cookie-popup', '#privacy-popup', '#cookieNotice', '#cookieConsent',
                    '#CookieConsent', '#cookieBanner', '#cookie-dialog', '#privacy-notice',
                    '#cookieBar', '#cookie-bar', '#privacy-bar', '#cookieModal', '#cookie-modal',
                    '#onetrust-banner-sdk', '#cookieChoiceInfo', '#cookie-choice-info',
                    
                    // Clases comunes ampliadas
                    '.cookie-notice', '.cookie-consent', '.cookie-banner', '.gdpr-banner',
                    '.cc-banner', '.cookiebar', '.cookie-overlay', '.privacy-notice',
                    '.cookie-notification', '.cookie-warning', '.privacy-alert',
                    '.consent-banner', '.consent-notice', '.consent-bar', '.gdpr-notice',
                    '.cookie-compliance', '.privacy-compliance', '.cookie-policy-banner',
                    '.onetrust-banner', '.consent-manager', '.cookie-acceptance',
                    '.privacy-banner', '.cookie-container', '.consent-container',
                    '.cookie-wrapper', '.privacy-wrapper', '.consent-wrapper',
                    '.cookie-message', '.privacy-message', '.consent-message',
                    
                    // Atributos de datos expandidos
                    '[data-cookie-banner]', '[data-gdpr]', '[data-consent]', '[data-privacy]',
                    '[data-cookie-notice]', '[data-cookie-bar]', '[data-onetrust]',
                    '[data-cookienotice]', '[data-cookie-consent]', '[data-privacy-notice]',
                    '[aria-label*="cookie"]', '[aria-label*="privacy"]', '[aria-label*="consent"]',
                    '[aria-describedby*="cookie"]', '[aria-describedby*="privacy"]',
                    
                    // Selectores por atributos role
                    '[role="dialog"][aria-label*="cookie"]', '[role="dialog"][aria-label*="privacy"]',
                    '[role="banner"][class*="cookie"]', '[role="banner"][class*="privacy"]',
                    '[role="alertdialog"][class*="cookie"]', '[role="region"][class*="cookie"]'
                ],
                
                acceptButtons: [
                    // IDs específicos de aceptación
                    '#accept-cookies', '#accept-all', '#allow-cookies', '#agree', '#consent-accept',
                    '#acceptAll', '#accept_all', '#acceptCookies', '#accept_cookies',
                    '#allowAll', '#allow_all', '#agreeAll', '#agree_all', '#btnAccept',
                    '#btn-accept', '#accept-btn', '#acceptButton', '#accept-button',
                    '#onetrust-accept-btn-handler', '#hs-eu-confirmation-button',
                    
                    // Clases de botones de aceptación
                    '.accept-cookies', '.accept-all', '.allow-cookies', '.agree-cookies',
                    '.consent-accept', '.btn-accept', '.button-accept', '.accept-btn',
                    '.accept-button', '.cookie-accept', '.privacy-accept', '.gdpr-accept',
                    '.consent-agree', '.cookie-agree', '.privacy-agree', '.allow-all',
                    '.accept-terms', '.agree-terms', '.consent-ok', '.cookie-ok',
                    
                    // Selectores por atributos específicos
                    'button[class*="accept"]', 'button[class*="agree"]', 'button[class*="allow"]',
                    'button[class*="consent"]', 'button[class*="ok"]', 'button[class*="yes"]',
                    'a[class*="accept"]', 'a[class*="agree"]', 'a[class*="allow"]',
                    'div[class*="accept"][role="button"]', 'div[class*="agree"][role="button"]',
                    'span[class*="accept"][role="button"]', '[data-accept]', '[data-consent="accept"]',
                    
                    // Selectores por ID que contengan palabras clave
                    '[id*="accept"]', '[id*="agree"]', '[id*="allow"]', '[id*="consent"]',
                    '[id*="ok"][class*="cookie"]', '[id*="yes"][class*="cookie"]',
                    
                    // Selectores por texto específico en atributos
                    '[aria-label*="accept"]', '[aria-label*="agree"]', '[aria-label*="allow"]',
                    '[title*="accept"]', '[title*="agree"]', '[title*="allow"]',
                    '[alt*="accept"]', '[alt*="agree"]', '[alt*="allow"]'
                ]
            },
            
            textPatterns: {
                bannerIndicators: [
                    // Inglés
                    /cookie/i, /privacy/i, /gdpr/i, /consent/i, /data protection/i,
                    /we use cookies/i, /this site uses cookies/i, /cookies help us/i,
                    /by continuing/i, /by using this site/i, /cookie policy/i,
                    /privacy policy/i, /data processing/i, /personal data/i,
                    /it's your choice/i, /your choice/i, /your preferences/i,
                    /Save and close/i, /manage preferences/i, /change settings/i,
                    /Privacy settings/i,
                    
                    // Español
                    /utilizamos cookies/i, /usamos cookies/i, /este sitio usa cookies/i,
                    /acepta.*cookies/i, /aceptar.*cookies/i, /política de cookies/i,
                    /política de privacidad/i, /tratamiento de datos/i, /datos personales/i,
                    /al continuar/i, /al usar este sitio/i,
                    
                    // Francés
                    /nous utilisons des cookies/i, /ce site utilise des cookies/i,
                    /politique de cookies/i, /politique de confidentialité/i,
                    
                    // Alemán  
                    /wir verwenden cookies/i, /diese website verwendet cookies/i,
                    /cookie-richtlinie/i, /datenschutz/i,
                    
                    // Italiano
                    /utilizziamo cookie/i, /questo sito utilizza cookie/i,
                    /politica dei cookie/i, /privacy/i
                ],
                
                acceptTexts: [
                    // Inglés - exactos
                    /^accept$/i, /^agree$/i, /^allow$/i, /^ok$/i, /^yes$/i, /^continue$/i,
                    /^got it$/i, /^understood$/i, /^proceed$/i, /^i accept$/i, /^Yes, I accept$/i,
                    /^i allow$/i, /^i understand$/i, /^i consent$/i,

                    
                    // Inglés - frases
                    /accept all/i, /accept cookies/i, /accept all cookies/i, /allow all/i,
                    /allow cookies/i, /allow all cookies/i, /agree.*cookies/i, /i agree/i,
                    /i accept/i, /i understand/i, /agree.*continue/i, /accept.*continue/i,
                    /yes.*accept/i, /yes.*agree/i, /ok.*accept/i, /accept.*terms/i,
                    /agree.*terms/i, /accept.*privacy/i, /agree.*privacy/i, /^save and close$/i, 
                    /save and close/i, /save preferences/i, /save settings/i, /save choices/i,
                    /i accept the terms/i, /i agree to the terms/i, /i accept the privacy policy/i,
                    /i agree to the privacy policy/i, /i accept the cookie policy/i,
                    /i agree to the cookie policy/i, /i consent to cookies/i, /i consent to the use of cookies/i,
                    /i consent to the privacy policy/i, /i consent to the terms/i,
                    
                    // Español
                    /^aceptar$/i, /^acepto$/i, /^de acuerdo$/i, /^entendido$/i, /^continuar$/i,
                    /^sí$/i, /^vale$/i, /^ok$/i, /aceptar todo/i, /aceptar cookies/i,
                    /aceptar todas/i, /acepto todo/i, /acepto cookies/i, /acepto todas/i,
                    /permitir todo/i, /permitir cookies/i, /estoy de acuerdo/i,
                    /acepto.*términos/i, /acepto.*privacidad/i, /acepto.*política/i,
                    
                    // Francés
                    /^accepter$/i, /^d'accord$/i, /^continuer$/i, /^oui$/i, /^ok$/i,
                    /accepter tout/i, /accepter.*cookies/i, /j'accepte/i, /je suis d'accord/i,
                    
                    // Alemán
                    /^akzeptieren$/i, /^einverstanden$/i, /^weiter$/i, /^ja$/i, /^ok$/i,
                    /alle akzeptieren/i, /cookies akzeptieren/i, /ich stimme zu/i,
                    
                    // Italiano
                    /^accetta$/i, /^accetto$/i, /^d'accordo$/i, /^continua$/i, /^sì$/i,
                    /accetta tutto/i, /accetta.*cookie/i, /sono d'accordo/i,
                    
                    // Patrones visuales (botones sin texto claro)
                    /✓/i, /✗/i, /×/i, /check/i, /cross/i
                ],
                
                rejectTexts: [
                    // Palabras que indican rechazo (para evitar)
                    /reject/i, /decline/i, /deny/i, /refuse/i, /manage/i, /settings/i,
                    /customize/i, /preferences/i, /options/i, /configure/i, /cancel/i,
                    /close/i, /necessary only/i, /essential only/i, /rechazar/i, /denegar/i,
                    /configurar/i, /personalizar/i, /gestionar/i, /solo esenciales/i,
                    /solo necesarias/i, /refuser/i, /gérer/i, /personnaliser/i,
                    /ablehnen/i, /verwalten/i, /anpassen/i, /rifiuta/i, /gestisci/i
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
            // Esperar a que la página cargue - timeout más corto
            await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
            await this.sleep(1500); // Reducir tiempo de espera

            // Buscar elementos con z-index alto (típico de overlays)
            const overlayElements = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'));
                return elements
                    .filter(el => {
                        const style = window.getComputedStyle(el);
                        const zIndex = parseInt(style.zIndex) || 0;
                        const position = style.position;
                        const display = style.display;
                        const visibility = style.visibility;
                        
                        // Overlays típicamente tienen z-index > 999 y position fixed/absolute
                        return zIndex > 999 &&
                               (position === 'fixed' || position === 'absolute') &&
                               display !== 'none' &&
                               visibility !== 'hidden' &&
                               el.offsetWidth > 100 && // Reducir mínimo ancho
                               el.offsetHeight > 30;   // Reducir mínimo alto
                    })
                    .map(el => ({
                        tag: el.tagName,
                        classes: el.className,
                        id: el.id,
                        text: el.innerText?.substring(0, 300),
                        zIndex: window.getComputedStyle(el).zIndex,
                        hasButtons: el.querySelectorAll('button, a, [role="button"]').length
                    }))
                    .filter(el => el.hasButtons > 0); // Solo elementos con botones
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
            const buttons = await cookieBanner.element.$$('button, a, div[role="button"], input[type="button"], span[role="button"]');
            
            let bestButton = null;
            let highestScore = 0;

            for (const button of buttons) {
                try {
                    const isVisible = await button.isVisible();
                    if (!isVisible) continue;

                    const text = (await button.innerText()).trim();
                    const classes = await button.getAttribute('class') || '';
                    const id = await button.getAttribute('id') || '';
                    const ariaLabel = await button.getAttribute('aria-label') || '';
                    const title = await button.getAttribute('title') || '';
                    
                    // Sistema de puntuación mejorado
                    let score = 0;
                    
                    // Textos de aceptación positivos
                    const positiveMatch = this.cookiePatterns.textPatterns.acceptTexts.some(
                        pattern => pattern.test(text) || pattern.test(ariaLabel) || pattern.test(title)
                    );
                    if (positiveMatch) score += 15;
                    
                    // Patrones en clases e IDs
                    if (/accept|agree|allow|consent|ok|yes/i.test(classes + id)) score += 10;
                    
                    // Textos negativos (evitar)
                    const negativeMatch = this.cookiePatterns.textPatterns.rejectTexts.some(
                        pattern => pattern.test(text) || pattern.test(ariaLabel) || pattern.test(title)
                    );
                    if (negativeMatch) score -= 25;
                    
                    // Longitud de texto apropiada
                    if (text.length > 0 && text.length < 50) score += 3;
                    if (text.length > 0 && text.length < 20) score += 2; // Bonus para textos cortos
                    
                    // Posición del botón (los primeros suelen ser de aceptación)
                    const buttonIndex = buttons.indexOf(button);
                    if (buttonIndex === 0) score += 5;
                    if (buttonIndex === 1) score += 3;
                    
                    if (score > highestScore && score > 8) {
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
                        const text = (await element.innerText()).trim();
                        const ariaLabel = await element.getAttribute('aria-label') || '';
                        const title = await element.getAttribute('title') || '';
                        
                        // Verificar que es realmente un botón de aceptación
                        const isAcceptButton = this.cookiePatterns.textPatterns.acceptTexts.some(
                            pattern => pattern.test(text) || pattern.test(ariaLabel) || pattern.test(title)
                        );
                        
                        // Verificar que no es un botón de rechazo
                        const isRejectButton = this.cookiePatterns.textPatterns.rejectTexts.some(
                            pattern => pattern.test(text) || pattern.test(ariaLabel) || pattern.test(title)
                        );
                        
                        if ((isAcceptButton || text.length < 20) && !isRejectButton) {
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
     * Busca botón de aceptación por texto usando patrones conocidos
     * @param {Object} page - Página de Playwright
     * @returns {Promise<Object|null>} Información del botón encontrado
     */
    async findAcceptButtonByText(page) {
        try {
            return await page.evaluate(() => {
                const patterns = [
                    /accept|agree|allow|consent|ok|continue|got it|i understand|yes/i,
                    /Save and close/i,
                    /acepto|aceptar|permitir|consentir|entendido|de acuerdo|continuar/i,
                    /akzeptieren|einverstanden|ja|weiter|verstanden/i,
                    /accepter|d'accord|continuer|compris|oui/i,
                    /accetto|accetta|continua|ho capito|si/i,
                    /✓|✔|accept all|accept cookies|agree all|agree cookies/i,
                    /aceptar todo|aceptar cookies|acepto todo|acepto cookies/i,
                    /alle akzeptieren|cookies akzeptieren|ich stimme zu/i,
                    /accepter tout|accepter des cookies|j'accepte/i
                ];

                const allButtons = document.querySelectorAll('button, a, div[role="button"], span[role="button"]');
                let bestMatch = null;
                let highestScore = 0;

                allButtons.forEach(btn => {
                    const text = btn.innerText?.trim() || '';
                    const isVisible = btn.offsetWidth > 0 && btn.offsetHeight > 0;

                    if (!isVisible || text.length > 50) return; // Evitar textos muy largos

                    let score = 0;
                    patterns.forEach(pattern => {
                        if (new RegExp(pattern.source, pattern.flags).test(text)) {
                            score += 10;

                            // Bonus por textos exactos cortos
                            if (text.length < 20) score += 5;

                            // Bonus por estar en un contexto de cookies
                            const parent = btn.closest('[class*="cookie"], [id*="cookie"], [class*="gdpr"], [id*="gdpr"]');
                            if (parent) score += 10;
                        }
                    });

                    if (score > 5 && score > highestScore) {
                        bestMatch = {
                            selector: btn.tagName +
                                (btn.id ? '#' + btn.id : '') +
                                (btn.className ? '.' + btn.className.split(' ')[0] : ''),
                            text: text,
                            score: score,
                            method: 'text_pattern'
                        };
                        highestScore = score;
                    }
                });

                return bestMatch;
            });
        } catch (error) {
            console.error('Error buscando botón por texto:', error.message);
            return null;
        }
    }

    /**
     * Realiza clic en un botón de forma robusta
     * @param {Object} page - Instancia de página de Playwright
     * @param {Object} button - Objeto del botón a hacer clic
     * @returns {Promise<boolean>} Éxito del clic
     */
    async clickButtonRobust(page, button) {
        try {
            const { element } = button;
            
            // Verificar que el elemento sigue siendo válido
            if (!element) {
                console.log('Elemento no válido para clic');
                return false;
            }

            // Verificar que el elemento es visible
            const isVisible = await element.isVisible();
            if (!isVisible) {
                console.log('Elemento no visible para clic');
                return false;
            }

            // Scroll al elemento si es necesario
            try {
                await element.scrollIntoViewIfNeeded();
                await this.sleep(500);
            } catch (scrollError) {
                console.log('No se pudo hacer scroll al elemento');
            }

            // Intentar clic normal primero
            try {
                await element.click({ timeout: 5000 });
                console.log('Clic normal exitoso');
                return true;
            } catch (clickError) {
                console.log('Clic normal falló, intentando clic forzado');
            }

            // Intentar clic forzado
            try {
                await element.click({ force: true, timeout: 5000 });
                console.log('Clic forzado exitoso');
                return true;
            } catch (forceClickError) {
                console.log('Clic forzado falló, intentando JavaScript');
            }

            // Intentar clic con JavaScript como último recurso
            try {
                await element.evaluate(el => el.click());
                console.log('Clic JavaScript exitoso');
                return true;
            } catch (jsClickError) {
                console.log('Todos los métodos de clic fallaron');
                return false;
            }

        } catch (error) {
            console.error('Error en clic robusto:', error.message);
            return false;
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

        console.log('Iniciando detección de avisos de cookies...');

        while (attempts < maxAttempts) {
            try {
                attempts++;
                console.log(`Intento ${attempts}/${maxAttempts}`);

                // ESTRATEGIA 1: Detectar overlays con z-index alto
                const overlays = await this.detectCookieOverlay(page);
                if (overlays.length > 0) {
                    console.log(`Detectados ${overlays.length} overlays potenciales`);
                }

                // ESTRATEGIA 2: Buscar banner por selectores conocidos
                let cookieBanner = await this.findCookieBannerBySelectors(page);
                if (cookieBanner) {
                    console.log(`Banner encontrado: ${cookieBanner.method}`);
                }

                // ESTRATEGIA 3: Buscar botón de aceptación (múltiples estrategias)
                let acceptButton = null;
                const strategies = [
                    () => cookieBanner ? this.findAcceptButtonInBanner(page, cookieBanner) : null,
                    () => this.findAcceptButtonBySelectors(page),
                    () => this.findAcceptButtonByText(page)
                ];

                for (const strategy of strategies) {
                    if (!acceptButton) {
                        acceptButton = await strategy();
                        if (acceptButton) break;
                    }
                }

                if (acceptButton) {
                    console.log(`Botón encontrado: "${acceptButton.text}"(${acceptButton.method})`);
                    
                    // Simular comportamiento humano antes del clic
                    await this.humanLikeDelay(300, 1000);
                    
                    // Hacer clic robusto en el botón
                    const clickSuccess = await this.clickButtonRobust(page, acceptButton);
                    
                    if (clickSuccess) {
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
                        } else {
                            console.log('Banner no desapareció después del clic');
                        }
                    }
                }

                // Esperar entre intentos
                if (attempts < maxAttempts) {
                    await this.sleep(attempts === 1 ? 2000 : 1000);
                }

            } catch (error) {
                console.error(`Error en intento ${attempts}:`, error.message);
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

        console.log('No se pudo encontrar o aceptar aviso de cookies');
        return {
            success: false,
            reason: 'No se encontró botón de aceptación válido',
            attempts: attempts
        };
    }

    /**
     * Cuenta las cookies actuales
     * @param {Object} page - Instancia de página de Playwright
     * @param {string} profileId - ID del perfil para logging
     * @returns {Promise<number>} Cantidad de cookies
     */
    async getCookieCount(page, profileId = 'unknown') {
        try {
            const result = await this.cookieCounterManager.getCookieCount(page, profileId);
            
            if (result.warning) {
                console.warn(`[${profileId}] ${result.warning}`);
            }
            
            return result.count;
            
        } catch (error) {
            console.error(`[${profileId}] Error crítico en conteo de cookies: ${error.message}`);
            
            // Último recurso: retornar 0 de forma segura
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
     * Obtiene métricas del contador de cookies
     * @returns {Object} Métricas detalladas
     */
    getCookieCountMetrics() {
        return this.cookieCounterManager.getMetrics();
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