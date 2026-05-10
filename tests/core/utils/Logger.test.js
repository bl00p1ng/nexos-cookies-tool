import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger, LEVELS, createLogger, getRootLogger, setLogLevel } from '../../../src/core/utils/Logger.js';

describe('Logger', () => {
    let logSpy, warnSpy, errorSpy;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    describe('niveles', () => {
        it('respeta el nivel mínimo y filtra los inferiores', () => {
            const log = new Logger({ level: 'warn', scope: 'test', now: () => 0 });
            log.debug('hidden');
            log.info('hidden');
            log.warn('shown');
            log.error('shown');

            expect(logSpy).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        it('silent suprime todo', () => {
            const log = new Logger({ level: 'silent', scope: 'test' });
            log.debug('x'); log.info('x'); log.warn('x'); log.error('x');
            expect(logSpy).not.toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();
            expect(errorSpy).not.toHaveBeenCalled();
        });

        it('debug habilita todos los niveles', () => {
            const log = new Logger({ level: 'debug', scope: 'test' });
            log.debug('a'); log.info('a'); log.warn('a'); log.error('a');
            expect(logSpy).toHaveBeenCalledTimes(2); // debug + info
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        it('setLevel cambia el filtro en runtime', () => {
            const log = new Logger({ level: 'error', scope: 'test' });
            log.info('hidden');
            expect(logSpy).not.toHaveBeenCalled();

            log.setLevel('info');
            log.info('shown');
            expect(logSpy).toHaveBeenCalledTimes(1);
        });

        it('setLevel rechaza niveles inválidos', () => {
            const log = new Logger();
            expect(() => log.setLevel('verbose')).toThrow();
        });
    });

    describe('formato', () => {
        it('cada línea incluye timestamp ISO, nivel padded, scope y mensaje', () => {
            const log = new Logger({
                level: 'info',
                scope: 'MyModule',
                now: () => 0 // 1970-01-01T00:00:00.000Z
            });
            log.info('hello');

            expect(logSpy).toHaveBeenCalledWith(
                '1970-01-01T00:00:00.000Z INFO  [MyModule] hello'
            );
        });

        it('serializa meta como JSON cuando es objeto', () => {
            const log = new Logger({ level: 'info', scope: 'X', now: () => 0 });
            log.info('event', { userId: 42, ok: true });

            const call = logSpy.mock.calls[0][0];
            expect(call).toContain('event');
            expect(call).toContain('"userId":42');
            expect(call).toContain('"ok":true');
        });

        it('formatea Error con message y stack', () => {
            const log = new Logger({ level: 'error', scope: 'X', now: () => 0 });
            const err = new Error('boom');
            log.error('failed', err);

            const call = errorSpy.mock.calls[0][0];
            expect(call).toContain('error=boom');
            expect(call).toContain('stack=');
        });

        it('acepta meta string sin envolver', () => {
            const log = new Logger({ level: 'info', scope: 'X', now: () => 0 });
            log.info('msg', 'extra-context');
            expect(logSpy.mock.calls[0][0]).toContain('extra-context');
        });
    });

    describe('routing por nivel', () => {
        it('info y debug van a console.log', () => {
            const log = new Logger({ level: 'debug', scope: 't' });
            log.info('a');
            log.debug('b');
            expect(logSpy).toHaveBeenCalledTimes(2);
            expect(warnSpy).not.toHaveBeenCalled();
            expect(errorSpy).not.toHaveBeenCalled();
        });

        it('warn va a console.warn', () => {
            const log = new Logger({ level: 'debug', scope: 't' });
            log.warn('w');
            expect(warnSpy).toHaveBeenCalledTimes(1);
        });

        it('error va a console.error', () => {
            const log = new Logger({ level: 'debug', scope: 't' });
            log.error('e');
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('child', () => {
        it('hereda nivel y stream pero usa scope propio', () => {
            const parent = new Logger({ level: 'warn', scope: 'parent', now: () => 0 });
            const child = parent.child('child');

            child.warn('hi');
            expect(warnSpy.mock.calls[0][0]).toContain('[child]');
            expect(warnSpy.mock.calls[0][0]).not.toContain('[parent]');
        });

        it('cambiar nivel del padre no afecta al hijo ya creado', () => {
            const parent = new Logger({ level: 'info', scope: 'p' });
            const child = parent.child('c');

            parent.setLevel('silent');
            child.info('shown');

            expect(logSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('fileStream', () => {
        it('escribe en el stream cuando está conectado', () => {
            const writes = [];
            const fakeStream = { write: (s) => writes.push(s) };

            const log = new Logger({ level: 'info', scope: 't', fileStream: fakeStream, now: () => 0 });
            log.info('persisted');

            expect(writes).toHaveLength(1);
            expect(writes[0]).toContain('persisted');
            expect(writes[0].endsWith('\n')).toBe(true);
        });

        it('no propaga excepciones del stream a los callers', () => {
            const fakeStream = { write: () => { throw new Error('disk full'); } };
            const log = new Logger({ level: 'info', scope: 't', fileStream: fakeStream });
            expect(() => log.info('x')).not.toThrow();
        });
    });

    describe('isEnabled', () => {
        it('retorna true para niveles iguales o superiores al configurado', () => {
            const log = new Logger({ level: 'warn' });
            expect(log.isEnabled('debug')).toBe(false);
            expect(log.isEnabled('info')).toBe(false);
            expect(log.isEnabled('warn')).toBe(true);
            expect(log.isEnabled('error')).toBe(true);
        });
    });

    describe('createLogger / getRootLogger', () => {
        afterEach(() => {
            // Restaurar el root al default por si algún test lo cambió
            getRootLogger().setLevel('info');
        });

        it('createLogger devuelve loggers con scope propio compartiendo el root', () => {
            setLogLevel('info');
            const a = createLogger('A');
            const b = createLogger('B');

            a.info('from-a');
            b.info('from-b');

            expect(logSpy.mock.calls[0][0]).toContain('[A]');
            expect(logSpy.mock.calls[1][0]).toContain('[B]');
        });

        it('setLogLevel afecta a futuros children del root', () => {
            setLogLevel('silent');
            const c = createLogger('C');
            c.info('hidden');
            expect(logSpy).not.toHaveBeenCalled();
        });
    });
});

describe('LEVELS', () => {
    it('los niveles tienen el orden esperado', () => {
        expect(LEVELS.debug).toBeLessThan(LEVELS.info);
        expect(LEVELS.info).toBeLessThan(LEVELS.warn);
        expect(LEVELS.warn).toBeLessThan(LEVELS.error);
        expect(LEVELS.error).toBeLessThan(LEVELS.silent);
    });
});
