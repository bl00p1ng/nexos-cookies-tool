/**
 * Tests para Utils.escapeAttr — helper de escape de atributos HTML.
 *
 * utils.js no es un módulo ESM (usa window.Utils = Utils).
 * Se carga como script de texto, se ejecuta en un contexto con window mockeado,
 * y se extrae la clase de window.Utils para testearla.
 *
 * Entorno: Vitest en Node (sin jsdom), no se necesita DOM porque
 * escapeAttr es pura manipulación de strings.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carga y evalúa utils.js en un contexto con window mockeado para que
// la asignación `window.Utils = Utils` no falle en Node.
let Utils;
beforeAll(() => {
    const code = readFileSync(
        resolve(__dirname, '../../src/ui/js/utils.js'),
        'utf-8'
    );
    const mockWindow = {};
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'navigator', code)(
        mockWindow,
        { createElement: () => ({ textContent: '', innerHTML: '' }) },
        {}
    );
    Utils = mockWindow.Utils;
});

describe('Utils.escapeAttr', () => {
    it('devuelve string plano sin cambios', () => {
        expect(Utils.escapeAttr('hello')).toBe('hello');
    });

    it('escapa comilla doble', () => {
        expect(Utils.escapeAttr('a"b')).toBe('a&quot;b');
    });

    it('escapa ampersand', () => {
        expect(Utils.escapeAttr('a&b')).toBe('a&amp;b');
    });

    it('escapa menor y mayor', () => {
        expect(Utils.escapeAttr('a<b>c')).toBe('a&lt;b&gt;c');
    });

    it("escapa comilla simple", () => {
        expect(Utils.escapeAttr("a'b")).toBe('a&#39;b');
    });

    it('devuelve string vacío para null', () => {
        expect(Utils.escapeAttr(null)).toBe('');
    });

    it('devuelve string vacío para undefined', () => {
        expect(Utils.escapeAttr(undefined)).toBe('');
    });

    it('convierte Number a string sin romper', () => {
        expect(Utils.escapeAttr(123)).toBe('123');
    });

    it('vector XSS: URL con comilla cierra onclick (no debe tener comillas crudas)', () => {
        const xssUrl = "x') ; alert(1) //";
        const escaped = Utils.escapeAttr(xssUrl);
        // No debe contener comilla simple ni doble sin escapar
        expect(escaped).not.toContain("'");
        expect(escaped).not.toContain('"');
        // Debe contener la entidad en su lugar
        expect(escaped).toContain('&#39;');
    });
});
