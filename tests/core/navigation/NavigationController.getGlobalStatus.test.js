import { describe, it, expect, beforeEach, vi } from 'vitest';
import NavigationController from '../../../src/core/navigation/NavigationController.js';

// Evitar que los módulos de navegación intenten cargar dependencias de red o Playwright
vi.mock('../../../src/core/navigation/CookieDetector.js', () => ({
    default: class CookieDetector {
        getCookieCount() { return Promise.resolve(0); }
    }
}));
vi.mock('../../../src/core/navigation/HumanBehaviorSimulator.js', () => ({
    default: class HumanBehaviorSimulator {}
}));

/**
 * Construye dependencias mínimas para instanciar NavigationController.
 * El constructor no invoca métodos en databaseManager ni en configStore,
 * por lo que un objeto vacío es suficiente.
 */
function makeController() {
    const databaseManager = {};
    const configStore = {};
    const adsPowerManager = {};
    return new NavigationController(databaseManager, configStore, adsPowerManager);
}

describe('NavigationController.getGlobalStatus()', () => {

    it('B-S6: el método existe y es callable (regression guard)', () => {
        const controller = makeController();
        expect(typeof controller.getGlobalStatus).toBe('function');
    });

    describe('B-S1: estado inicial — sin sesiones activas', () => {
        let controller;

        beforeEach(() => {
            controller = makeController();
        });

        it('devuelve activeSessions como array vacío', () => {
            const result = controller.getGlobalStatus();
            expect(Array.isArray(result.activeSessions)).toBe(true);
            expect(result.activeSessions).toHaveLength(0);
        });

        it('devuelve isRunning false cuando no hay sesiones', () => {
            const result = controller.getGlobalStatus();
            expect(result.isRunning).toBe(false);
        });

        it('devuelve globalStats con totalSessions 0 y startTime null', () => {
            const result = controller.getGlobalStatus();
            expect(result.globalStats.totalSessions).toBe(0);
            expect(result.globalStats.startTime).toBeNull();
        });

        it('devuelve todos los campos de globalStats esperados', () => {
            const result = controller.getGlobalStatus();
            expect(result.globalStats).toHaveProperty('totalSessions');
            expect(result.globalStats).toHaveProperty('completedSessions');
            expect(result.globalStats).toHaveProperty('totalCookiesCollected');
            expect(result.globalStats).toHaveProperty('totalSitesVisited');
            expect(result.globalStats).toHaveProperty('errors');
            expect(result.globalStats).toHaveProperty('startTime');
        });
    });

    describe('B-S2: con sesiones activas inyectadas', () => {
        let controller;

        beforeEach(() => {
            controller = makeController();
            // Inyectar una sesión directamente en el Map interno
            controller.activeSessions.set('profile-1', {
                sessionId: 'sess-abc',
                cookiesCollected: 150,
                targetCookies: 2500,
                sitesVisited: 3,
                status: 'running'
            });
        });

        it('devuelve isRunning true cuando hay sesiones activas', () => {
            const result = controller.getGlobalStatus();
            expect(result.isRunning).toBe(true);
        });

        it('devuelve activeSessions con length 1', () => {
            const result = controller.getGlobalStatus();
            expect(result.activeSessions).toHaveLength(1);
        });

        it('los elementos de activeSessions tienen la forma correcta', () => {
            const result = controller.getGlobalStatus();
            const session = result.activeSessions[0];
            expect(session).toMatchObject({
                profileId: 'profile-1',
                sessionId: 'sess-abc',
                cookiesCollected: 150,
                targetCookies: 2500,
                sitesVisited: 3,
                status: 'running'
            });
        });
    });

    describe('B-S3: shallow copy de globalStats — aislamiento de mutaciones', () => {
        it('mutar el retorno no afecta el estado interno del controller', () => {
            const controller = makeController();
            controller.globalStats.errors = 0;

            const result = controller.getGlobalStatus();
            // Mutar el retorno
            result.globalStats.errors = 99;

            // El estado interno no debe haberse corrompido
            expect(controller.globalStats.errors).toBe(0);
        });

        it('dos llamadas consecutivas retornan objetos independientes', () => {
            const controller = makeController();
            const result1 = controller.getGlobalStatus();
            const result2 = controller.getGlobalStatus();

            result1.globalStats.errors = 77;
            expect(result2.globalStats.errors).toBe(0);
        });
    });

    it('B-5: el método es síncrono (no retorna Promise)', () => {
        const controller = makeController();
        const result = controller.getGlobalStatus();
        // Si fuera async, result sería una Promise
        expect(result).not.toBeInstanceOf(Promise);
        expect(typeof result).toBe('object');
    });
});
