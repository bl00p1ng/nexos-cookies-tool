import { vi } from 'vitest';

/**
 * El módulo `electron` es un binario nativo que no resuelve en Node puro.
 * Para los tests de capas del core (DatabaseManager, etc.) lo stubeamos
 * con un objeto vacío. Los módulos de producción ya tienen guards del
 * estilo `if (app && app.isPackaged)` para tolerar este caso.
 */
vi.mock('electron', () => ({
    app: undefined,
    BrowserWindow: class {},
    ipcMain: { handle: () => {} },
    dialog: {},
    shell: {},
    Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} }
}));
