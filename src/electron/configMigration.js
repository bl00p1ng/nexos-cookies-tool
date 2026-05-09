import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import { createLogger } from '../core/utils/Logger.js';

const log = createLogger('ConfigMigration');

/**
 * Fusión recursiva de objetos plain. La fuente sobrescribe el destino;
 * sub-objetos se fusionan en lugar de reemplazarse. Para usuarios que
 * actualizan desde versiones con config.json, esto preserva claves nuevas
 * del DEFAULT_APP_CONFIG mientras adopta los valores customizados del
 * archivo legacy.
 */
function mergeDeep(target, source) {
    const out = { ...target };
    for (const key of Object.keys(source)) {
        const sourceVal = source[key];
        if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
            out[key] = mergeDeep(target?.[key] || {}, sourceVal);
        } else {
            out[key] = sourceVal;
        }
    }
    return out;
}

/**
 * Migración unificada de configuraciones legacy al `appConfig` del store.
 *
 * Cubre tres orígenes históricos en cascada:
 *   1. Claves top-level `adsPowerBaseUrl` / `authBackendUrl` en el store
 *      (versiones intermedias antes de unificar bajo `appConfig`).
 *   2. Archivo `config.json` físico en `userData/config/` (versiones <= 1.3.x).
 *   3. Flags antiguos de migraciones parciales (`adsPowerUrlMigrated`,
 *      `backendUrlMigrated`) que ya no aplican.
 *
 * Idempotente: la flag `legacyConfigMigrated` evita re-ejecución.
 *
 * @param {Object} deps
 * @param {Object} deps.store - electron-store crudo
 * @param {Object} deps.configStore - capa de configuración que envuelve el store
 */
export async function migrateLegacyConfig({ store, configStore }) {
    if (store.get('legacyConfigMigrated', false)) {
        return;
    }

    try {
        // 1. Mover claves top-level legacy a appConfig
        const legacyAdsPower = store.get('adsPowerBaseUrl');
        if (typeof legacyAdsPower === 'string' && legacyAdsPower.length > 0) {
            let clean = legacyAdsPower.trim();
            if (clean.endsWith('/api/v1')) clean = clean.slice(0, -7);
            if (clean.endsWith('/')) clean = clean.slice(0, -1);
            configStore.set('adspower.baseUrl', clean);
            store.delete('adsPowerBaseUrl');
            log.info('Migrada URL de AdsPower desde clave legacy del store');
        }

        const legacyBackend = store.get('authBackendUrl');
        if (typeof legacyBackend === 'string' && legacyBackend.length > 0) {
            let clean = legacyBackend.trim();
            if (!clean.endsWith('/')) clean += '/';
            configStore.set('auth.backendUrl', clean);
            store.delete('authBackendUrl');
            log.info('Migrada URL de Backend desde clave legacy del store');
        }

        // 2. Importar config.json del directorio userData si existe
        if (app && app.isPackaged) {
            const legacyJsonPath = path.join(app.getPath('userData'), 'config', 'config.json');
            try {
                const raw = await fs.readFile(legacyJsonPath, 'utf8');
                const legacyConfig = JSON.parse(raw);

                const current = configStore.getConfig();
                const merged = mergeDeep(current, legacyConfig);
                store.set('appConfig', merged);

                await fs.unlink(legacyJsonPath);
                log.info('Migrado config.json legacy al store y archivo eliminado');
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    log.warn('No se pudo migrar config.json legacy', { error: error.message });
                }
            }
        }

        // 3. Limpiar flags de migraciones anteriores
        store.delete('adsPowerUrlMigrated');
        store.delete('backendUrlMigrated');

        store.set('legacyConfigMigrated', true);
    } catch (error) {
        log.error('Error durante migración legacy', error);
        // No bloqueamos arranque: la app sigue con defaults
        store.set('legacyConfigMigrated', true);
    }
}
