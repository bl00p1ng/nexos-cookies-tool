import { createLogger } from '../core/utils/Logger.js';

const log = createLogger('AuthBootstrap');

/**
 * Lógica de arranque y mantenimiento de sesión del proceso main.
 *
 * Este módulo NO maneja IPC requests (eso vive en `ipc/auth.js`). Es la
 * cara del bootstrap: chequea si hay sesión guardada cuando la ventana
 * está lista, valida contra el backend, restaura `authState` o fuerza
 * login. También expone helpers reusados por el router IPC y por el menú.
 */

/**
 * Limpia toda la información de sesión persistida y resetea el authState
 * en memoria. Idempotente.
 *
 * @param {Object} deps
 * @param {Object} deps.store - electron-store
 * @param {Object} deps.authState - { isAuthenticated, userToken, userData }
 */
export function clearStoredAuth({ store, authState }) {
    store.delete('authToken');
    store.delete('lastEmail');
    store.delete('subscriptionEnd');
    store.delete('tokenExpiry');
    store.delete('customerName');
    store.delete('customerId');
    store.delete('device_fingerprint');

    authState.isAuthenticated = false;
    authState.userToken = null;
    authState.userData = null;
}

/**
 * Verifica autenticación existente al inicio.
 *
 * Delega la decisión de validez ENTERAMENTE al backend via
 * `authService.validateToken`. No se hace ninguna inferencia local sobre
 * expiración de token ni suscripción — esos datos en el store son
 * editables por el usuario y no son fuente de verdad.
 *
 * Política según el resultado del backend:
 *   - success                    → restaurar sesión, emitir auth:authenticated
 *   - INVALID_TOKEN / SUBSCRIPTION_INACTIVE / MULTIPLE_DEVICE_BLOCKED
 *                                → limpiar sesión local + auth:show-login
 *   - NETWORK_ERROR              → conservar token (puede haber sido un corte
 *                                  temporal de red) y pedir login. Próximo
 *                                  arranque con red restaurará la sesión.
 *   - otro fail no clasificado   → conservadoramente, limpiar + login.
 *
 * @param {Object} deps
 * @param {Object} deps.store
 * @param {Object} deps.authState
 * @param {Object} deps.services - contenedor de servicios (necesita authService)
 * @param {Function} deps.getMainWindow
 */
export async function checkExistingAuth(deps) {
    const { store, authState, services, getMainWindow } = deps;
    const sendToUi = (channel, payload) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, payload);
        }
    };

    try {
        log.info('Verificando autenticación existente');

        const storedToken = store.get('authToken');
        const storedEmail = store.get('lastEmail');

        if (!storedToken || !storedEmail) {
            log.info('No hay sesión guardada, mostrando login');
            sendToUi('auth:show-login');
            return;
        }

        const result = await services.authService.validateToken(storedToken, storedEmail);

        if (result.success) {
            authState.isAuthenticated = true;
            authState.userToken = storedToken;
            authState.userData = {
                email: storedEmail,
                customerName: store.get('customerName'),
                customerId: store.get('customerId'),
                // validateToken acaba de actualizar este campo si cambió
                subscriptionEnd: store.get('subscriptionEnd')
            };

            log.info('Sesión restaurada automáticamente', { email: storedEmail });

            sendToUi('auth:authenticated', {
                email: storedEmail,
                token: storedToken,
                user: authState.userData
            });
            return;
        }

        if (result.code === 'NETWORK_ERROR') {
            // Sin red: no podemos verificar, pero tampoco descartar la sesión.
            // El token queda cacheado para que el próximo arranque (con red)
            // restaure la sesión sin pedir re-login.
            log.warn('No se pudo verificar el token por error de red, sesión local preservada', {
                error: result.error
            });
            sendToUi('auth:show-login');
            return;
        }

        // El backend confirmó que esta sesión ya no vale (token expirado,
        // suscripción inactiva, dispositivo bloqueado, etc.).
        log.info('Sesión rechazada por el backend, limpiando', {
            code: result.code,
            error: result.error
        });
        clearStoredAuth({ store, authState });
        sendToUi('auth:show-login');
    } catch (error) {
        // Excepción no esperada en este propio código (validateToken nunca tira
        // — siempre retorna envelope). Llegar acá es un bug; preferimos
        // forzar login antes que dejar al usuario en estado inconsistente.
        log.error('Error inesperado verificando autenticación', error);
        clearStoredAuth({ store, authState });
        sendToUi('auth:show-login');
    }
}

/**
 * Acción del menú "Cerrar sesión". Reusa el flujo de logout sin duplicar
 * la lógica que vive en el router IPC.
 *
 * @param {Object} deps
 * @param {Object} deps.services
 * @param {Object} deps.store
 * @param {Object} deps.authState
 * @param {Function} deps.getMainWindow
 */
export async function handleMenuLogout(deps) {
    const { services, store, authState, getMainWindow } = deps;
    try {
        await services.authService?.logout();
        clearStoredAuth({ store, authState });
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send('auth:logged-out');
        }
    } catch (error) {
        log.error('Error cerrando sesión desde el menú', error);
    }
}
