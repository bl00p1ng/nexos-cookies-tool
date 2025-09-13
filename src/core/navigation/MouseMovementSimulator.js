/**
 * Simulador de movimientos naturales del mouse
 * Implementa trayectorias curvas de Bezier y patrones humanos realistas
 */
class MouseMovementSimulator {
    constructor() {
        this.currentPosition = { x: 0, y: 0 };
        this.movementHistory = [];
        this.mousePersonality = this.generateMousePersonality();
    }

    /**
     * Realiza movimientos iniciales del mouse al cargar una página
     * @param {Object} page - Página de Playwright
     */
    async performInitialMovements(page) {
        try {
            // Obtener dimensiones de la ventana
            const viewport = await page.viewportSize();
            
            // Posición inicial aleatoria
            const startX = Math.random() * viewport.width;
            const startY = Math.random() * viewport.height;
            
            await page.mouse.move(startX, startY);
            this.updatePosition(startX, startY);
            
            // Pequeño movimiento aleatorio después de 1-3 segundos
            await this.sleep(this.randomBetween(1000, 3000));
            
            const deltaX = (Math.random() - 0.5) * 100;
            const deltaY = (Math.random() - 0.5) * 100;
            
            await this.moveNaturally(page, startX + deltaX, startY + deltaY);
            
        } catch (error) {
            console.warn('⚠️ Error en movimientos iniciales del mouse:', error.message);
        }
    }

    /**
     * Mueve el mouse de forma natural hacia un elemento
     * @param {Object} page - Página de Playwright
     * @param {Object} element - Elemento destino
     */
    async moveToElementNaturally(page, element) {
        try {
            const box = await element.boundingBox();
            if (!box) {
                console.warn('⚠️ No se pudo obtener boundingBox del elemento');
                return;
            }

            // Calcular punto objetivo dentro del elemento
            const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
            const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

            // Mover naturalmente hacia el objetivo
            await this.moveNaturally(page, targetX, targetY);
            
        } catch (error) {
            console.warn('⚠️ Error moviendo mouse hacia elemento:', error.message);
        }
    }

    /**
     * Realiza movimiento natural del mouse con curva de Bezier
     * @param {Object} page - Página de Playwright
     * @param {number} targetX - Coordenada X destino
     * @param {number} targetY - Coordenada Y destino
     */
    async moveNaturally(page, targetX, targetY) {
        const start = { ...this.currentPosition };
        const end = { x: targetX, y: targetY };
        
        // Calcular distancia para determinar velocidad
        const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        
        // Generar trayectoria con curva de Bezier
        const path = this.generateBezierPath(start, end, this.calculateSteps(distance));
        
        // Ejecutar movimiento con velocidad variable
        for (let i = 0; i < path.length; i++) {
            const point = path[i];
            await page.mouse.move(point.x, point.y);
            
            // Velocidad variable basada en personalidad del mouse
            const delay = this.calculateMovementDelay(i, path.length, distance);
            await this.sleep(delay);
        }
        
        this.updatePosition(targetX, targetY);
        this.recordMovement(start, end, distance);
    }

    /**
     * Genera trayectoria de Bezier para movimiento natural
     * @param {Object} start - Punto inicial {x, y}
     * @param {Object} end - Punto final {x, y}
     * @param {number} steps - Número de pasos
     * @returns {Array} Array de puntos de la trayectoria
     */
    generateBezierPath(start, end, steps = 20) {
        const path = [];
        
        // Generar puntos de control para curva natural
        const control1 = {
            x: start.x + (end.x - start.x) * 0.25 + (Math.random() - 0.5) * 100,
            y: start.y + (end.y - start.y) * 0.25 + (Math.random() - 0.5) * 100
        };
        
        const control2 = {
            x: start.x + (end.x - start.x) * 0.75 + (Math.random() - 0.5) * 100,
            y: start.y + (end.y - start.y) * 0.75 + (Math.random() - 0.5) * 100
        };
        
        // Generar puntos de la curva cúbica de Bezier
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const point = this.cubicBezier(start, control1, control2, end, t);
            
            // Agregar pequeña variación para naturalidad
            point.x += (Math.random() - 0.5) * 2;
            point.y += (Math.random() - 0.5) * 2;
            
            path.push(point);
        }
        
