import { describe, it, expect, beforeEach, vi } from 'vitest';
import InMemoryStore from '../../src/core/config/InMemoryStore.js';
import {
    checkExistingAuth,
    clearStoredAuth,
    handleMenuLogout
} from '../../src/electron/authBootstrap.js';
import { setLogLevel } from '../../src/core/utils/Logger.js';

setLogLevel('silent');

function makeFreshState() {
    const store = new InMemoryStore({
        authToken: 'tok-123',
        lastEmail: 'user@test.dev',
        subscriptionEnd: '2099-01-01T00:00:00Z',
        customerName: 'Usuario Test',
        customerId: 'cust-1',
        device_fingerprint: 'fp-abc'
    });
    const authState = {
        isAuthenticated: false,
        userToken: null,
        userData: null
    };
    const sentMessages = [];
    const mainWindow = {
        isDestroyed: () => false,
        webContents: {
            send: (channel, payload) => sentMessages.push({ channel, payload })
        }
    };
    return { store, authState, sentMessages, mainWindow };
}

function makeDeps({ store, authState, mainWindow, validateTokenImpl }) {
    return {
        store,
        authState,
        services: {
            authService: {
                validateToken: vi.fn().mockImplementation(validateTokenImpl),
                logout: vi.fn().mockResolvedValue({ success: true })
            }
        },
        getMainWindow: () => mainWindow
    };
}

describe('checkExistingAuth', () => {
    let env;

    beforeEach(() => {
        env = makeFreshState();
    });

    it('sin token guardado → muestra login, no llama validateToken', async () => {
        env.store.delete('authToken');
        env.store.delete('lastEmail');
        const deps = makeDeps({ ...env, validateTokenImpl: async () => { throw new Error('no debería llamarse'); } });

        await checkExistingAuth(deps);

        expect(deps.services.authService.validateToken).not.toHaveBeenCalled();
        expect(env.sentMessages).toEqual([{ channel: 'auth:show-login', payload: undefined }]);
        expect(env.authState.isAuthenticated).toBe(false);
    });

    it('token válido según backend → restaura sesión y emite auth:authenticated', async () => {
        const deps = makeDeps({ ...env, validateTokenImpl: async () => ({ success: true }) });

        await checkExistingAuth(deps);

        expect(deps.services.authService.validateToken).toHaveBeenCalledWith('tok-123', 'user@test.dev');
        expect(env.authState.isAuthenticated).toBe(true);
        expect(env.authState.userToken).toBe('tok-123');
        expect(env.authState.userData).toMatchObject({
            email: 'user@test.dev',
            customerName: 'Usuario Test',
            customerId: 'cust-1'
        });
        expect(env.sentMessages).toHaveLength(1);
        expect(env.sentMessages[0].channel).toBe('auth:authenticated');
        // Token NO se borró del store
        expect(env.store.get('authToken')).toBe('tok-123');
    });

    it('INVALID_TOKEN → limpia store, resetea authState, manda login', async () => {
        const deps = makeDeps({
            ...env,
            validateTokenImpl: async () => ({ success: false, code: 'INVALID_TOKEN', error: 'Token expirado o inválido' })
        });

        await checkExistingAuth(deps);

        expect(env.store.get('authToken')).toBeUndefined();
        expect(env.store.get('lastEmail')).toBeUndefined();
        expect(env.store.get('subscriptionEnd')).toBeUndefined();
        expect(env.authState.isAuthenticated).toBe(false);
        expect(env.sentMessages).toEqual([{ channel: 'auth:show-login', payload: undefined }]);
    });

    it('SUBSCRIPTION_INACTIVE → limpia store y manda login', async () => {
        const deps = makeDeps({
            ...env,
            validateTokenImpl: async () => ({ success: false, code: 'SUBSCRIPTION_INACTIVE', error: 'Suscripción inactiva' })
        });

        await checkExistingAuth(deps);

        expect(env.store.get('authToken')).toBeUndefined();
        expect(env.sentMessages).toEqual([{ channel: 'auth:show-login', payload: undefined }]);
    });

    it('MULTIPLE_DEVICE_BLOCKED → limpia store y manda login', async () => {
        const deps = makeDeps({
            ...env,
            validateTokenImpl: async () => ({
                success: false,
                code: 'MULTIPLE_DEVICE_BLOCKED',
                blockedUntil: new Date(),
                minutesLeft: 15,
                userMessage: 'Sesión activa en otro dispositivo'
            })
        });

        await checkExistingAuth(deps);

        expect(env.store.get('authToken')).toBeUndefined();
        expect(env.sentMessages).toEqual([{ channel: 'auth:show-login', payload: undefined }]);
    });

    it('NETWORK_ERROR → CONSERVA token, manda login (clave del bypass arreglado)', async () => {
        const deps = makeDeps({
            ...env,
            validateTokenImpl: async () => ({
                success: false,
                code: 'NETWORK_ERROR',
                error: 'No se pudo contactar al servidor de autenticación'
            })
        });

        await checkExistingAuth(deps);

        // El token NO se debe haber tocado
        expect(env.store.get('authToken')).toBe('tok-123');
        expect(env.store.get('lastEmail')).toBe('user@test.dev');
        expect(env.store.get('subscriptionEnd')).toBe('2099-01-01T00:00:00Z');
        expect(env.sentMessages).toEqual([{ channel: 'auth:show-login', payload: undefined }]);
        expect(env.authState.isAuthenticated).toBe(false);
    });

    it('excepción inesperada (validateToken tira en vez de retornar envelope) → fallback seguro: limpia y pide login', async () => {
        const deps = makeDeps({
            ...env,
            validateTokenImpl: async () => { throw new Error('algo inesperado'); }
        });

        await checkExistingAuth(deps);

        expect(env.store.get('authToken')).toBeUndefined();
        expect(env.sentMessages).toEqual([{ channel: 'auth:show-login', payload: undefined }]);
    });

    it('no envía mensajes si mainWindow está destruida', async () => {
        env.mainWindow.isDestroyed = () => true;
        const deps = makeDeps({ ...env, validateTokenImpl: async () => ({ success: true }) });

        await checkExistingAuth(deps);

        expect(env.sentMessages).toEqual([]);
        // authState igual se actualiza
        expect(env.authState.isAuthenticated).toBe(true);
    });

    it('NUNCA decide expiración localmente: token vencido según fecha imaginaria pero válido para backend → sesión restaurada', async () => {
        // Si quedó un tokenExpiry residual del legacy, NO debe influir
        env.store.set('tokenExpiry', '1970-01-01T00:00:00Z');
        // Subscription end "vencida" según el cliente
        env.store.set('subscriptionEnd', '1970-01-01T00:00:00Z');

        const deps = makeDeps({ ...env, validateTokenImpl: async () => ({ success: true }) });

        await checkExistingAuth(deps);

        // El backend dijo OK → restaura sesión, ignora completamente las fechas locales
        expect(env.authState.isAuthenticated).toBe(true);
        expect(env.sentMessages[0].channel).toBe('auth:authenticated');
    });
});

