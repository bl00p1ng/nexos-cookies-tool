/**
 * Store no persistente compatible con la interfaz mínima que requiere
 * ConfigStore (get/set/delete con notación dot).
 *
 * Pensado para dos casos:
 *  - La CLI (`src/main.js`) que corre sin Electron y no necesita persistir.
 *  - Tests unitarios que necesitan un sustituto de electron-store sin
 *    tocar el filesystem.
 */
class InMemoryStore {
    constructor(initial = {}) {
        this.data = JSON.parse(JSON.stringify(initial));
    }

    get(key, fallback) {
        const value = key.split('.').reduce(
            (cur, k) => (cur == null ? cur : cur[k]),
            this.data
        );
        return value === undefined ? fallback : value;
    }

    set(key, value) {
        const path = key.split('.');
        let cur = this.data;
        for (let i = 0; i < path.length - 1; i++) {
            if (cur[path[i]] == null || typeof cur[path[i]] !== 'object') {
                cur[path[i]] = {};
            }
            cur = cur[path[i]];
        }
        cur[path[path.length - 1]] = value;
    }

    delete(key) {
        const path = key.split('.');
        let cur = this.data;
        for (let i = 0; i < path.length - 1; i++) {
            if (cur[path[i]] == null) return;
            cur = cur[path[i]];
        }
        delete cur[path[path.length - 1]];
    }

    has(key) {
        const sentinel = Symbol('absent');
        return this.get(key, sentinel) !== sentinel;
    }
}

export default InMemoryStore;