        return path;
    }

    /**
     * Calcula punto en curva cúbica de Bezier
     * @param {Object} p0 - Punto inicial
     * @param {Object} p1 - Primer punto de control
     * @param {Object} p2 - Segundo punto de control
     * @param {Object} p3 - Punto final
     * @param {number} t - Parámetro t (0-1)
     * @returns {Object} Punto calculado {x, y}
     */
    cubicBezier(p0, p1, p2, p3, t) {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        
        return {
            x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
            y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
        };
    }

    /**
     * Realiza movimiento aleatorio pequeño
     * @param {Object} page - Página de Playwright
     */
    async performRandomMovement(page) {
        const viewport = await page.viewportSize();
        
        // Movimiento pequeño desde posición actual
        const deltaX = (Math.random() - 0.5) * 50;
        const deltaY = (Math.random() - 0.5) * 50;
        
        let newX = this.currentPosition.x + deltaX;
        let newY = this.currentPosition.y + deltaY;
        
        // Mantener dentro de los límites
        newX = Math.max(10, Math.min(viewport.width - 10, newX));
        newY = Math.max(10, Math.min(viewport.height - 10, newY));
        
        await this.moveNaturally(page, newX, newY);
    }

    /**
     * Movimiento específico al cargar página
     * @param {Object} page - Página de Playwright
     */
    async performPageLoadMovement(page) {
        // Simular que el usuario mueve el mouse después de cargar página
        await this.sleep(this.randomBetween(500, 1500));
        
        const viewport = await page.viewportSize();
        const targetX = viewport.width * (0.2 + Math.random() * 0.6);
        const targetY = viewport.height * (0.3 + Math.random() * 0.4);
        
        await this.moveNaturally(page, targetX, targetY);
    }

    /**
     * Calcula número de pasos basado en distancia
     * @param {number} distance - Distancia del movimiento
     * @returns {number} Número de pasos
     */
    calculateSteps(distance) {
        // Más pasos para movimientos largos, menos para cortos
        const baseSteps = Math.min(40, Math.max(10, distance / 10));
        
        // Agregar variación basada en personalidad
        const personalityVariation = this.mousePersonality.smoothness * 10;
        
        return Math.round(baseSteps + personalityVariation);
    }

    /**
     * Calcula delay entre pasos del movimiento
     * @param {number} step - Paso actual
     * @param {number} totalSteps - Total de pasos
     * @param {number} distance - Distancia total
     * @returns {number} Delay en millisegundos
     */
    calculateMovementDelay(step, totalSteps, distance) {
        // Velocidad base dependiente de distancia
        let baseDelay = Math.min(25, Math.max(5, distance / 100));
        
        // Curva de velocidad: inicio lento, rápido en medio, lento al final
        const progress = step / totalSteps;
        const speedCurve = Math.sin(progress * Math.PI); // Curva sinusoidal
        
        baseDelay = baseDelay * (2 - speedCurve); // Invierte la curva
        
        // Ajustes por personalidad del mouse
        baseDelay *= this.mousePersonality.speed;
        
        // Pequeña variación aleatoria
        baseDelay += (Math.random() - 0.5) * 3;
        
        return Math.max(1, Math.round(baseDelay));
    }

    /**
     * Genera personalidad única del mouse para consistencia
     * @returns {Object} Personalidad del mouse
     */
    generateMousePersonality() {
        return {
            speed: 0.8 + Math.random() * 0.4,      // 0.8 - 1.2 multiplier
            smoothness: Math.random() * 2 - 1,     // -1 a 1 (rough to smooth)
            precision: 0.7 + Math.random() * 0.3,  // 0.7 - 1.0
            restlessness: Math.random()             // 0 - 1 (calm to fidgety)
        };
    }

    /**
     * Actualiza posición actual del mouse
     * @param {number} x - Coordenada X
     * @param {number} y - Coordenada Y
     */
    updatePosition(x, y) {
        this.currentPosition = { x, y };
        
        // Actualizar en el contexto de la página también
        if (typeof window !== 'undefined') {
            window.mouseX = x;
            window.mouseY = y;
        }
    }

    /**
     * Registra movimiento en historial
     * @param {Object} start - Punto inicial
     * @param {Object} end - Punto final
     * @param {number} distance - Distancia del movimiento
     */
    recordMovement(start, end, distance) {
        this.movementHistory.push({
            timestamp: Date.now(),
            start,
            end,
            distance,
            duration: this.calculateMovementDuration(distance)
        });
        
        // Mantener solo los últimos 20 movimientos
        if (this.movementHistory.length > 20) {
            this.movementHistory.shift();
        }
    }

    /**
     * Calcula duración estimada del movimiento
     * @param {number} distance - Distancia del movimiento
     * @returns {number} Duración en millisegundos
     */
    calculateMovementDuration(distance) {
        // Duración basada en distancia y personalidad
        const baseDuration = distance / 2; // ~2 pixels per ms
        return baseDuration * this.mousePersonality.speed;
    }

    /**
     * Obtiene estadísticas del comportamiento del mouse
     * @returns {Object} Estadísticas
     */
    getMovementStats() {
        if (this.movementHistory.length === 0) return null;
        
        const totalDistance = this.movementHistory.reduce((sum, move) => sum + move.distance, 0);
        const avgDistance = totalDistance / this.movementHistory.length;
        const avgSpeed = this.movementHistory.reduce((sum, move) => 
            sum + (move.distance / move.duration), 0) / this.movementHistory.length;
        
        return {
            totalMovements: this.movementHistory.length,
            totalDistance,
            averageDistance: avgDistance,
            averageSpeed: avgSpeed,
            personality: this.mousePersonality
        };
    }

    /**
     * Genera número aleatorio entre min y max
     * @param {number} min - Valor mínimo
     * @param {number} max - Valor máximo
     * @returns {number} Número aleatorio
     */
    randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Utilidad para pausas
     * @param {number} ms - Millisegundos a esperar
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default MouseMovementSimulator;