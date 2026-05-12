import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerConfigHandlers } from '../../../src/electron/ipc/config.js';

/**
 * Verifica que el handler `config:update` NO sea registrado en ipcMain.
 * El handler fue eliminado porque no tiene call sites en el renderer —
 * mantenerlo sería superficie de ataque muerta.
 */
describe('config:update handler removal (Capability C)', () => {
    let mockIpcMain;
    let registeredChannels;

    beforeEach(() => {
        registeredChannels = [];
        mockIpcMain = {
            handle: vi.fn((channel, _fn) => {
                registeredChannels.push(channel);
            })
        };

        // Deps mínimos para que registerConfigHandlers no falle
        const mockDeps = {
            services: {
                configStore: {
                    getConfig: vi.fn(() => ({})),
                    getAdsPowerUrl: vi.fn(() => 'http://local.adspower.com:50325'),
                    getAuthConfig: vi.fn(() => ({ backendUrl: 'https://cookies-tool.hexzoragencia.online/' })),
                    set: vi.fn()
                },
                adsPowerManager: null,
                navigationController: null,
                authService: null,
                store: {}
            }
        };

        registerConfigHandlers(mockIpcMain, mockDeps);
    });

    it('C-S1: ipcMain.handle nunca se invocó con "config:update"', () => {
        expect(registeredChannels).not.toContain('config:update');
    });

    it('C-S2: los canales registrados son solo los esperados (sin config:update)', () => {
        const expectedChannels = [
            'config:get',
            'config:get-adspower-url',
            'config:set-adspower-url',
            'config:get-backend-url',
            'config:set-backend-url',
            'config:get-defaults'
        ];
        for (const channel of expectedChannels) {
            expect(registeredChannels).toContain(channel);
        }
        expect(registeredChannels).not.toContain('config:update');
    });
});
