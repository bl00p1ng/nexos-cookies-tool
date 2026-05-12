/**
 * Test unitario de la función pura `handleGlobalKeydown` extraída de app.js.
 *
 * Verifica que:
 * 1. Ctrl+R siempre llama event.preventDefault() (sin condición de entorno).
 * 2. Cmd+R (metaKey) también llama event.preventDefault().
 * 3. Escape cierra modales (ctx.closeAllModals) sin llamar preventDefault.
 * 4. Otras teclas no tienen efectos secundarios.
 *
 * Este test opera sobre una función pura: NO importa el módulo completo app.js
 * (que tiene side-effects de DOM en el ámbito de módulo). Solo se importa
 * el export nombrado `handleGlobalKeydown`.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleGlobalKeydown } from '../../src/ui/js/app.js';

/**
 * Construye un evento de teclado fake.
 * @param {Partial<KeyboardEvent>} overrides
 */
function makeEvent(overrides = {}) {
    return {
        key: '',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        ...overrides
    };
}

/**
 * Construye un contexto (la instancia de la app) con métodos falsos.
 */
function makeCtx() {
    return {
        closeAllModals: vi.fn()
    };
}

describe('handleGlobalKeydown', () => {

    describe('C-S1: Ctrl+R — preventDefault llamado, sin errores', () => {
        it('llama event.preventDefault exactamente una vez', () => {
            const event = makeEvent({ ctrlKey: true, key: 'r' });
            const ctx = makeCtx();

            handleGlobalKeydown(event, ctx);

            expect(event.preventDefault).toHaveBeenCalledTimes(1);
        });

        it('no lanza ReferenceError (process.env no existe en renderer)', () => {
            const event = makeEvent({ ctrlKey: true, key: 'r' });
            const ctx = makeCtx();

            expect(() => handleGlobalKeydown(event, ctx)).not.toThrow();
        });

        it('NO llama closeAllModals para Ctrl+R', () => {
            const event = makeEvent({ ctrlKey: true, key: 'r' });
            const ctx = makeCtx();

            handleGlobalKeydown(event, ctx);

            expect(ctx.closeAllModals).not.toHaveBeenCalled();
        });
    });

    describe('C-S2: Cmd+R (metaKey en macOS) — mismo comportamiento que Ctrl+R', () => {
        it('llama event.preventDefault exactamente una vez', () => {
            const event = makeEvent({ metaKey: true, key: 'r' });
            const ctx = makeCtx();

            handleGlobalKeydown(event, ctx);

            expect(event.preventDefault).toHaveBeenCalledTimes(1);
        });

        it('no lanza ninguna excepción', () => {
            const event = makeEvent({ metaKey: true, key: 'r' });
            const ctx = makeCtx();

            expect(() => handleGlobalKeydown(event, ctx)).not.toThrow();
        });
    });

    describe('C-S3: Escape — cierra modales, NO llama preventDefault', () => {
        it('llama ctx.closeAllModals exactamente una vez', () => {
            const event = makeEvent({ key: 'Escape' });
            const ctx = makeCtx();

            handleGlobalKeydown(event, ctx);

            expect(ctx.closeAllModals).toHaveBeenCalledTimes(1);
        });

        it('NO llama event.preventDefault para Escape', () => {
            const event = makeEvent({ key: 'Escape' });
            const ctx = makeCtx();

            handleGlobalKeydown(event, ctx);

            expect(event.preventDefault).not.toHaveBeenCalled();
        });
    });

    describe('C-S4: tecla sin efectos — ctrlKey+a no tiene side effects', () => {
        it('no llama preventDefault para Ctrl+a', () => {
            const event = makeEvent({ ctrlKey: true, key: 'a' });
            const ctx = makeCtx();

            handleGlobalKeydown(event, ctx);

            expect(event.preventDefault).not.toHaveBeenCalled();
        });

        it('no llama closeAllModals para Ctrl+a', () => {
            const event = makeEvent({ ctrlKey: true, key: 'a' });
            const ctx = makeCtx();

            handleGlobalKeydown(event, ctx);

            expect(ctx.closeAllModals).not.toHaveBeenCalled();
        });
    });
});
