import { describe, it, expect, beforeEach } from 'vitest';
import InMemoryStore from '../../../src/core/config/InMemoryStore.js';

describe('InMemoryStore', () => {
    let store;

    beforeEach(() => {
        store = new InMemoryStore();
    });

    describe('get / set', () => {
        it('set y get devuelven el mismo valor en clave plana', () => {
            store.set('foo', 'bar');
            expect(store.get('foo')).toBe('bar');
        });

        it('get devuelve fallback cuando la clave no existe', () => {
            expect(store.get('missing', 'fallback')).toBe('fallback');
        });

        it('get devuelve undefined sin fallback cuando la clave no existe', () => {
            expect(store.get('missing')).toBeUndefined();
        });

        it('set crea estructura anidada automáticamente', () => {
            store.set('a.b.c', 42);
            expect(store.get('a.b.c')).toBe(42);
            expect(store.get('a.b')).toEqual({ c: 42 });
        });

        it('set sobrescribe primitivos en el path con objetos', () => {
            store.set('a.b', 'string');
            store.set('a.b.c', 1);
            expect(store.get('a.b.c')).toBe(1);
        });

        it('set conserva otras claves del mismo nivel', () => {
            store.set('shared.x', 1);
            store.set('shared.y', 2);
            expect(store.get('shared')).toEqual({ x: 1, y: 2 });
        });
    });

    describe('delete', () => {
        it('delete remueve una clave plana', () => {
            store.set('k', 'v');
            store.delete('k');
            expect(store.get('k')).toBeUndefined();
        });

        it('delete remueve una hoja anidada sin tocar las hermanas', () => {
            store.set('a.b', 1);
            store.set('a.c', 2);
            store.delete('a.b');
            expect(store.get('a.b')).toBeUndefined();
            expect(store.get('a.c')).toBe(2);
        });

        it('delete sobre clave inexistente no lanza', () => {
            expect(() => store.delete('nope.nope')).not.toThrow();
        });
    });

    describe('has', () => {
        it('has devuelve true para claves existentes con valor truthy', () => {
            store.set('a', 'b');
            expect(store.has('a')).toBe(true);
        });

        it('has devuelve true para claves existentes con valor falsy', () => {
            store.set('a', 0);
            store.set('b', '');
            store.set('c', null);
            store.set('d', false);
            expect(store.has('a')).toBe(true);
            expect(store.has('b')).toBe(true);
            expect(store.has('c')).toBe(true);
            expect(store.has('d')).toBe(true);
        });

        it('has devuelve false para claves inexistentes', () => {
            expect(store.has('missing')).toBe(false);
            expect(store.has('a.b.c')).toBe(false);
        });
    });

    describe('constructor con initial', () => {
        it('hidrata el store desde el objeto inicial', () => {
            store = new InMemoryStore({ appConfig: { auth: { backendUrl: 'https://x' } } });
            expect(store.get('appConfig.auth.backendUrl')).toBe('https://x');
        });

        it('clona en profundidad — modificar el objeto inicial no afecta al store', () => {
            const initial = { nested: { value: 1 } };
            store = new InMemoryStore(initial);
            initial.nested.value = 999;
            expect(store.get('nested.value')).toBe(1);
        });
    });
});
