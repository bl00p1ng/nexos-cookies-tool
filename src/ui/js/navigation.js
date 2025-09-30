/**
 * Gestor de Navegación para Cookies Hexzor
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

    //#region Reset y Limpieza
    /**
     * Resetea completamente el estado de navegación
     * Limpia sesiones, elementos DOM, estadísticas y cronómetros
     */
    resetNavigationState() {
        console.log('[NavigationManager] Limpiando estado de navegación...');
        
        // Detener cronómetro si está activo
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
            console.log('[NavigationManager] Cronómetro detenido');
        }
        
        // Limpiar todas las sesiones del Map
        const sessionCount = this.sessions.size;
        this.sessions.clear();
        console.log(`[NavigationManager] ${sessionCount} sesiones eliminadas del Map`);
        
        // Resetear estadísticas globales
        this.totalCookiesCollected = 0;
        this.totalSitesVisited = 0;
        this.startTime = null;
        this.isRunning = false;
        console.log('[NavigationManager] Estadísticas globales reseteadas');
        
        // Limpiar elementos DOM del contenedor de progreso
        const progressContainer = document.getElementById('progress-profiles');
        if (progressContainer) {
            progressContainer.innerHTML = '';
            console.log('[NavigationManager] Elementos DOM de progreso eliminados');
        }
        
        // Resetear estadísticas visuales en la UI
        this.resetProgressUI();
        
        console.log('[NavigationManager] Estado de navegación limpio');
    }

    /**
     * Resetea la UI de progreso a valores iniciales
     */
    resetProgressUI() {
        // Resetear contador de cookies totales
        const totalCookiesEl = document.getElementById('total-cookies');
        if (totalCookiesEl) {
            totalCookiesEl.textContent = '0';
        }
        
        // Resetear contador de sitios totales
        const totalSitesEl = document.getElementById('total-sites');
        if (totalSitesEl) {
            totalSitesEl.textContent = '0';
        }
        
        // Resetear cronómetro
        const elapsedTimeEl = document.getElementById('elapsed-time');
        if (elapsedTimeEl) {
            elapsedTimeEl.textContent = '00:00:00';
        }
        
        // Resetear estado de sesión
        const statusElement = document.getElementById('session-status');
        if (statusElement) {
            statusElement.textContent = 'Inactiva';
            statusElement.className = 'stat-value status-inactive';
        }
        
        console.log('[NavigationManager]UI de progreso reseteada');
    }
    //#endregion Reset y Limpieza

    //#region Crear elementos UI
    /**
     * Crea elemento visual para progreso de perfil individual
     * @param {Object} session - Datos de la sesión
     * @returns {HTMLElement} Elemento del progreso
     */
    createProfileProgressElement(session) {
        const div = document.createElement('div');
        div.className = 'profile-progress-item';
        div.innerHTML = `
            <div class="profile-progress-header">
                <div class="profile-id">${session.profileId}</div>
                <div class="profile-status status-${session.status}">${this.getStatusText(session.status)}</div>
            </div>
            <div class="profile-progress-stats">
                <div class="stat-item">
                    <span class="stat-label">Cookies:</span>
                    <span class="stat-value">${session.cookiesCollected}/${session.targetCookies}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Sitios:</span>
                    <span class="stat-value">${session.sitesVisited}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Actual:</span>
                    <span class="stat-value">${session.currentSite}</span>
                </div>
            </div>
            <div class="profile-progress-bar">
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${session.progress || 0}%"></div>
                </div>
                <div class="progress-percentage ${(session.progress || 0) >= 100 ? 'completed' : ''}">${Math.round(session.progress || 0)}%</div>
            </div>
        `;
        return div;
    }
    //#endregion Crear elementos UI

    //#region Update UI
    /**
     * Actualiza el progreso de navegación
     * @param {Object} data - Datos de progreso
     */
    updateProgress(data) {
        // Procesar según tipo de evento
        switch (data.type) {
            case 'session_started':
                this.handleSessionStarted(data);
                break;
            case 'session_progress':
                this.handleSessionProgress(data);
                break;
            case 'session_completed':
                this.handleSessionCompleted(data);
                break;
            case 'session_error':
                this.handleSessionError(data);
                break;
            case 'global_stats':
                this.handleGlobalStats(data);
                break;
        }

        // Actualizar UI
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

            // Si la navegación se detiene, asegurar que el estado se actualice
            const statusElement = document.getElementById('session-status');
            if (statusElement && this.sessions.size > 0) {
                // Verificar si se completó o se detuvo manualmente
                this.checkAllSessionsCompleted();
            }
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
     * Actualiza la interfaz de progreso
     * @param {Object} data - Datos de progreso
     */
    updateProgressUI(data) {
        const stats = this.getGlobalStats();
        
        // Actualizar estadísticas globales
        const totalCookiesEl = document.getElementById('total-cookies');
        const totalSitesEl = document.getElementById('total-sites');
        const elapsedTimeEl = document.getElementById('elapsed-time');
        
        if (totalCookiesEl) {
            totalCookiesEl.textContent = stats.totalCookies;
        }
        
        if (totalSitesEl) {
            totalSitesEl.textContent = stats.totalSites;
        }
        
        if (elapsedTimeEl && stats.uptime > 0) {
            const totalSeconds = Math.floor(stats.uptime / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            
            elapsedTimeEl.textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Actualizar progreso por perfil
        this.updateProfileProgress();
    }

    /**
     * Actualiza el progreso individual por perfil
     */
    updateProfileProgress() {
        const container = document.getElementById('profile-progress-list');
        if (!container) return;
        
        // Limpiar contenido existente
        container.innerHTML = '';
        
        // Crear progreso para cada sesión activa
        this.sessions.forEach((session, sessionId) => {
            const profileElement = this.createProfileProgressElement(session);
            container.appendChild(profileElement);
        });
    }
    //#endregion Update UI

    //#region Handlers de eventos
    /**
 * Maneja evento de sesión iniciada
    * @param {Object} data - Datos del evento
    */
    handleSessionStarted(data) {
        console.log('🚀 [NavigationManager] Sesión iniciada:', data.profileId, 'Target:', data.targetCookies);
        
        // Inicializar sesión con targetCookies incluido
        this.sessions.set(data.sessionId, {
            sessionId: data.sessionId,
            profileId: data.profileId,
            targetCookies: data.targetCookies || 2500, // Usar valor del evento o fallback
            cookiesCollected: 0,
            sitesVisited: 0,
            currentSite: 'Iniciando...',
            progress: 0,
            status: 'running',
            startTime: new Date(data.timestamp)
        });

        // Marcar como navegando y iniciar cronómetro si es la primera sesión
        if (!this.isRunning) {
            this.isRunning = true;
            this.startTime = new Date();
            
            // Iniciar cronómetro que actualiza cada segundo
            this.timerInterval = setInterval(() => {
                this.updateProgressUI({ type: 'timer_update' });
            }, 1000);
        }

        // Actualizar estado global
        this.updateGlobalStats();
        
        // Cambiar estado de la UI
        const statusElement = document.getElementById('session-status');
        if (statusElement) {
            statusElement.textContent = 'Navegando';
            statusElement.className = 'stat-value status-running';
        }
    }

    /**
     * Maneja evento de progreso de sesión
     * @param {Object} data - Datos del evento
     */
    handleSessionProgress(data) {
        const session = this.sessions.get(data.sessionId);
        if (session) {
            session.cookiesCollected = data.cookies || 0;
            session.sitesVisited = data.sitesVisited || 0;
            session.currentSite = data.currentSite || 'Navegando...';
            session.progress = data.progress || 0;
            session.lastUpdate = new Date(data.timestamp);
        }

        this.updateGlobalStats();
    }

    /**
     * Maneja evento de sesión completada
     * @param {Object} data - Datos del evento
     */
    handleSessionCompleted(data) {
        console.log('✅ [NavigationManager] Sesión completada:', data.profileId);
        
        // Actualizar sesión como completada
        const session = this.sessions.get(data.sessionId);
        if (session) {
            session.status = 'completed';
            session.progress = 100;
            session.endTime = new Date(data.timestamp);
            
            // Actualizar con estadísticas finales si están disponibles
            if (data.finalStats) {
                session.cookiesCollected = data.finalStats.cookiesCollected || session.cookiesCollected;
                session.sitesVisited = data.finalStats.sitesVisited || session.sitesVisited;
            }
        }

        // Verificar si todas las sesiones están completadas
        this.checkAllSessionsCompleted();
        
        // Actualizar estadísticas globales
        this.updateGlobalStats();
    }

    /**
     * Maneja evento de error de sesión
     * @param {Object} data - Datos del evento
     */
    handleSessionError(data) {
        console.error('❌ [NavigationManager] Error en sesión:', data.profileId, data.error);
        
        // Actualizar sesión con error
        const session = this.sessions.get(data.sessionId);
        if (session) {
            session.status = 'error';
            session.error = data.error;
            session.endTime = new Date(data.timestamp);
        }

        // Verificar si todas las sesiones han terminado (completadas o con error)
        this.checkAllSessionsCompleted();
        
        // Actualizar estadísticas globales
        this.updateGlobalStats();
    }

    /**
     * Maneja estadísticas globales
     * @param {Object} data - Datos del evento
     */
    handleGlobalStats(data) {
        if (data.stats) {
            // Actualizar estadísticas globales si vienen del backend
            this.totalCookiesCollected = data.stats.totalCookiesCollected || 0;
            this.totalSitesVisited = data.stats.totalSitesVisited || 0;
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
        
        // Limpiar cronómetro
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    //#endregion Handlers de eventos

    //#region Getters
    /**
     * Obtiene sesión por ID
     * @param {string} sessionId - ID de la sesión
     * @returns {Object|null} Datos de la sesión
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Convierte estado de sesión a texto legible
     * @param {string} status - Estado de la sesión
     * @returns {string} Texto del estado
     */
    getStatusText(status) {
        const statusMap = {
            'running': 'Navegando',
            'completed': 'Completado',
            'error': 'Error',
            'paused': 'Pausado'
        };
        return statusMap[status] || 'Desconocido';
    }

    /**
     * Obtiene todas las sesiones activas
     * @returns {Array} Array de sesiones
     */
    getAllSessions() {
        return Array.from(this.sessions.values());
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
     * Verifica si todas las sesiones han completado y actualiza el estado global
     */
    checkAllSessionsCompleted() {
        const totalSessions = this.sessions.size;
        const completedSessions = Array.from(this.sessions.values()).filter(
            session => session.status === 'completed' || session.progress >= 100
        ).length;

        console.log(`🔍 [NavigationManager] Sesiones completadas: ${completedSessions}/${totalSessions}`);

        // Si todas las sesiones están completadas, cambiar estado global
        if (totalSessions > 0 && completedSessions === totalSessions) {
            console.log('✅ [NavigationManager] Todas las sesiones completadas, actualizando estado global');
            
            this.isRunning = false;
            
            // Detener cronómetro
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            
            // Actualizar estado en la UI
            const statusElement = document.getElementById('session-status');
            if (statusElement) {
                statusElement.textContent = 'Completado';
                statusElement.className = 'stat-value status-completed';
            }
            
            // Actualizar estado global en la aplicación
            this.app.updateState('navigation.running', false);
        }
    }
    //#endregion Getters
}