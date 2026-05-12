import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerNavigationHandlers } from '../../../src/electron/ipc/navigation.js';

/**
 * Construye un ipcMain falso que captura todos los handlers
 * registrados con ipcMain.handle(channel, fn).
 * Expone los handlers por canal para que el test pueda invocarlos.
 */
function makeFakeIpcMain() {
    const handlers = new Map();
    return {
        handle: vi.fn((channel, fn) => {
            handlers.set(channel, fn);
        }),
        on: vi.fn(),
        _getHandler: (channel) => handlers.get(channel),
        _handlers: handlers
    };
}

/**
 * Construye las dependencias mínimas para registerNavigationHandlers.
 * El getMainWindow devuelve null — los tests de get-status no usan la ventana.
 */
function makeDeps(navigationController = null) {
    return {
        services: {
            navigationController,
            adsPowerManager: null
        },
        getMainWindow: () => null
    };
}

const FAKE_STATUS = {
    activeSessions: [
        {
            profileId: 'prof-1',
            sessionId: 'sess-xyz',
            cookiesCollected: 300,
            targetCookies: 2500,
            sitesVisited: 5,
            status: 'running'
        }
    ],
    globalStats: {
        totalSessions: 1,
        completedSessions: 0,
        totalCookiesCollected: 300,
        totalSitesVisited: 5,
        errors: 0,
        startTime: new Date('2026-01-01T00:00:00Z')
    },
    isRunning: true
};

describe('IPC handler navigation:get-status', () => {
    let ipcMain;

    beforeEach(() => {
        ipcMain = makeFakeIpcMain();
    });

    describe('B-S4: controller disponible', () => {
        it('responde con success true y data con la forma correcta', async () => {
            const fakeController = {
                getGlobalStatus: vi.fn().mockReturnValue(FAKE_STATUS),
                on: vi.fn(),
                emit: vi.fn()
            };
            const deps = makeDeps(fakeController);

            registerNavigationHandlers(ipcMain, deps);

            const handler = ipcMain._getHandler('navigation:get-status');
            expect(handler).toBeDefined();

            const result = await handler();
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
        });

        it('data.activeSessions tiene length 1 cuando hay 1 sesión activa', async () => {
            const fakeController = {
                getGlobalStatus: vi.fn().mockReturnValue(FAKE_STATUS),
                on: vi.fn(),
                emit: vi.fn()
            };
            const deps = makeDeps(fakeController);

            registerNavigationHandlers(ipcMain, deps);

            const handler = ipcMain._getHandler('navigation:get-status');
            const result = await handler();

            expect(result.data.activeSessions).toHaveLength(1);
        });

        it('data contiene activeSessions, globalStats e isRunning', async () => {
            const fakeController = {
                getGlobalStatus: vi.fn().mockReturnValue(FAKE_STATUS),
                on: vi.fn(),
                emit: vi.fn()
            };
            const deps = makeDeps(fakeController);

            registerNavigationHandlers(ipcMain, deps);

            const handler = ipcMain._getHandler('navigation:get-status');
            const result = await handler();

            expect(result.data).toHaveProperty('activeSessions');
            expect(result.data).toHaveProperty('globalStats');
            expect(result.data).toHaveProperty('isRunning');
            expect(result.data.isRunning).toBe(true);
        });
    });

    describe('B-S5: controller no disponible', () => {
        it('responde con success false cuando navigationController es null', async () => {
            const deps = makeDeps(null);

            registerNavigationHandlers(ipcMain, deps);

            const handler = ipcMain._getHandler('navigation:get-status');
            expect(handler).toBeDefined();

            const result = await handler();
            expect(result.success).toBe(false);
        });

        it('incluye mensaje de error cuando controller es null', async () => {
            const deps = makeDeps(null);

            registerNavigationHandlers(ipcMain, deps);

            const handler = ipcMain._getHandler('navigation:get-status');
            const result = await handler();

            expect(result.error).toBe('NavigationController no está disponible');
        });

        it('responde con success false cuando navigationController es undefined', async () => {
            const deps = makeDeps(undefined);

            registerNavigationHandlers(ipcMain, deps);

            const handler = ipcMain._getHandler('navigation:get-status');
            const result = await handler();

            expect(result.success).toBe(false);
        });
    });
});
