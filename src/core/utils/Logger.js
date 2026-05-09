import { promises as fs, createWriteStream } from 'fs';
import { dirname } from 'path';

/**
 * Logger estructurado mínimo para Cookies Hexzor.
 *
 * Diseño:
 *  - Niveles ordenados: debug < info < warn < error < silent.
 *  - Salida JSON-ish a stdout/stderr (lineas legibles + JSON opcional).
 *  - Opcional: stream a archivo (en Electron, dentro de userData/logs/).
 *  - Scope por módulo via createLogger('NavigationController') — el scope
 *    aparece en cada línea para grep eficiente.
 *  - Reemplazo de console.*: getRoot() devuelve la instancia raíz; los
 *    módulos importan createLogger('Nombre') y reciben un hijo con scope.
 *
 * Nivel runtime override: process.env.LOG_LEVEL=debug|info|warn|error|silent.
 *
 * Sin dependencias externas a propósito — un logger es código que tiene que
 * funcionar siempre, incluso si npm está roto.
 */

const LEVELS = Object.freeze({
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 100
});

const DEFAULT_LEVEL = process.env.LOG_LEVEL && LEVELS[process.env.LOG_LEVEL] !== undefined
    ? process.env.LOG_LEVEL
    : 'info';

class Logger {
    /**
     * @param {Object} options
     * @param {string} [options.level='info']     - debug | info | warn | error | silent
     * @param {string} [options.scope='app']      - identificador del módulo emisor
     * @param {WriteStream|null} [options.fileStream=null] - stream opcional a archivo
     * @param {Function} [options.now=Date.now]   - inyectable para tests
     */
    constructor({ level = DEFAULT_LEVEL, scope = 'app', fileStream = null, now = Date.now } = {}) {
        this.level = level;
        this.scope = scope;
        this.fileStream = fileStream;
        this.now = now;
    }

    /**
     * Cambia el nivel mínimo del logger en runtime.
     */
    setLevel(level) {
        if (LEVELS[level] === undefined) {
            throw new Error(`Nivel de log inválido: ${level}`);
        }
        this.level = level;
    }

    /**
     * Conecta un archivo de log. Llamar después de createLogger() si querés
     * que ESTA instancia y sus hijos persistan a disco.
     */
    setFileStream(stream) {
        this.fileStream = stream;
    }

    /**
     * Crea un logger hijo con scope distinto. Hereda nivel y stream.
     */
    child(scope) {
        return new Logger({
            level: this.level,
            scope,
            fileStream: this.fileStream,
            now: this.now
        });
    }

    /**
     * Indica si un nivel está habilitado para este logger.
     */
    isEnabled(level) {
        return LEVELS[level] >= LEVELS[this.level];
    }

    debug(message, meta) { this._log('debug', message, meta); }
    info(message, meta)  { this._log('info', message, meta); }
    warn(message, meta)  { this._log('warn', message, meta); }
    error(message, meta) { this._log('error', message, meta); }

    _log(level, message, meta) {
        if (!this.isEnabled(level)) return;

        const timestamp = new Date(this.now()).toISOString();
        const base = `${timestamp} ${level.toUpperCase().padEnd(5)} [${this.scope}] ${message}`;
        const line = meta !== undefined ? `${base} ${formatMeta(meta)}` : base;

        // Stdout/stderr según severidad
        if (level === 'error') {
            console.error(line);
        } else if (level === 'warn') {
            console.warn(line);
        } else {
            console.log(line);
        }

        if (this.fileStream) {
            try {
                this.fileStream.write(line + '\n');
            } catch (err) {
                // No tirar excepciones desde el logger
                console.error(`Logger: error escribiendo a archivo: ${err.message}`);
            }
        }
    }
}

function formatMeta(meta) {
    if (meta instanceof Error) {
        return `error=${meta.message} stack=${meta.stack || '(no stack)'}`;
    }
    if (typeof meta === 'string') return meta;
    try {
        return JSON.stringify(meta);
    } catch {
        return String(meta);
    }
}

/**
 * Logger raíz singleton de la app. Cada módulo lo usa via createLogger().
 */
const rootLogger = new Logger({ scope: 'app' });

/**
 * Factory público — un logger con scope por módulo.
 * Ejemplo: `const log = createLogger('NavigationController');`
 */
export function createLogger(scope) {
    return rootLogger.child(scope);
}

/**
 * Acceso a la instancia raíz — usar para configurar nivel y archivo
 * desde el bootstrap de la app.
 */
export function getRootLogger() {
    return rootLogger;
}

/**
 * Habilita salida a archivo. Crea el directorio si no existe y devuelve
 * el stream para que el caller pueda cerrarlo al apagar la app.
 * Llamar una sola vez en el bootstrap.
 */
export async function attachFileTransport(filePath) {
    await fs.mkdir(dirname(filePath), { recursive: true });
    const stream = createWriteStream(filePath, { flags: 'a' });
    rootLogger.setFileStream(stream);
    return stream;
}

/**
 * Útil en tests: silencia el logger raíz (y todos los que ya crearon
 * children desde él — heredan en el momento del child(), no en runtime,
 * así que esto SOLO afecta a children creados después).
 */
export function setLogLevel(level) {
    rootLogger.setLevel(level);
}

// Exposición de Logger para tests (constructor directo)
export { Logger, LEVELS };
