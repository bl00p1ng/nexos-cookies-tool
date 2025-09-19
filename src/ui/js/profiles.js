/**
 * Gestor de formulario dinámico de perfiles de Ads Power
 */
class ProfileInputManager {
    constructor() {
        this.profiles = [];
        this.nextProfileNumber = 1;
        this.maxProfiles = 20; // Límite máximo de perfiles
        
        this.elements = {
            container: document.getElementById('profile-inputs'),
            addBtn: document.getElementById('add-profile-btn'),
            clearBtn: document.getElementById('clear-profiles-btn'),
            profileCount: document.getElementById('profile-count'),
            simultaneousCount: document.getElementById('simultaneous-count')
        };
    }

    /**
     * Inicializa el gestor de perfiles
     */
    initialize() {
        // Verificar que los elementos existen
        if (!this.elements.container) {
            console.error('ProfileInputManager: Contenedor de perfiles no encontrado');
            return false;
        }

        this.setupEventListeners();
        this.addInitialProfile();
        this.updateSummary();
        return true;
    }

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Botón agregar perfil
        this.elements.addBtn.addEventListener('click', () => {
            this.addProfile();
        });

        // Botón limpiar todos
        this.elements.clearBtn.addEventListener('click', () => {
            this.clearAllProfiles();
        });
    }

    /**
     * Agrega un perfil inicial al cargar
     */
    addInitialProfile() {
        this.addProfile('', true);
    }

    /**
     * Agrega un nuevo input de perfil
     */
    addProfile(value = '', isInitial = false) {
        if (this.profiles.length >= this.maxProfiles && !isInitial) {
            this.showError(`Máximo ${this.maxProfiles} perfiles permitidos`);
            return;
        }

        const profileId = `profile-${Date.now()}-${this.nextProfileNumber}`;
        const profileNumber = this.nextProfileNumber++;

        const profileItem = document.createElement('div');
        profileItem.className = 'profile-input-item';
        profileItem.dataset.profileId = profileId;

        profileItem.innerHTML = `
            <div class="profile-number">${profileNumber}</div>
            <input 
                type="text" 
                class="profile-id-input" 
                placeholder="Ej: k1a2b3c4"
                value="${value}"
                data-profile-number="${profileNumber}"
            >
            <button type="button" class="remove-profile-btn" title="Eliminar perfil">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        `;

        this.elements.container.appendChild(profileItem);

        // Event listeners para el nuevo perfil
        const input = profileItem.querySelector('.profile-id-input');
        const removeBtn = profileItem.querySelector('.remove-profile-btn');

        // Validación en tiempo real
        input.addEventListener('input', (e) => {
            this.validateProfileId(e.target);
            this.updateSummary();
        });

        // Eliminar perfil
        removeBtn.addEventListener('click', () => {
            this.removeProfile(profileId);
        });

        // Enter para agregar nuevo perfil
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && input.value.trim() && this.isValidProfileId(input.value.trim())) {
                this.addProfile();
                // Focus en el nuevo input
                setTimeout(() => {
                    const newInput = this.elements.container.lastElementChild.querySelector('.profile-id-input');
                    newInput.focus();
                }, 100);
            }
        });

        // Agregar a la lista
        this.profiles.push({
            id: profileId,
            number: profileNumber,
            element: profileItem,
            input: input
        });

        // Focus en el nuevo input
        if (!isInitial) {
            setTimeout(() => input.focus(), 100);
        }

        this.updateSummary();
        this.updateAddButtonState();
    }

    /**
     * Elimina un perfil específico
     */
    removeProfile(profileId) {
        const profileIndex = this.profiles.findIndex(p => p.id === profileId);
        if (profileIndex === -1) return;

        const profile = this.profiles[profileIndex];
        
        // Verificar que no sea el último perfil
        if (this.profiles.length === 1) {
            this.showError('Debe mantener al menos un perfil');
            return;
        }

        // Animación de salida
        profile.element.classList.add('removing');
        
        setTimeout(() => {
            profile.element.remove();
            this.profiles.splice(profileIndex, 1);
            this.renumberProfiles();
            this.updateSummary();
            this.updateAddButtonState();
        }, 200);
    }

    /**
     * Limpia todos los perfiles y agrega uno inicial
     */
    clearAllProfiles() {
        if (!confirm('¿Estás seguro de que quieres eliminar todos los perfiles?')) {
            return;
        }

        this.elements.container.innerHTML = '';
        this.profiles = [];
        this.nextProfileNumber = 1;
        
        this.addInitialProfile();
        this.updateSummary();
        this.updateAddButtonState();
    }

    /**
     * Renumera los perfiles después de eliminar uno
     */
    renumberProfiles() {
        this.profiles.forEach((profile, index) => {
            const newNumber = index + 1;
            profile.number = newNumber;
            profile.input.dataset.profileNumber = newNumber;
            
            const numberElement = profile.element.querySelector('.profile-number');
            numberElement.textContent = newNumber;
        });
        
        this.nextProfileNumber = this.profiles.length + 1;
    }

    /**
     * Valida un ID de perfil en tiempo real
     */
    validateProfileId(input) {
        const value = input.value.trim();
        
        // Limpiar clases previas
        input.classList.remove('valid', 'invalid');
        input.parentElement.classList.remove('error');
        
        if (!value) return; // No validar campos vacíos
        
        if (this.isValidProfileId(value)) {
            // Verificar duplicados
            const isDuplicate = this.profiles.some(p => 
                p.input !== input && p.input.value.trim() === value
            );
            
            if (isDuplicate) {
                input.classList.add('invalid');
                input.parentElement.classList.add('error');
                input.title = 'ID duplicado';
            } else {
                input.classList.add('valid');
                input.title = 'ID válido';
            }
        } else {
            input.classList.add('invalid');
            input.parentElement.classList.add('error');
            input.title = 'ID inválido - debe contener solo letras, números y guiones';
        }
    }

    /**
     * Verifica si un ID de perfil es válido
     */
    isValidProfileId(value) {
        // Acepta letras, números, guiones y guiones bajos
        const profileIdRegex = /^[a-zA-Z0-9_-]+$/;
        return profileIdRegex.test(value) && value.length >= 3 && value.length <= 50;
    }

    /**
     * Obtiene todos los IDs de perfiles válidos
     */
    getValidProfileIds() {
        return this.profiles
            .map(p => p.input.value.trim())
            .filter(value => value && this.isValidProfileId(value))
            .filter((value, index, array) => array.indexOf(value) === index); // Eliminar duplicados
    }

    /**
     * Actualiza el resumen de perfiles
     */
    updateSummary() {
        const validProfiles = this.getValidProfileIds();
        this.elements.profileCount.textContent = validProfiles.length;
        
        // Actualizar color según validez
        if (validProfiles.length === 0) {
            this.elements.profileCount.style.color = 'var(--nexos-error)';
        } else {
            this.elements.profileCount.style.color = 'var(--nexos-success)';
        }
    }

    /**
     * Actualiza el estado del botón agregar
     */
    updateAddButtonState() {
        if (this.profiles.length >= this.maxProfiles) {
            this.elements.addBtn.disabled = true;
            this.elements.addBtn.title = `Máximo ${this.maxProfiles} perfiles`;
        } else {
            this.elements.addBtn.disabled = false;
            this.elements.addBtn.title = 'Agregar nuevo perfil';
        }
    }

    /**
     * Muestra un mensaje de error
     */
    showError(message) {
        // Implementar según el sistema de notificaciones de la app
        console.error(message);
        
        // Crear notificación temporal
        const notification = document.createElement('div');
        notification.className = 'profile-error-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--nexos-error);
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 1000;
            animation: slideInRight 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * Carga perfiles desde configuración guardada
     */
    loadProfiles(profileIds = []) {
        this.clearAllProfiles();
        
        if (profileIds.length === 0) {
            this.addInitialProfile();
            return;
        }
        
        profileIds.forEach((id, index) => {
            if (index === 0) {
                // Reemplazar el primer perfil
                const firstInput = this.profiles[0].input;
                firstInput.value = id;
                this.validateProfileId(firstInput);
            } else {
                this.addProfile(id);
            }
        });
        
        this.updateSummary();
    }

    /**
     * Resetea el formulario
     */
    reset() {
        this.clearAllProfiles();
    }
}