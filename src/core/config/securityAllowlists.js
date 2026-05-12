/**
 * Allowlists de seguridad para URLs de backend y AdsPower.
 *
 * Todas las constantes son Sets congelados consultables con `.has()`.
 * El congelado previene mutaciones accidentales en runtime.
 *
 * Estas constantes son independientes de la lógica IPC y viven en `core/`
 * para que el CLI y Electron las compartan sin acoplamiento a Electron.
 */

/** Hostnames permitidos para el backend de autenticación. */
export const BACKEND_HOSTNAMES = Object.freeze(new Set([
    'cookies-tool.hexzoragencia.online'
]));

/** Protocolos permitidos para el backend de autenticación. Solo HTTPS. */
export const BACKEND_PROTOCOLS = Object.freeze(new Set([
    'https:'
]));

/**
 * Hostnames permitidos para la API local de AdsPower.
 * Solo se aceptan referencias de loopback/locales para evitar exfiltración
 * a hosts remotos si el usuario es engañado para ingresar una URL maliciosa.
 */
export const ADSPOWER_HOSTNAMES = Object.freeze(new Set([
    'local.adspower.com',
    'local.adspower.net',
    '127.0.0.1',
    'localhost'
]));

/**
 * Protocolos permitidos para AdsPower.
 * Se acepta tanto HTTP (default de AdsPower) como HTTPS (proxies locales TLS).
 * El allowlist de host ya bloquea exfiltración — forzar HTTP sería innecesariamente
 * restrictivo para usuarios con setups de proxy local.
 */
export const ADSPOWER_PROTOCOLS = Object.freeze(new Set([
    'http:',
    'https:'
]));
