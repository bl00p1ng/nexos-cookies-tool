import { describe, it, expect } from 'vitest';
import {
    sanitizeBackendUrl,
    sanitizeAdsPowerUrl
} from '../../../src/electron/ipc/config.js';

// ── Capability A: sanitizeBackendUrl ─────────────────────────────────────────

describe('sanitizeBackendUrl', () => {
    it('A-S1 acepta URL válida con host allowlisted y HTTPS', () => {
        const result = sanitizeBackendUrl('https://cookies-tool.hexzoragencia.online/');
        expect(typeof result).toBe('string');
        expect(result).toContain('cookies-tool.hexzoragencia.online');
    });

    it('A-S2 rechaza host no permitido', () => {
        expect(() => sanitizeBackendUrl('https://attacker.tld/')).toThrow(/dominio/i);
    });

    it('A-S3 rechaza protocolo http aunque el host esté permitido', () => {
        expect(() => sanitizeBackendUrl('http://cookies-tool.hexzoragencia.online/')).toThrow(/protocolo/i);
    });

    it('A-S4 acepta URL válida con path arbitrario', () => {
        const result = sanitizeBackendUrl('https://cookies-tool.hexzoragencia.online/api/v2/');
        expect(typeof result).toBe('string');
        expect(result).toContain('/api/v2/');
    });

    it('A-S5 rechaza URL malformada', () => {
        expect(() => sanitizeBackendUrl('not-a-url')).toThrow();
    });

    it('A-S6 rechaza string vacío o null o undefined', () => {
        expect(() => sanitizeBackendUrl('')).toThrow();
        expect(() => sanitizeBackendUrl(null)).toThrow();
        expect(() => sanitizeBackendUrl(undefined)).toThrow();
    });
});

// ── Capability B: sanitizeAdsPowerUrl ───────────────────────────────────────

describe('sanitizeAdsPowerUrl', () => {
    it('B-S1 acepta local.adspower.com con puerto', () => {
        const result = sanitizeAdsPowerUrl('http://local.adspower.com:50325');
        expect(typeof result).toBe('string');
        expect(result).toContain('local.adspower.com');
    });

    it('B-S2 acepta local.adspower.net con puerto', () => {
        const result = sanitizeAdsPowerUrl('http://local.adspower.net:50325');
        expect(result).toContain('local.adspower.net');
    });

    it('B-S3 acepta 127.0.0.1 con puerto', () => {
        const result = sanitizeAdsPowerUrl('http://127.0.0.1:50325');
        expect(result).toContain('127.0.0.1');
    });

    it('B-S4 acepta localhost con puerto', () => {
        const result = sanitizeAdsPowerUrl('http://localhost:50325');
        expect(result).toContain('localhost');
    });

    it('B-S5 rechaza host remoto no permitido', () => {
        expect(() => sanitizeAdsPowerUrl('http://attacker.tld:50325')).toThrow(/dominio/i);
    });

    it('B-S6 rechaza protocolo no soportado (ftp:)', () => {
        expect(() => sanitizeAdsPowerUrl('ftp://local.adspower.com:50325')).toThrow(/protocolo/i);
    });

    it('B-S7 rechaza URL sin puerto explícito', () => {
        expect(() => sanitizeAdsPowerUrl('http://local.adspower.com')).toThrow(/puerto/i);
    });

    it('B-S8 acepta URL con sufijo /api/v1 (lo stripea antes de validar)', () => {
        const result = sanitizeAdsPowerUrl('http://local.adspower.com:50325/api/v1');
        expect(result).toContain('local.adspower.com');
        expect(result).not.toContain('/api/v1');
    });
});
