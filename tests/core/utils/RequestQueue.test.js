import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RequestQueue from '../../../src/core/utils/RequestQueue.js';

/**
 * RequestQueue es un singleton — antes de cada test reseteamos la instancia.
 * Esto evita que el estado de un test contamine al siguiente y que el loop
 * de processQueue siga corriendo en background.
 */
beforeEach(() => {
    if (RequestQueue.instance) {
        RequestQueue.instance.destroy();
    }
});

afterEach(() => {
    if (RequestQueue.instance) {
        RequestQueue.instance.destroy();
    }
});

describe('RequestQueue', () => {
    describe('singleton', () => {
        it('getInstance retorna siempre la misma instancia', () => {
            const a = RequestQueue.getInstance({ requestsPerSecond: 10 });
            const b = RequestQueue.getInstance();
            expect(a).toBe(b);
        });

        it('después de destroy, getInstance crea una nueva instancia', () => {
            const a = RequestQueue.getInstance();
            a.destroy();
            const b = RequestQueue.getInstance();
            expect(b).not.toBe(a);
        });
    });

    describe('enqueue + procesamiento', () => {
        it('ejecuta una request y resuelve con su resultado', async () => {
            const q = RequestQueue.getInstance({ requestsPerSecond: 1000 });
            const result = await q.enqueue(async () => 'ok');
            expect(result).toBe('ok');
        });

        it('cuenta requests exitosos en stats', async () => {
            const q = RequestQueue.getInstance({ requestsPerSecond: 1000 });
            await q.enqueue(async () => 1);
            await q.enqueue(async () => 2);
            expect(q.getStats().successfulRequests).toBe(2);
            expect(q.getStats().totalRequests).toBe(2);
        });

        it('rechaza la promesa cuando la request falla y no es retryable', async () => {
            const q = RequestQueue.getInstance({ requestsPerSecond: 1000, retryAttempts: 1 });
            await expect(
                q.enqueue(async () => { throw new Error('non-retryable failure'); })
            ).rejects.toThrow('non-retryable failure');
            expect(q.getStats().failedRequests).toBe(1);
        });

        it('procesa requests en orden FIFO', async () => {
            const q = RequestQueue.getInstance({ requestsPerSecond: 1000 });
            const order = [];
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(q.enqueue(async () => { order.push(i); return i; }));
            }
            await Promise.all(promises);
            expect(order).toEqual([0, 1, 2, 3, 4]);
        });
    });

    describe('retry logic', () => {
        it('reintenta requests con errores retryables (ECONNRESET)', async () => {
            const q = RequestQueue.getInstance({
                requestsPerSecond: 1000,
                retryAttempts: 3,
                retryDelay: 0
            });

            let attempts = 0;
            const result = await q.enqueue(async () => {
                attempts++;
                if (attempts < 3) {
                    const err = new Error('ECONNRESET');
                    throw err;
                }
                return 'success-after-retry';
            });

            expect(attempts).toBe(3);
            expect(result).toBe('success-after-retry');
        });

        it('no reintenta errores no retryables', async () => {
            const q = RequestQueue.getInstance({
                requestsPerSecond: 1000,
                retryAttempts: 5,
                retryDelay: 0
            });

            let attempts = 0;
            await expect(q.enqueue(async () => {
                attempts++;
                throw new Error('400 Bad Request');
            })).rejects.toThrow();

            expect(attempts).toBe(1);
        });

        it('respeta retryAttempts máximo', async () => {
            const q = RequestQueue.getInstance({
                requestsPerSecond: 1000,
                retryAttempts: 2,
                retryDelay: 0
            });

            let attempts = 0;
            await expect(q.enqueue(async () => {
                attempts++;
                throw new Error('ECONNRESET');
            })).rejects.toThrow();

            expect(attempts).toBe(2);
        });
    });

    describe('shouldRetry', () => {
        it('marca como retryables errores de red comunes', () => {
            const q = RequestQueue.getInstance();
            expect(q.shouldRetry(new Error('ECONNRESET'))).toBe(true);
            expect(q.shouldRetry(new Error('ENOTFOUND'))).toBe(true);
            expect(q.shouldRetry(new Error('ECONNREFUSED'))).toBe(true);
            expect(q.shouldRetry(new Error('ETIMEDOUT'))).toBe(true);
            expect(q.shouldRetry(new Error('Too many requests'))).toBe(true);
            expect(q.shouldRetry(new Error('rate limit exceeded'))).toBe(true);
        });

        it('marca como no-retryables errores aplicativos', () => {
            const q = RequestQueue.getInstance();
            expect(q.shouldRetry(new Error('Invalid email'))).toBe(false);
            expect(q.shouldRetry(new Error('Profile not found'))).toBe(false);
            expect(q.shouldRetry(new Error('400 Bad Request'))).toBe(false);
        });
    });

    describe('clearQueue', () => {
        it('rechaza todas las requests pendientes con Queue cleared', async () => {
            // Cola con rate limit alto para que se acumulen requests
            const q = RequestQueue.getInstance({ requestsPerSecond: 0.0001 });
            // Detener procesamiento para que las requests no se ejecuten
            q.stopProcessing();

            const p1 = q.enqueue(async () => 'a');
            const p2 = q.enqueue(async () => 'b');

            q.clearQueue();

            await expect(p1).rejects.toThrow('Queue cleared');
            await expect(p2).rejects.toThrow('Queue cleared');
        });
    });

    describe('getStats', () => {
        it('expone tamaño de cola y estado de procesamiento', () => {
            const q = RequestQueue.getInstance({ requestsPerSecond: 5 });
            const stats = q.getStats();
            expect(stats).toHaveProperty('queueSize');
            expect(stats).toHaveProperty('isProcessing');
            expect(stats).toHaveProperty('totalRequests');
            expect(stats).toHaveProperty('successfulRequests');
            expect(stats).toHaveProperty('failedRequests');
            expect(stats.requestsPerSecond).toBe(5);
        });
    });

    describe('resetStats', () => {
        it('vuelve los contadores a 0', async () => {
            const q = RequestQueue.getInstance({ requestsPerSecond: 1000 });
            await q.enqueue(async () => 1);
            expect(q.getStats().totalRequests).toBe(1);
            q.resetStats();
            expect(q.getStats().totalRequests).toBe(0);
            expect(q.getStats().successfulRequests).toBe(0);
        });
    });
});
