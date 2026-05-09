import { app, Menu } from 'electron';

/**
 * Construye y aplica el menú principal de la aplicación.
 *
 * Las acciones que tocan estado de la app (logout, about) se reciben como
 * callbacks para que este módulo no dependa de ElectronApp ni de los
 * servicios — sigue testeable con stubs simples.
 *
 * @param {Object} handlers
 * @param {Function} handlers.onLogout - acción del item "Cerrar sesión"
 * @param {Function} handlers.onAbout  - acción del item "Acerca de"
 */
export function createApplicationMenu({ onLogout, onAbout }) {
    const isMac = process.platform === 'darwin';

    const template = [
        {
            label: 'Archivo',
            submenu: [
                {
                    label: 'Cerrar sesión',
                    accelerator: isMac ? 'Cmd+L' : 'Ctrl+L',
                    click: () => onLogout?.()
                },
                { type: 'separator' },
                {
                    label: 'Salir',
                    accelerator: isMac ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'Edición',
            submenu: [
                { role: 'undo', label: 'Deshacer' },
                { role: 'redo', label: 'Rehacer' },
                { type: 'separator' },
                { role: 'cut', label: 'Cortar' },
                { role: 'copy', label: 'Copiar' },
                { role: 'paste', label: 'Pegar' },
                { role: 'selectall', label: 'Seleccionar todo' }
            ]
        },
        {
            label: 'Ver',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Ayuda',
            submenu: [
                {
                    label: 'Acerca de',
                    click: () => onAbout?.()
                }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
