/**
 * Test estático: verifica que la variable `page` en runProfileSession
 * se declara con `let` y NO con `const`, de modo que el camino de reconexión
 * (approx. línea 336: `page = browserInstance.page`) pueda reasignarla sin lanzar
 * TypeError: Assignment to constant variable.
 *
 * // TODO: gap — este test NO verifica el flujo end-to-end de reconexión.
 * // Promover a integration test cuando se refactorice NavigationController.
 * // El bloque de reconexión (~línea 336) queda documentado como deuda técnica.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SOURCE_PATH = join(
    import.meta.dirname,
    '../../../src/core/navigation/NavigationController.js'
);

const source = readFileSync(SOURCE_PATH, 'utf-8');

describe('NavigationController — declaración de `page` en runProfileSession', () => {

    it('A-S1: la asignación de page NO usa const (destrucción)', () => {
        // La línea problemática era: const { page } = browserInstance;
        expect(source).not.toMatch(/const\s*\{\s*page\s*\}\s*=\s*browserInstance/);
    });

    it('A-S1: la asignación de page usa let (para permitir reasignación)', () => {
        // La forma correcta: let page = browserInstance.page;
        expect(source).toMatch(/let\s+page\s*=\s*browserInstance\.page/);
    });

    it('A-S1: el camino de reconexión puede reasignar page (page = browserInstance.page)', () => {
        // La línea de reconexión: page = browserInstance.page;
        // Confirmar que existe la reasignación SIN let/const/var al inicio
        expect(source).toMatch(/^\s*page\s*=\s*browserInstance\.page;/m);
    });
});
