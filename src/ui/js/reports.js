/**
 * Gestor de Reportes para Cookies Hexzor
 * Maneja la carga, filtrado y visualización de reportes de navegación
 */
class ReportsManager {
    constructor(app) {
        this.app = app;
        this.currentPage = 1;
        this.recordsPerPage = 10;
        this.currentFilters = {};
        this.isLoading = false;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    /**
     * Inicializa referencias a elementos del DOM
     */
    initializeElements() {
        this.elements = {
            // Filtros
            dateRangeSelect: document.getElementById('date-range'),
            generateReportBtn: document.getElementById('generate-report'),
            
            // Contenedor de reportes
            reportsContent: document.getElementById('reports-content'),
            
            // Elementos que se crearán dinámicamente
            summaryContainer: null,
            tableContainer: null,
            paginationContainer: null
        };
    }

    /**
     * Configura los event listeners
     */
    setupEventListeners() {
        // Generar reporte al hacer clic en el botón
        if (this.elements.generateReportBtn) {
            this.elements.generateReportBtn.addEventListener('click', () => {
                this.generateReport();
            });
        }

        // Cambio en filtro de fecha
        if (this.elements.dateRangeSelect) {
            this.elements.dateRangeSelect.addEventListener('change', () => {
                this.currentFilters.dateRange = this.elements.dateRangeSelect.value;
            });
        }
    }

    /**
     * Genera y muestra el reporte
     */
    async generateReport() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            // Obtener filtros actuales
            this.updateFilters();
            
            // Cargar datos y resumen en paralelo
            const [reportsResult, summaryResult] = await Promise.all([
                this.loadReports(1), // Cargar primera página
                this.loadSummary()
            ]);

            if (reportsResult.success && summaryResult.success) {
                this.renderReports(reportsResult, summaryResult);
            } else {
                this.showError('Error cargando reportes');
            }
            
        } catch (error) {
            console.error('Error generando reporte:', error);
            this.showError('Error generando reporte: ' + error.message);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Carga reportes desde el backend
     */
    async loadReports(page = 1) {
        this.currentPage = page;
        
        const options = {
            filters: this.currentFilters,
            page: page,
            limit: this.recordsPerPage
        };

        return await window.electronAPI.reports.get(options);
    }

    /**
     * Carga resumen estadístico
     */
    async loadSummary() {
        return await window.electronAPI.reports.summary(this.currentFilters);
    }

    /**
     * Actualiza filtros desde la UI
     */
    updateFilters() {
        this.currentFilters = {
            dateRange: this.elements.dateRangeSelect?.value || 'month'
        };
    }

    /**
     * Renderiza reportes completos
     */
    renderReports(reportsData, summaryData) {
        this.clearContent();
        
        const container = this.elements.reportsContent;
        
        // Crear estructura
        container.innerHTML = `
            <div class="reports-summary-container"></div>
            <div class="reports-table-container"></div>
            <div class="reports-pagination-container"></div>
        `;
        
        // Obtener referencias a los nuevos contenedores
        this.elements.summaryContainer = container.querySelector('.reports-summary-container');
        this.elements.tableContainer = container.querySelector('.reports-table-container');
        this.elements.paginationContainer = container.querySelector('.reports-pagination-container');
        
        // Renderizar cada sección
        this.renderSummary(summaryData.summary);
        this.renderTable(reportsData.data);
        this.renderPagination(reportsData.pagination);
    }

    /**
     * Renderiza resumen estadístico
     */
    renderSummary(summary) {
        this.elements.summaryContainer.innerHTML = `
            <div class="reports-summary">
                <h3>Resumen del Período</h3>
                <div class="summary-stats">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                                <path d="M8 12l2 2 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <div class="stat-value">${summary.total_sessions || 0}</div>
                        <div class="stat-label">Total Sesiones</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <div class="stat-value">${summary.success_rate || 0}%</div>
                        <div class="stat-label">Tasa de Éxito</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <rect x="3" y="11" width="18" height="10" rx="2" stroke="currentColor" stroke-width="2"/>
                                <circle cx="12" cy="16" r="1" fill="currentColor"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="2"/>
                            </svg>
                        </div>
                        <div class="stat-value">${this.app.formatNumber(summary.total_cookies || 0)}</div>
                        <div class="stat-label">Total Cookies</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
                                <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" stroke="currentColor" stroke-width="2"/>
                            </svg>
                        </div>
                        <div class="stat-value">${summary.avg_duration_formatted || '0s'}</div>
                        <div class="stat-label">Duración Promedio</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Renderiza tabla de reportes
     */
    renderTable(sessions) {
        if (!sessions || sessions.length === 0) {
            this.elements.tableContainer.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2"/>
                        <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2"/>
                        <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2"/>
                        <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    <h3>No hay sesiones registradas</h3>
                    <p>No se encontraron sesiones para los filtros seleccionados</p>
                </div>
            `;
            return;
        }

        const tableHtml = `
            <div class="reports-table-wrapper">
                <table class="reports-table">
                    <thead>
                        <tr>
                            <th>Perfil</th>
                            <th>Fecha Inicio</th>
                            <th>Duración</th>
                            <th>Cookies</th>
                            <th>Sitios</th>
                            <th>Éxito</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessions.map(session => this.renderTableRow(session)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        this.elements.tableContainer.innerHTML = tableHtml;
    }

    /**
     * Renderiza una fila de la tabla
     */
    renderTableRow(session) {
        const statusClass = `status-${session.status}`;
        const successPercentage = session.success_percentage || 0;
        const progressColor = successPercentage >= 80 ? 'success' : successPercentage >= 50 ? 'warning' : 'error';

        return `
            <tr>
                <td>
                    <div class="profile-cell">
                        <strong>${session.profile_id}</strong>
                    </div>
                </td>
                <td>
                    <div class="date-cell">
                        ${session.started_at_formatted}
                    </div>
                </td>
                <td>
                    <div class="duration-cell">
                        ${session.duration_formatted}
                    </div>
                </td>
                <td>
                    <div class="cookies-cell">
                        <span class="cookies-collected">${session.cookies_collected || 0}</span>
                        <span class="cookies-target">/ ${session.target_cookies || 0}</span>
                        <div class="progress-bar-mini">
                            <div class="progress-fill progress-${progressColor}" 
                                 style="width: ${Math.min(successPercentage, 100)}%"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="sites-count">${session.sites_visited || 0}</span>
                </td>
                <td>
                    <span class="success-percentage ${progressColor}">${successPercentage.toFixed(1)}%</span>
                </td>
                <td>
                    <span class="badge badge-${session.status}">${session.status_label}</span>
                </td>
            </tr>
        `;
    }

    /**
     * Renderiza controles de paginación
     */
    renderPagination(pagination) {
        if (pagination.totalPages <= 1) {
            this.elements.paginationContainer.innerHTML = '';
            return;
        }

        const { currentPage, totalPages, totalRecords, hasNextPage, hasPreviousPage } = pagination;

        this.elements.paginationContainer.innerHTML = `
            <div class="pagination-wrapper">
                <div class="pagination-info">
                    Mostrando ${Math.min(((currentPage - 1) * this.recordsPerPage) + 1, totalRecords)} - 
                    ${Math.min(currentPage * this.recordsPerPage, totalRecords)} de ${totalRecords} registros
                </div>
                <div class="pagination-controls">
                    <button class="btn btn-secondary btn-sm" ${!hasPreviousPage ? 'disabled' : ''} 
                            onclick="window.reportsManager.goToPage(${currentPage - 1})">
                        ← Anterior
                    </button>
                    
                    <div class="page-numbers">
                        ${this.generatePageNumbers(currentPage, totalPages)}
                    </div>
                    
                    <button class="btn btn-secondary btn-sm" ${!hasNextPage ? 'disabled' : ''} 
                            onclick="window.reportsManager.goToPage(${currentPage + 1})">
                        Siguiente →
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Genera números de página para la paginación
     */
    generatePageNumbers(currentPage, totalPages) {
        const maxVisible = 5;
        const pages = [];
        
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);
        
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }
        
