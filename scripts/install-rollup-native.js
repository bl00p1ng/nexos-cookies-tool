#!/usr/bin/env node

/**
 * Asegura que la binaria nativa de Rollup correspondiente a la
 * plataforma actual esté instalada.
 *
 * Por qué existe esto:
 *   El `.npmrc` del proyecto fuerza `optional=false` para evitar que npm
 *   intente instalar `dmg-license` fuera de macOS (workaround histórico
 *   del build de CI). Como efecto colateral, npm también saltea las
 *   binarias nativas que Rollup distribuye como optionalDependencies
 *   (`@rollup/rollup-<platform>-<arch>`), lo que rompe Vitest en local.
 *
 * Cómo se comporta:
 *   - Es idempotente: si la binaria ya está resoluble, sale en <50ms.
 *   - La instalación interna usa `--ignore-scripts` para no re-disparar
 *     este mismo postinstall (recursión) y `--no-save` para no ensuciar
 *     `package.json` con una dep platform-specific.
 *   - Si la plataforma no está mapeada (CI exótico, etc.), avisa y sale 0
 *     en lugar de fallar.
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const PLATFORM_MAP = {
    'darwin-arm64': '@rollup/rollup-darwin-arm64',
    'darwin-x64': '@rollup/rollup-darwin-x64',
    'linux-x64': '@rollup/rollup-linux-x64-gnu',
    'linux-arm64': '@rollup/rollup-linux-arm64-gnu',
    'win32-x64': '@rollup/rollup-win32-x64-msvc'
};

const key = `${process.platform}-${process.arch}`;
const pkg = PLATFORM_MAP[key];

if (!pkg) {
    console.log(`[rollup-native] sin binaria mapeada para ${key}, omitiendo`);
    process.exit(0);
}

const require = createRequire(import.meta.url);

try {
    require.resolve(pkg);
    // Ya está instalada — el caso común tras el primer install. Salimos rápido.
    process.exit(0);
} catch {
    // No instalada, seguimos.
}

console.log(`[rollup-native] instalando ${pkg} para ${key}...`);

try {
    execSync(
        `npm install ${pkg} --no-save --include=optional --ignore-scripts`,
        { stdio: 'inherit' }
    );
} catch (error) {
    console.error(`[rollup-native] fallo al instalar ${pkg}:`, error.message);
    process.exit(1);
}
