import CookieDetector from './CookieDetector.js';

/**
 * Controlador principal de navegación
 * Coordina la navegación automática entre sitios web y recolección de cookies
 */
class NavigationController {
    constructor(databaseManager, configManager) {
        this.databaseManager = databaseManager;
        this.configManager = configManager;
        this.cookieDetector = new CookieDetector();
        this.visitedUrls = new Set();
        this.totalCookiesCollected = 0;
        this.sessionStats = {
            sitesVisited: 0,
            cookiesAccepted: 0,
            errors: 0,
            startTime: null,
            endTime: null
        };
    }

    /**
     * Inicia una sesión de navegación automática
     * @param {Object} browserInstance - Instancia del navegador de Ads Power
     * @param {number} targetCookies - Cantidad objetivo de cookies
     * @returns {Promise<Object>} Resultado de la sesión
     */
    async startNavigationSession(browserInstance, targetCookies = null) {
        try {
            const cookieTarget = targetCookies || this.configManager.getDefaultCookieTarget();
            const { page, profileId } = browserInstance;
            
            console.log(`🚀 Iniciando sesión de navegación para perfil ${profileId}`);
            console.log(`   Objetivo: ${cookieTarget} cookies`);
            
            this.sessionStats.startTime = new Date();
            this.visitedUrls.clear();
            
            // Obtener cookies iniciales
            const initialCookies = await this.cookieDetector.getCookieCount(page);
            console.log(`   Cookies iniciales: ${initialCookies}`);
            
            let currentCookies = initialCookies;
            let sitesAttempted = 0;
            const maxSitesAttempts = 100; // Límite de seguridad

            while (currentCookies < cookieTarget && sitesAttempted < maxSitesAttempts) {
                try {
                    sitesAttempted++;
                    
                    // Obtener sitio web aleatorio no visitado
                    const website = await this.getNextWebsite();
                    if (!website) {
                        console.log('   ⚠️  No hay más sitios disponibles');
                        break;
                    }

                    console.log(`\n📱 Visitando sitio ${sitesAttempted}: ${website.domain}`);
                    
                    // Navegar al sitio y procesar cookies
                    const siteResult = await this.visitWebsite(page, website);
                    
                    // Actualizar estadísticas
                    this.sessionStats.sitesVisited++;
                    if (siteResult.cookiesAccepted) {
                        this.sessionStats.cookiesAccepted++;
                    }
                    if (siteResult.error) {
                        this.sessionStats.errors++;
                    }

                    // Verificar progreso de cookies
                    const newCookieCount = await this.cookieDetector.getCookieCount(page);
                    const cookiesGained = newCookieCount - currentCookies;
                    currentCookies = newCookieCount;
                    
                    console.log(`   Cookies actuales: ${currentCookies}/${cookieTarget} (+${cookiesGained})`);
                    
                    // Actualizar estadísticas del sitio en la base de datos
                    if (cookiesGained > 0) {
                        await this.databaseManager.updateWebsiteStats(website.url, cookiesGained);
                    }

                    // Pausa entre sitios para simular comportamiento humano
                    await this.humanLikeDelay(2000, 5000);

                } catch (error) {
                    console.error(`   Error procesando sitio:`, error.message);
                    this.sessionStats.errors++;
                    await this.sleep(1000);
                }
            }

            this.sessionStats.endTime = new Date();
            this.totalCookiesCollected = currentCookies - initialCookies;

            const sessionResult = {
                success: true,
                profileId,
                initialCookies,
                finalCookies: currentCookies,
                cookiesCollected: this.totalCookiesCollected,
                targetReached: currentCookies >= cookieTarget,
                stats: { ...this.sessionStats },
                duration: this.sessionStats.endTime - this.sessionStats.startTime
            };

            console.log('\n🎯 Sesión completada:');
            console.log(`   Cookies recolectadas: ${this.totalCookiesCollected}`);
            console.log(`   Sitios visitados: ${this.sessionStats.sitesVisited}`);
            console.log(`   Avisos aceptados: ${this.sessionStats.cookiesAccepted}`);
            console.log(`   Errores: ${this.sessionStats.errors}`);
            console.log(`   Duración: ${Math.round(sessionResult.duration / 1000)}s`);

            return sessionResult;

        } catch (error) {
            console.error('Error en sesión de navegación:', error.message);
            throw error;
        }
    }

