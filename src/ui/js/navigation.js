/**
 * Gestor de Navegación para Nexos Cookies Tool
 * Maneja el estado y progreso de las sesiones de navegación
 */
class NavigationManager {
    constructor(app) {
        this.app = app;
        this.sessions = new Map();
        this.isRunning = false;
        this.totalCookiesCollected = 0;
        this.totalSitesVisited = 0;
        this.startTime = null;
    }

    /**
     * Actualiza el progreso de navegación
     * @param {Object} data - Datos de progreso
     */
    updateProgress(data) {
        if (data.sessionId) {
            this.sessions.set(data.sessionId, data);
        }

        // Actualizar estadísticas globales
        this.updateGlobalStats();

        // Actualizar UI si hay elementos disponibles
        this.updateProgressUI(data);
    }

    /**
     * Actualiza el estado de navegación
     * @param {Object} data - Datos de estado
     */
    updateStatus(data) {
        this.isRunning = data.running || false;
        
        if (data.running && !this.startTime) {
            this.startTime = new Date();
        } else if (!data.running) {
            this.startTime = null;
        }

        // Actualizar estado en la aplicación
        this.app.updateState('navigation.running', this.isRunning);
        this.app.updateState('navigation.stats', this.getGlobalStats());
    }

    /**
     * Actualiza estadísticas globales
     */
    updateGlobalStats() {
        let totalCookies = 0;
        let totalSites = 0;

        for (const session of this.sessions.values()) {
            totalCookies += session.cookiesCollected || 0;
            totalSites += session.sitesVisited || 0;
        }

        this.totalCookiesCollected = totalCookies;
        this.totalSitesVisited = totalSites;

        // Actualizar estado global
        this.app.updateState('navigation.stats', this.getGlobalStats());
    }

    /**
     * Obtiene estadísticas globales
     * @returns {Object} Estadísticas globales
     */
    getGlobalStats() {
        return {
            totalCookies: this.totalCookiesCollected,
            totalSites: this.totalSitesVisited,
            activeSessions: this.sessions.size,
            isRunning: this.isRunning,
            startTime: this.startTime,
            uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0
        };
    }

    /**
     * Actualiza la interfaz de progreso
     * @param {Object} data - Datos de progreso
     */
    updateProgressUI(data) {
        // Implementar actualizaciones específicas de UI aquí
        const progressElement = document.getElementById('navigation-progress');
        if (progressElement && data) {
            // Actualizar elementos específicos según la estructura del HTML
            this.renderProgressInfo(data);
        }
    }

    /**
     * Renderiza información de progreso
     * @param {Object} data - Datos de progreso
     */
    renderProgressInfo(data) {
        const stats = this.getGlobalStats();
        
        // Actualizar contadores globales
        const totalCookiesEl = document.getElementById('total-cookies');
        const totalSitesEl = document.getElementById('total-sites');
        const activeSessionsEl = document.getElementById('active-sessions');

        if (totalCookiesEl) totalCookiesEl.textContent = stats.totalCookies;
        if (totalSitesEl) totalSitesEl.textContent = stats.totalSites;
        if (activeSessionsEl) activeSessionsEl.textContent = stats.activeSessions;

        // Actualizar tiempo de ejecución
        const uptimeEl = document.getElementById('uptime');
        if (uptimeEl && stats.uptime > 0) {
            const minutes = Math.floor(stats.uptime / 60000);
            const seconds = Math.floor((stats.uptime % 60000) / 1000);
            uptimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    /**
     * Limpia recursos y estado
     */
    cleanup() {
        this.sessions.clear();
        this.isRunning = false;
        this.totalCookiesCollected = 0;
        this.totalSitesVisited = 0;
        this.startTime = null;
    }

    /**
     * Obtiene sesión por ID
     * @param {string} sessionId - ID de la sesión
     * @returns {Object|null} Datos de la sesión
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Obtiene todas las sesiones activas
     * @returns {Array} Array de sesiones
     */
    getAllSessions() {
        return Array.from(this.sessions.values());
    }
}