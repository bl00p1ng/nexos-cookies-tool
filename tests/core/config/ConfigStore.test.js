import { describe, it, expect, beforeEach } from 'vitest';
import ConfigStore from '../../../src/core/config/ConfigStore.js';
import InMemoryStore from '../../../src/core/config/InMemoryStore.js';
import {
    DEFAULT_APP_CONFIG,
    LEGACY_AUTH_BACKEND_URLS
} from '../../../src/core/config/defaults.js';

function makeStore(initialAppConfig = DEFAULT_APP_CONFIG) {
    return new InMemoryStore({ appConfig: initialAppConfig });
}

describe('ConfigStore', () => {
    describe('constructor', () => {
        it('lanza si el store inyectado no tiene get/set', () => {
            expect(() => new ConfigStore({})).toThrow(/get\/set/);
            expect(() => new ConfigStore(null)).toThrow();
        });

        it('acepta un store válido', () => {
            expect(() => new ConfigStore(makeStore())).not.toThrow();
        });
    });

    describe('getConfig / getSection', () => {
        it('getConfig devuelve la config completa', () => {
            const cs = new ConfigStore(makeStore());
            const config = cs.getConfig();
            expect(config.auth).toBeDefined();
            expect(config.adspower).toBeDefined();
            expect(config.navigation).toBeDefined();
        });

        it('getSection devuelve una sección por nombre', () => {
            const cs = new ConfigStore(makeStore());
            expect(cs.getSection('auth').backendUrl).toBe(DEFAULT_APP_CONFIG.auth.backendUrl);
        });

        it('getSection devuelve default del DEFAULT_APP_CONFIG cuando la sección no existe en el store', () => {
            const cs = new ConfigStore(new InMemoryStore({ appConfig: {} }));
            expect(cs.getSection('navigation')).toEqual(DEFAULT_APP_CONFIG.navigation);
        });

        it('getSection devuelve {} para sección inexistente sin default', () => {
            const cs = new ConfigStore(new InMemoryStore({ appConfig: {} }));
            expect(cs.getSection('xyz')).toEqual({});
        });
    });

    describe('set / accessors específicos', () => {
        it('set persiste un valor bajo appConfig.<path>', () => {
            const store = makeStore();
            const cs = new ConfigStore(store);
            cs.set('adspower.baseUrl', 'http://custom:9000');
            expect(store.get('appConfig.adspower.baseUrl')).toBe('http://custom:9000');
        });

        it('getAdsPowerUrl lee de appConfig.adspower.baseUrl', () => {
            const cs = new ConfigStore(makeStore());
            cs.set('adspower.baseUrl', 'http://x:1');
            expect(cs.getAdsPowerUrl()).toBe('http://x:1');
        });

        it('getAuthConfig devuelve la sección auth', () => {
            const cs = new ConfigStore(makeStore());
            expect(cs.getAuthConfig().backendUrl).toBe(DEFAULT_APP_CONFIG.auth.backendUrl);
        });

        it('getDefaultCookieTarget lee de appConfig.navigation.defaultCookieTarget', () => {
            const cs = new ConfigStore(makeStore());
            expect(cs.getDefaultCookieTarget()).toBe(DEFAULT_APP_CONFIG.navigation.defaultCookieTarget);
        });

        it('getRateLimitConfig devuelve el subobjeto rateLimit', () => {
            const cs = new ConfigStore(makeStore());
            expect(cs.getRateLimitConfig()).toEqual(DEFAULT_APP_CONFIG.adspower.rateLimit);
        });
    });

    describe('updateRateLimitConfig', () => {
        it('fusiona con la configuración actual sin borrar otras claves', () => {
            const cs = new ConfigStore(makeStore());
            cs.updateRateLimitConfig({ requestsPerSecond: 5 });
            const rl = cs.getRateLimitConfig();
            expect(rl.requestsPerSecond).toBe(5);
            // El resto se preserva
            expect(rl.retryDelay).toBe(DEFAULT_APP_CONFIG.adspower.rateLimit.retryDelay);
        });

        it('preserva otras claves de la sección adspower', () => {
            const cs = new ConfigStore(makeStore());
            cs.updateRateLimitConfig({ debug: true });
            expect(cs.getAdsPowerUrl()).toBe(DEFAULT_APP_CONFIG.adspower.baseUrl);
        });
    });

    describe('purgeLegacyBackendUrl', () => {
        it('reemplaza la URL del backend si está en LEGACY_AUTH_BACKEND_URLS', () => {
            const legacy = LEGACY_AUTH_BACKEND_URLS[0];
            const cs = new ConfigStore(makeStore({
                ...DEFAULT_APP_CONFIG,
                auth: { ...DEFAULT_APP_CONFIG.auth, backendUrl: legacy }
            }));
            const changed = cs.purgeLegacyBackendUrl();
            expect(changed).toBe(true);
            expect(cs.getAuthConfig().backendUrl).toBe(DEFAULT_APP_CONFIG.auth.backendUrl);
        });

        it('no hace nada si la URL del backend no es legacy', () => {
            const cs = new ConfigStore(makeStore({
                ...DEFAULT_APP_CONFIG,
                auth: { ...DEFAULT_APP_CONFIG.auth, backendUrl: 'https://custom-backend.example/' }
            }));
            const changed = cs.purgeLegacyBackendUrl();
            expect(changed).toBe(false);
            expect(cs.getAuthConfig().backendUrl).toBe('https://custom-backend.example/');
        });

        it('no hace nada si auth.backendUrl es vacío/null', () => {
            const cs = new ConfigStore(makeStore({
                ...DEFAULT_APP_CONFIG,
                auth: { ...DEFAULT_APP_CONFIG.auth, backendUrl: '' }
            }));
            expect(cs.purgeLegacyBackendUrl()).toBe(false);
        });
    });

    describe('loadConfig / saveConfig (compat shims)', () => {
        it('loadConfig es no-op y no lanza', async () => {
            const cs = new ConfigStore(makeStore());
            await expect(cs.loadConfig()).resolves.toBeUndefined();
        });

        it('saveConfig es no-op y no lanza', async () => {
            const cs = new ConfigStore(makeStore());
            await expect(cs.saveConfig()).resolves.toBeUndefined();
        });
    });
});
