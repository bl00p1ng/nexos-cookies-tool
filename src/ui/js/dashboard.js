/**
 * Gestor del Dashboard de Cookies Hexzor
 * Maneja la navegación entre secciones y la interfaz principal
 */
class DashboardManager {
    constructor(app) {
        this.app = app;
        this.currentSection = 'automation';
        this.initialized = false;

        // Referencias a elementos DOM
        this.elements = {
            userEmail: null,
            logoutBtn: null,
            navItems: [],
            sections: [],
            refreshAdsPowerBtn: null,
            adsPowerStatus: null,
            profileList: null,
            navigationForm: null,
            startNavigationBtn: null,
            stopNavigationBtn: null,
            progressMonitor: null
        };

        // Estado del dashboard
        this.state = {
            selectedProfiles: new Set(),
            adsPowerConnected: false,
            profiles: [],
            navigationRunning: false
        };

        // Instancia del gestor de perfiles
        this.profileInputManager = new ProfileInputManager();
    }

    /**
     * Inicializa el dashboard
     */
    async initialize() {
        if (this.initialized) return;

        try {
            this.initializeElements();
            this.setupEventListeners();
            this.updateUserInfo();
            await this.loadInitialData();
            this.showSection('automation');

            this.profileInputManager.initialize();
            
            this.initialized = true;
            console.log('✅ Dashboard inicializado');

        } catch (error) {
            console.error('❌ Error inicializando dashboard:', error);
            throw error;
        }
    }

    /**
     * Inicializa referencias a elementos DOM
     */
    initializeElements() {
        // Header elements
        this.elements.userEmail = document.getElementById('user-email');
        this.elements.logoutBtn = document.getElementById('logout-btn');

        // Navigation elements
        this.elements.navItems = Array.from(document.querySelectorAll('.nav-item'));
        this.elements.sections = Array.from(document.querySelectorAll('.content-section'));

        // Ads Power elements
        this.elements.refreshAdsPowerBtn = document.getElementById('refresh-adspower');
        this.elements.adsPowerStatus = document.getElementById('adspower-status');
        this.elements.profileList = document.getElementById('profile-list');

        // Navigation form elements
        this.elements.navigationForm = document.getElementById('navigation-config-form');
        this.elements.startNavigationBtn = document.getElementById('start-navigation-btn');
        this.elements.stopNavigationBtn = document.getElementById('stop-navigation-btn');
        this.elements.progressMonitor = document.getElementById('progress-monitor');

        // Verificar elementos críticos
        const required = ['navItems', 'sections'];
        for (const key of required) {
            if (!this.elements[key] || this.elements[key].length === 0) {
                throw new Error(`Elementos críticos del dashboard no encontrados: ${key}`);
            }
        }
    }

    //#region Eventos
    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Logout button
        if (this.elements.logoutBtn) {
            this.elements.logoutBtn.addEventListener('click', async () => {
                await this.handleLogout();
            });
        }