describe('clearStoredAuth', () => {
    it('borra los 7 campos de auth del store', () => {
        const { store, authState } = makeFreshState();
        authState.isAuthenticated = true;
        store.set('tokenExpiry', 'residual-de-version-vieja');

        clearStoredAuth({ store, authState });

        expect(store.get('authToken')).toBeUndefined();
        expect(store.get('lastEmail')).toBeUndefined();
        expect(store.get('subscriptionEnd')).toBeUndefined();
        // tokenExpiry residual también debe limpiarse para no dejar zombies
        expect(store.get('tokenExpiry')).toBeUndefined();
        expect(store.get('customerName')).toBeUndefined();
        expect(store.get('customerId')).toBeUndefined();
        expect(store.get('device_fingerprint')).toBeUndefined();
    });

    it('resetea el authState a su estado inicial', () => {
        const { store, authState } = makeFreshState();
        authState.isAuthenticated = true;
        authState.userToken = 'x';
        authState.userData = { email: 'a' };

        clearStoredAuth({ store, authState });

        expect(authState.isAuthenticated).toBe(false);
        expect(authState.userToken).toBeNull();
        expect(authState.userData).toBeNull();
    });
});

describe('handleMenuLogout', () => {
    it('llama logout del service, limpia store, emite auth:logged-out', async () => {
        const env = makeFreshState();
        const deps = makeDeps({ ...env, validateTokenImpl: async () => ({ success: true }) });

        await handleMenuLogout(deps);

        expect(deps.services.authService.logout).toHaveBeenCalled();
        expect(env.store.get('authToken')).toBeUndefined();
        expect(env.sentMessages).toEqual([{ channel: 'auth:logged-out', payload: undefined }]);
    });

    it('no rompe si authService es null', async () => {
        const env = makeFreshState();
        const deps = {
            store: env.store,
            authState: env.authState,
            services: { authService: null },
            getMainWindow: () => env.mainWindow
        };

        await expect(handleMenuLogout(deps)).resolves.toBeUndefined();
        // Aún sin authService, el store local se debe haber limpiado
        expect(env.store.get('authToken')).toBeUndefined();
    });
});
