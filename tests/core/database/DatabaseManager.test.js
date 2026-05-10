import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import DatabaseManager from '../../../src/core/database/DatabaseManager.js';

/**
 * DatabaseManager normalmente trabaja contra un archivo SQLite en disco.
 * Para los tests le inyectamos el path especial ':memory:' que SQLite
 * interpreta como base de datos en RAM — rápida, aislada por test, y
 * se descarta cuando cerrás la conexión.
 */
describe('DatabaseManager (in-memory SQLite)', () => {
    let db;

    beforeEach(async () => {
        db = new DatabaseManager(':memory:');
        await db.initialize();
    });

    afterEach(async () => {
        if (db) {
            await db.close().catch(() => {});
        }
    });

    describe('inicialización', () => {
        it('crea las tablas y siembra los websites iniciales', async () => {
            const count = await db.getWebsiteCount();
            expect(count).toBeGreaterThan(0);
        });
    });

    describe('getWebsiteStats', () => {
        it('devuelve totales con la forma esperada por la UI', async () => {
            const stats = await db.getWebsiteStats();
            expect(stats).toHaveProperty('totalSites');
            expect(stats).toHaveProperty('activeSites');
            expect(stats).toHaveProperty('totalVisits');
            expect(typeof stats.totalSites).toBe('number');
            expect(typeof stats.activeSites).toBe('number');
            expect(typeof stats.totalVisits).toBe('number');
        });

        it('totalSites coincide con getWebsiteCount', async () => {
            const stats = await db.getWebsiteStats();
            const count = await db.getWebsiteCount();
            expect(stats.totalSites).toBe(count);
        });

        it('totalVisits es 0 en una DB recién sembrada', async () => {
            const stats = await db.getWebsiteStats();
            expect(stats.totalVisits).toBe(0);
        });

        it('activeSites es <= totalSites', async () => {
            const stats = await db.getWebsiteStats();
            expect(stats.activeSites).toBeLessThanOrEqual(stats.totalSites);
        });
    });

    describe('getRandomWebsites', () => {
        it('devuelve la cantidad pedida (si hay suficientes)', async () => {
            const sites = await db.getRandomWebsites(3);
            expect(sites.length).toBe(3);
            sites.forEach(s => {
                expect(s).toHaveProperty('url');
                expect(s).toHaveProperty('domain');
            });
        });

        it('respeta excludeUrls', async () => {
            const first = await db.getRandomWebsites(1);
            const excluded = first[0].url;
            const sites = await db.getRandomWebsites(5, [excluded]);
            sites.forEach(s => {
                expect(s.url).not.toBe(excluded);
            });
        });
    });

    describe('updateWebsiteStats', () => {
        it('incrementa visit_count e impacta totalVisits del agregado', async () => {
            const [site] = await db.getRandomWebsites(1);
            await db.updateWebsiteStats(site.url, 10);
            await db.updateWebsiteStats(site.url, 20);

            const stats = await db.getWebsiteStats();
            expect(stats.totalVisits).toBeGreaterThanOrEqual(2);
        });

        it('calcula el promedio de cookies recolectadas', async () => {
            const [site] = await db.getRandomWebsites(1);
            await db.updateWebsiteStats(site.url, 100);
            await db.updateWebsiteStats(site.url, 200);

            const row = await db.db.getAsync(
                'SELECT avg_cookies_collected, visit_count FROM websites WHERE url = ?',
                [site.url]
            );
            expect(row.visit_count).toBe(2);
            expect(row.avg_cookies_collected).toBeGreaterThan(0);
        });
    });
});