    /**
     * Visita un sitio web específico y procesa avisos de cookies
     * @param {Object} page - Instancia de página de Playwright
     * @param {Object} website - Objeto del sitio web a visitar
     * @returns {Promise<Object>} Resultado de la visita
     */
    async visitWebsite(page, website) {
        const visitStart = Date.now();
        let result = {
            url: website.url,
            domain: website.domain,
            success: false,
            cookiesAccepted: false,
            error: null,
            duration: 0
        };

        try {
            console.log(`   Navegando a: ${website.url}`);
            
            // Navegar al sitio con timeout
            await page.goto(website.url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // Marcar como visitado
            this.visitedUrls.add(website.url);
            
            // Esperar un momento para que la página cargue completamente
            await this.sleep(2000);

            // Intentar aceptar cookies
            console.log('   🍪 Buscando avisos de cookies...');
            const cookieResult = await this.cookieDetector.acceptCookies(page);
            
            if (cookieResult.success) {
                console.log(`   ✅ Cookies aceptadas: ${cookieResult.buttonText}`);
                result.cookiesAccepted = true;
            } else {
                console.log(`   ℹ️  No se encontraron avisos: ${cookieResult.reason}`);
            }

            // Simular tiempo de permanencia en el sitio
            const stayTime = this.calculateStayTime(website.category);
            console.log(`   ⏱️  Permaneciendo ${Math.round(stayTime/1000)}s en el sitio...`);
            await this.sleep(stayTime);

            result.success = true;

        } catch (error) {
            console.error(`   ❌ Error visitando ${website.domain}:`, error.message);
            result.error = error.message;
            
            // Intentar continuar con el siguiente sitio
            try {
                await page.goto('about:blank');
            } catch (navError) {
                console.error('   Error navegando a página en blanco:', navError.message);
            }
        }

        result.duration = Date.now() - visitStart;
        return result;
    }

    /**
     * Obtiene el siguiente sitio web a visitar
     * @returns {Promise<Object|null>} Sitio web o null si no hay más
     */
    async getNextWebsite() {
        try {
            const excludeUrls = Array.from(this.visitedUrls);
            const website = await this.databaseManager.getRandomWebsite(excludeUrls);
            return website;
        } catch (error) {
            console.error('Error obteniendo siguiente sitio web:', error.message);
            return null;
        }
    }

    /**
     * Calcula el tiempo de permanencia basado en la categoría del sitio
     * @param {string} category - Categoría del sitio web
     * @returns {number} Tiempo en milisegundos
     */
    calculateStayTime(category) {
        const baseTimes = {
            'news': { min: 3000, max: 8000 },
            'ecommerce': { min: 5000, max: 12000 },
            'tech': { min: 4000, max: 10000 },
            'blog': { min: 6000, max: 15000 },
            'social': { min: 2000, max: 6000 },
            'reference': { min: 3000, max: 8000 },
            'general': { min: 3000, max: 8000 }
        };

        const timeRange = baseTimes[category] || baseTimes.general;
        return Math.floor(Math.random() * (timeRange.max - timeRange.min + 1)) + timeRange.min;
    }

    /**
     * Obtiene las estadísticas actuales de la sesión
     * @returns {Object} Estadísticas de la sesión
     */
    getSessionStats() {
        return {
            ...this.sessionStats,
            totalCookiesCollected: this.totalCookiesCollected,
            sitesVisitedList: Array.from(this.visitedUrls)
        };
    }

    /**
     * Reinicia las estadísticas para una nueva sesión
     */
    resetSession() {
        this.visitedUrls.clear();
        this.totalCookiesCollected = 0;
        this.sessionStats = {
            sitesVisited: 0,
            cookiesAccepted: 0,
            errors: 0,
            startTime: null,
            endTime: null
        };
    }

    /**
     * Pausa con variabilidad humana
     * @param {number} min - Tiempo mínimo en ms
     * @param {number} max - Tiempo máximo en ms
     * @returns {Promise<void>}
     */
    async humanLikeDelay(min, max) {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        const variation = delay * 0.15; // ±15% de variación
        const finalDelay = delay + Math.floor(Math.random() * (variation * 2)) - variation;
        await this.sleep(Math.max(finalDelay, min));
    }

    /**
     * Pausa simple
     * @param {number} ms - Milisegundos a esperar
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default NavigationController;