        // Navigation items
        this.elements.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section;
                if (section) {
                    this.showSection(section);
                }
            });
        });

        // Refresh Ads Power button
        if (this.elements.refreshAdsPowerBtn) {
            this.elements.refreshAdsPowerBtn.addEventListener('click', () => {
                this.checkAdsPowerStatus();
            });
        }

        // Navigation form
        if (this.elements.navigationForm) {
            this.elements.navigationForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleStartNavigation();
            });
        }

        // Start/Stop navigation buttons
        if (this.elements.startNavigationBtn) {
            this.elements.startNavigationBtn.addEventListener('click', () => {
                this.handleStartNavigation();
            });
        }

        if (this.elements.stopNavigationBtn) {
            this.elements.stopNavigationBtn.addEventListener('click', () => {
                this.handleStopNavigation();
            });
        }

        // Eventos de estado de la aplicación
        document.addEventListener('stateChange', (event) => {
            this.handleStateChange(event.detail);
        });

        // Eventos de teclado
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });

        // Event listeners para inputs de perfiles (detectar cambios)
        document.addEventListener('input', (event) => {
            if (event.target && event.target.classList.contains('profile-id-input')) {
                this.updateNavigationButtonState();
            }
        });

        // Event listeners para cambios dinámicos en el DOM (cuando se agregan/quitan inputs)
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    // Si se agregaron o quitaron inputs de perfiles, actualizar botón
                    this.updateNavigationButtonState();
                }
            });
        });

        const profileContainer = document.getElementById('profile-inputs');
        if (profileContainer) {
            observer.observe(profileContainer, { 
                childList: true, 
                subtree: true 
            });
        }
    }
    //#endregion Eventos

    /**
     * Actualiza información del usuario en el header
     */
    updateUserInfo() {
        if (this.elements.userEmail && this.app.currentUser) {
            this.elements.userEmail.textContent = this.app.currentUser.email;
        }
    }

    /**
     * Carga datos iniciales del dashboard
     */
    async loadInitialData() {
        // Verificar estado de Ads Power
        await this.checkAdsPowerStatus();

        // Cargar estadísticas de base de datos
        await this.loadDatabaseStats();

        // Verificar información del sistema
        this.updateSystemInfo();
    }

    /**
     * Verifica estado de conexión con Ads Power
     */
    async checkAdsPowerStatus() {
        try {
            this.showAdsPowerLoading();

            const result = await window.electronAPI.adspower.checkStatus();
            
            if (result.success) {
                this.showAdsPowerConnected(result.status);
                this.app.updateState('adspower.connected', true);
                this.app.updateState('adspower.status', result.status);

            } else {
                this.showAdsPowerDisconnected(result.error);
                this.app.updateState('adspower.connected', false);
                this.clearProfiles();
            }

        } catch (error) {
            console.error('Error verificando Ads Power:', error);
            this.showAdsPowerDisconnected('Error de conexión');
            this.app.updateState('adspower.connected', false);
        }
    }

    /**
     * Obtener los perfiles seleccionados por el usuario
     * @returns {Array} Array de IDs de perfiles seleccionados
     */
    getSelectedProfiles() {
        return this.profileInputManager.getValidProfileIds();
    }

    /**
     * Carga estadísticas de base de datos
     */
    async loadDatabaseStats() {
        try {
            const result = await window.electronAPI.database.getStats();
            
            if (result.success) {
                this.app.updateState('database.stats', result.stats);
                this.renderDatabaseStats(result.stats);
            }

        } catch (error) {
            console.error('Error cargando estadísticas de DB:', error);
        }
    }

    /**
     * Muestra una sección específica del dashboard
     */
    showSection(sectionName) {
        // Actualizar navegación
        this.elements.navItems.forEach(item => {
            if (item.dataset.section === sectionName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Actualizar secciones
        this.elements.sections.forEach(section => {
            if (section.id === `${sectionName}-section`) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });

        this.currentSection = sectionName;

        // Cargar datos específicos de la sección si es necesario
        this.loadSectionData(sectionName);
    }

    /**
     * Carga datos específicos para una sección
     */
    async loadSectionData(sectionName) {
        switch (sectionName) {
            case 'profiles':
                if (this.app.getState('adspower.connected')) {
                    await this.loadDetailedProfiles();
                }
                break;
            case 'database':
                await this.loadDatabasePreview();
                break;
            case 'reports':
                await this.loadReports();
                break;
        }
    }

    /**
     * Renderiza el estado de Ads Power
     */
    showAdsPowerLoading() {
        if (!this.elements.adsPowerStatus) return;

        this.elements.adsPowerStatus.innerHTML = `
            <div class="loading-indicator">
                <div class="loading-spinner-sm"></div>
                <span>Verificando conexión...</span>
            </div>
        `;
    }

    showAdsPowerConnected(status) {
        if (!this.elements.adsPowerStatus) return;

        this.elements.adsPowerStatus.innerHTML = `
            <div class="adspower-connected">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                    <path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <div>
                    <div><strong>Ads Power Conectado</strong></div>
                </div>
            </div>
        `;

        this.state.adsPowerConnected = true;
    }

    showAdsPowerDisconnected(error) {
        if (!this.elements.adsPowerStatus) return;

        this.elements.adsPowerStatus.innerHTML = `
            <div class="adspower-disconnected">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                    <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <div>
                    <div><strong>Ads Power Desconectado</strong></div>
                    <div style="font-size: 12px; opacity: 0.8;">
                        ${error || 'Verificar que Ads Power esté ejecutándose'}
                    </div>
                </div>
            </div>
        `;

        this.state.adsPowerConnected = false;
    }

    /**
     * Renderiza lista de perfiles
     */
    renderProfiles(profiles) {
        if (!this.elements.profileList) return;

        if (!profiles || profiles.length === 0) {
            this.elements.profileList.innerHTML = `
                <div class="empty-state" style="padding: 40px; text-align: center;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="margin-bottom: 16px; color: #9ca3af;">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" 
                              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <h3>No hay perfiles disponibles</h3>
                    <p>Crea perfiles en Ads Power para comenzar</p>
                </div>
            `;
            return;
        }

        const profilesHtml = profiles.map(profile => `
            <div class="profile-item ${this.state.selectedProfiles.has(profile.user_id) ? 'selected' : ''}" 
                 data-profile-id="${profile.user_id}">
                <div class="profile-checkbox">
                    ${this.state.selectedProfiles.has(profile.user_id) ? 
                        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : 
                        ''
                    }
                </div>
                <div class="profile-info">
                    <div class="profile-name">${profile.name || `Perfil ${profile.user_id}`}</div>
                    <div class="profile-status">
                        <span class="status-indicator ${profile.status === 'Active' ? 'active' : 'inactive'}"></span>
                        ${profile.status || 'Inactivo'}
                    </div>
                </div>
            </div>
        `).join('');

        this.elements.profileList.innerHTML = profilesHtml;

        // Agregar event listeners a los perfiles
        this.elements.profileList.querySelectorAll('.profile-item').forEach(item => {
            item.addEventListener('click', () => {
                const profileId = item.dataset.profileId;
                this.toggleProfile(profileId);
            });
        });

        this.updateNavigationButtonState();
    }

    /**
     * Limpia lista de perfiles
     */
    clearProfiles() {
        if (this.elements.profileList) {
            this.elements.profileList.innerHTML = `
                <div class="loading-profiles">
                    <div class="loading-spinner-sm"></div>
                    <span>Ads Power no disponible</span>
                </div>
            `;
        }
        this.state.profiles = [];
        this.state.selectedProfiles.clear();
        this.updateNavigationButtonState();
    }

    /**
     * Alterna selección de perfil
     */
    toggleProfile(profileId) {
        if (this.state.selectedProfiles.has(profileId)) {
            this.state.selectedProfiles.delete(profileId);
        } else {
            this.state.selectedProfiles.add(profileId);
        }

        // Re-renderizar perfiles para actualizar estado visual
        this.renderProfiles(this.state.profiles);
        this.updateNavigationButtonState();
    }

    /**
     * Actualiza estado del botón de navegación
     */
    updateNavigationButtonState() {
        if (!this.elements.startNavigationBtn) return;

        // Obtener perfiles directamente desde los inputs del formulario
        const profileInputs = document.querySelectorAll('.profile-id-input');
        const hasValidProfiles = Array.from(profileInputs).some(input => input.value.trim() !== '');
        
        const adsPowerConnected = this.state.adsPowerConnected;
        const canStart = hasValidProfiles && adsPowerConnected && !this.state.navigationRunning;

        this.elements.startNavigationBtn.disabled = !canStart;

        if (this.elements.stopNavigationBtn) {
            this.elements.stopNavigationBtn.disabled = !this.state.navigationRunning;
        }
    }

    /**
     * Maneja inicio de navegación
     */
    async handleStartNavigation() {
        try {
            // Obtener datos del formulario
            const formData = new FormData(this.elements.navigationForm);
            
            // Obtener perfiles desde los inputs del formulario
            const profileInputs = document.querySelectorAll('.profile-id-input');
            const profileIds = [];
            
            profileInputs.forEach(input => {
                const profileId = input.value.trim();
                if (profileId) {
                    profileIds.push(profileId);
                }
            });

            // Validar que se ingresaron perfiles
            if (profileIds.length === 0) {
                this.app.showError('Debes ingresar al menos un ID de perfil');
                return;
            }

            const config = {
                profileIds: profileIds,
                targetCookies: parseInt(formData.get('targetCookies')) || 2500
            };

            console.log('🚀 Iniciando navegación con configuración:', config);

            this.setNavigationLoading(true);

            const result = await window.electronAPI.navigation.start(config);

            if (result.success) {
                this.state.navigationRunning = true;
                this.app.updateState('navigation.running', true);
                this.showProgressMonitor();
                this.app.showSuccess('Navegación iniciada correctamente');
                
                // Actualizar UI
                this.updateNavigationButtonState();
                
            } else {
                this.app.showError('Error iniciando navegación: ' + result.error);
            }

        } catch (error) {
            console.error('Error iniciando navegación:', error);
            this.app.showError('Error de conexión al iniciar navegación');
            
        } finally {
            this.setNavigationLoading(false);
        }
    }

    /**
     * Maneja detención de navegación
     */
    async handleStopNavigation() {
        try {
            const result = await window.electronAPI.navigation.stop();

            if (result.success) {
                this.state.navigationRunning = false;
                this.app.updateState('navigation.running', false);
                this.hideProgressMonitor();
                this.app.showInfo('Navegación detenida');
                
                // Actualizar UI
                this.updateNavigationButtonState();
                
            } else {
                this.app.showError('Error deteniendo navegación: ' + result.error);
            }

        } catch (error) {
            console.error('Error deteniendo navegación:', error);
            this.app.showError('Error de conexión al detener navegación');
        }
    }

    /**
     * Configura estado de loading en navegación
     */
    setNavigationLoading(loading) {
        if (!this.elements.startNavigationBtn) return;

        const spinner = this.elements.startNavigationBtn.querySelector('.btn-spinner');
        const text = this.elements.startNavigationBtn.querySelector('.btn-text');

        if (loading) {
            this.elements.startNavigationBtn.disabled = true;
            if (spinner) spinner.classList.remove('hidden');
            if (text) text.style.opacity = '0';
        } else {
            if (spinner) spinner.classList.add('hidden');
            if (text) text.style.opacity = '1';
            this.updateNavigationButtonState(); // Restaurar estado correcto
        }
    }

    /**
     * Muestra monitor de progreso
     */
    showProgressMonitor() {
        if (this.elements.progressMonitor) {
            this.elements.progressMonitor.classList.remove('hidden');
        }
    }

    /**
     * Oculta monitor de progreso
     */
    hideProgressMonitor() {
        if (this.elements.progressMonitor) {
            this.elements.progressMonitor.classList.add('hidden');
        }
    }

    /**
     * Renderiza estadísticas de base de datos
     */
    renderDatabaseStats(stats) {
        const statsElement = document.getElementById('database-stats');
        if (!statsElement || !stats) return;

        statsElement.innerHTML = `
            <div class="stat-card">
                <div class="stat-card-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2"/>
                    </svg>
                </div>
                <div class="stat-card-value">${this.app.formatNumber(stats.totalSites || 0)}</div>
                <div class="stat-card-label">Sitios Totales</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                        <path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="stat-card-value">${this.app.formatNumber(stats.activeSites || 0)}</div>
                <div class="stat-card-label">Sitios Activos</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M3 3v18h18M7 16l4-4 4 4 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="stat-card-value">${this.app.formatNumber(stats.totalVisits || 0)}</div>
                <div class="stat-card-label">Visitas Registradas</div>
            </div>
        `;
    }

    /**
     * Carga vista previa de base de datos
     */
    async loadDatabasePreview() {
        try {
            const result = await window.electronAPI.database.getSites(10);
            
            if (result.success) {
                this.renderSitesTable(result.sites);
            }

        } catch (error) {
            console.error('Error cargando vista previa de sitios:', error);
        }
    }

    /**
     * Renderiza tabla de sitios
     */
    renderSitesTable(sites) {
        const sitesElement = document.getElementById('sites-list');
        if (!sitesElement) return;

        if (!sites || sites.length === 0) {
            sitesElement.innerHTML = `
                <div class="empty-state">
                    <p>No hay sitios disponibles</p>
                </div>
            `;
            return;
        }

        const tableHtml = `
            <table class="table">
                <thead>
                    <tr>
                        <th>URL</th>
                        <th>Dominio</th>
                        <th>Categoría</th>
                        <th>Estado</th>
                        <th>Visitas</th>
                    </tr>
                </thead>
                <tbody>
                    ${sites.map(site => `
                        <tr>
                            <td>
                                <a href="#" onclick="window.electronAPI.system.openExternal('${site.url}')"
                                   style="color: var(--notion-blue); text-decoration: none;">
                                    ${site.url}
                                </a>
                            </td>
                            <td>${site.domain}</td>
                            <td>
                                <span class="badge badge-neutral">${site.category || 'General'}</span>
                            </td>
                            <td>
                                <span class="badge ${site.status === 'active' ? 'badge-success' : 'badge-neutral'}">
                                    ${site.status || 'Activo'}
                                </span>
                            </td>
                            <td>${site.visit_count || 0}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        sitesElement.innerHTML = tableHtml;
    }

    /**
     * Actualiza información del sistema
     */
    updateSystemInfo() {
        const platformInfo = this.app.getPlatformInfo();
        
        const platformElement = document.getElementById('platform');
        const electronVersionElement = document.getElementById('electron-version');
        
        if (platformElement) {
            platformElement.textContent = platformInfo.platform;
        }
        
        if (electronVersionElement) {
            electronVersionElement.textContent = platformInfo.version || 'N/A';
        }
    }

    /**
     * Carga reportes
     */
    async loadReports() {
        // Implementar carga de reportes cuando esté disponible
        console.log('Cargando reportes...');
    }

    /**
     * Maneja cambios de estado de la aplicación
     */
    handleStateChange(stateChange) {
        const { path, value } = stateChange;
        
        switch (path) {
            case 'navigation.running':
                this.state.navigationRunning = value;
                this.updateNavigationButtonState();
                break;
                
            case 'adspower.connected':
                this.state.adsPowerConnected = value;
                this.updateNavigationButtonState();
                break;
        }
    }

    /**
     * Maneja atajos de teclado
     */
    handleKeyboardShortcuts(event) {
        // Ctrl/Cmd + 1-6 para cambiar secciones
        if ((event.ctrlKey || event.metaKey) && event.key >= '1' && event.key <= '6') {
            event.preventDefault();
            const sections = ['automation', 'profiles', 'database', 'reports', 'settings', 'help'];
            const sectionIndex = parseInt(event.key) - 1;
            if (sections[sectionIndex]) {
                this.showSection(sections[sectionIndex]);
            }
        }

        // F5 para actualizar Ads Power
        if (event.key === 'F5' && this.currentSection === 'automation') {
            event.preventDefault();
            this.checkAdsPowerStatus();
        }
    }

    /**
     * Maneja logout
     */
    async handleLogout() {
        try {
            // Detener navegación si está corriendo
            if (this.state.navigationRunning) {
                await this.handleStopNavigation();
            }

            // Llamar logout en el proceso principal
            await window.electronAPI.auth.logout();
            
        } catch (error) {
            console.error('Error durante logout:', error);
            this.app.showError('Error cerrando sesión');
        }
    }

    /**
     * Limpia recursos del dashboard
     */
    destroy() {
        // Limpiar timers y listeners si es necesario
        this.initialized = false;
        this.state.selectedProfiles.clear();
        this.state.navigationRunning = false;
    }
}