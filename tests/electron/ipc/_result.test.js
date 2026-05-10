import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handle, mapError } from '../../../src/electron/ipc/_result.js';
import { setLogLevel } from '../../../src/core/utils/Logger.js';

// El helper crea loggers via createLogger(). Los tests necesitan que el
// logger emita a console.* para poder espiar. Forzamos nivel debug para
// asegurar que error+info+warn+debug pasen, independiente del LOG_LEVEL
// con el que se corra el suite.
beforeEach(() => setLogLevel('debug'));
afterEach(() => setLogLevel('info'));

describe('mapError', () => {
    it('mapea Error simple a envelope con success false', () => {
        expect(mapError(new Error('boom'))).toEqual({
            success: false,
            error: 'boom'
        });
    });

    it('preserva userMessage cuando existe', () => {
        const err = new Error('raw message');
        err.userMessage = 'Mensaje amigable al usuario';
        expect(mapError(err).error).toBe('Mensaje amigable al usuario');
    });

    it('preserva code cuando existe', () => {
        const err = new Error('x');
        err.code = 'MULTIPLE_SESSIONS_BLOCKED';
        expect(mapError(err).code).toBe('MULTIPLE_SESSIONS_BLOCKED');
    });

    it('preserva retryAfterMinutes cuando existe', () => {
        const err = new Error('x');
        err.retryAfterMinutes = 5;
        expect(mapError(err).retryAfterMinutes).toBe(5);
    });

    it('no incluye retryAfterMinutes si no aplica', () => {
        const env = mapError(new Error('x'));
        expect(env).not.toHaveProperty('retryAfterMinutes');
        expect(env).not.toHaveProperty('code');
    });

    it('maneja errores tipo objeto (sin clase Error)', () => {
        const env = mapError({
            userMessage: 'desde objeto',
            code: 'CUSTOM',
            retryAfterMinutes: 10
        });
        expect(env).toEqual({
            success: false,
            error: 'desde objeto',
            code: 'CUSTOM',
            retryAfterMinutes: 10
        });
    });

    it('genera mensaje genérico cuando no hay nada usable', () => {
        expect(mapError(null).error).toBe('Error desconocido');
        expect(mapError(undefined).error).toBe('Error desconocido');
    });

    it('stringifica valores primitivos lanzados (string, number)', () => {
        expect(mapError('algo malo').error).toBe('algo malo');
    });
});

describe('handle', () => {
    let logSpy, errorSpy;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('devuelve el valor del fn cuando no tira', async () => {
        const wrapped = handle('test', async (x) => x * 2);
        await expect(wrapped(5)).resolves.toBe(10);
    });

    it('preserva el shape exacto que el fn retorne (no envuelve éxito)', async () => {
        const wrapped = handle('test', async () => ({ success: true, sites: [1, 2] }));
        await expect(wrapped()).resolves.toEqual({ success: true, sites: [1, 2] });
    });

    it('atrapa errores y los traduce a envelope', async () => {
        const wrapped = handle('test', async () => { throw new Error('explotó'); });
        await expect(wrapped()).resolves.toEqual({
            success: false,
            error: 'explotó'
        });
    });

    it('preserva código y userMessage de errores estructurados', async () => {
        const wrapped = handle('auth', async () => {
            const err = new Error('raw');
            err.userMessage = 'Sesión múltiple bloqueada';
            err.code = 'MULTIPLE_SESSIONS_BLOCKED';
            err.retryAfterMinutes = 15;
            throw err;
        });
        await expect(wrapped()).resolves.toEqual({
            success: false,
            error: 'Sesión múltiple bloqueada',
            code: 'MULTIPLE_SESSIONS_BLOCKED',
            retryAfterMinutes: 15
        });
    });

    it('loguea el error con el scope provisto', async () => {
        const wrapped = handle('mi-scope', async () => { throw new Error('x'); });
        await wrapped();
        expect(errorSpy).toHaveBeenCalled();
        const logLine = errorSpy.mock.calls[0][0];
        expect(logLine).toContain('[ipc:mi-scope]');
        expect(logLine).toContain('Handler error');
    });

    it('reenvía todos los args al fn original', async () => {
        const spy = vi.fn(async (...args) => args);
        const wrapped = handle('t', spy);
        await wrapped('a', 'b', 'c');
        expect(spy).toHaveBeenCalledWith('a', 'b', 'c');
    });

    it('atrapa errores sincrónicos lanzados por el fn', async () => {
        const wrapped = handle('t', () => { throw new Error('sync'); });
        await expect(wrapped()).resolves.toEqual({
            success: false,
            error: 'sync'
        });
    });
});