        for (let i = start; i <= end; i++) {
            const isActive = i === currentPage;
            pages.push(`
                <button class="page-btn ${isActive ? 'active' : ''}" 
                        onclick="window.reportsManager.goToPage(${i})">
                    ${i}
                </button>
            `);
        }
        
        return pages.join('');
    }

    /**
     * Navega a una página específica
     */
    async goToPage(page) {
        if (this.isLoading || page < 1) return;
        
        this.showTableLoading();
        
        try {
            const result = await this.loadReports(page);
            if (result.success) {
                this.renderTable(result.data);
                this.renderPagination(result.pagination);
            }
        } catch (error) {
            console.error('Error cargando página:', error);
            this.showError('Error cargando página');
        }
    }

    /**
     * Muestra estado de carga
     */
    showLoading() {
        this.elements.reportsContent.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <h3>Generando reporte...</h3>
                <p>Procesando datos de sesiones</p>
            </div>
        `;
    }

    /**
     * Muestra estado de carga solo en la tabla
     */
    showTableLoading() {
        if (this.elements.tableContainer) {
            this.elements.tableContainer.innerHTML = `
                <div class="table-loading">
                    <div class="loading-spinner-sm"></div>
                    <span>Cargando...</span>
                </div>
            `;
        }
    }

    /**
     * Muestra estado de error
     */
    showError(message) {
        this.elements.reportsContent.innerHTML = `
            <div class="error-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                    <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" stroke-width="2"/>
                    <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" stroke-width="2"/>
                </svg>
                <h3>Error cargando reportes</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="window.reportsManager.generateReport()">
                    Reintentar
                </button>
            </div>
        `;
    }

    /**
     * Limpia el contenido de reportes
     */
    clearContent() {
        this.elements.reportsContent.innerHTML = '';
    }
}

// Hacer disponible globalmente para uso en eventos
window.ReportsManager = ReportsManager;