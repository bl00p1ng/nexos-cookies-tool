import pkg from 'node-machine-id';
const { machineIdSync } = pkg;
import os from 'os';
import crypto from 'crypto';

/**
 * Módulo de Device Fingerprinting para Cookies Hexzor
 * Genera identificadores únicos y persistentes del dispositivo para implementar
 * sesión única por dispositivo
 */

/**
 * Genera un device fingerprint único basado en características del sistema
 * Este fingerprint es consistente entre ejecuciones en el mismo dispositivo
 *
 * @returns {string} Hash SHA-256 del fingerprint (64 caracteres hexadecimales)
 */
export function generateDeviceFingerprint() {
    try {
        // 1. Obtener ID único de la máquina (persistente entre reinicios)
        const machineId = machineIdSync();

        // 2. Recopilar información adicional del sistema
        const systemInfo = {
            machineId,                          // ID único del hardware
            hostname: os.hostname(),             // Nombre del equipo
            platform: os.platform(),             // win32, darwin, linux
            arch: os.arch(),                     // x64, arm64, etc.
            cpus: os.cpus().length,              // Número de CPUs
            totalMemory: os.totalmem(),          // Memoria total en bytes
            networkInterfaces: getFirstMacAddress() // MAC address
        };

        // 3. Crear hash SHA-256 del objeto completo
        const fingerprintString = JSON.stringify(systemInfo);
        const hash = crypto
            .createHash('sha256')
            .update(fingerprintString)
            .digest('hex');

        return hash;

    } catch (error) {
        console.error('Error generando device fingerprint:', error);

        // Fallback: usar solo machine ID si falla algo
        try {
            const machineId = machineIdSync();
            return crypto
                .createHash('sha256')
                .update(machineId)
                .digest('hex');
        } catch (fallbackError) {
            console.error('Error crítico en fallback de fingerprint:', fallbackError);
            throw new Error('No se pudo generar device fingerprint');
        }
    }
}

/**
 * Obtiene la primera MAC address válida de las interfaces de red
 * Ignora loopback y direcciones virtuales
 *
 * @returns {string|null} MAC address o null si no se encuentra
 */
function getFirstMacAddress() {
    const interfaces = os.networkInterfaces();

    for (const name in interfaces) {
        const iface = interfaces[name];
        for (const addr of iface) {
            // Filtrar interfaces no válidas
            if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
                return addr.mac;
            }
        }
    }

    return null;
}

/**
 * Cache del fingerprint en memoria para evitar regenerarlo en cada request
 * Se genera una vez por sesión de la aplicación
 */
let cachedFingerprint = null;

/**
 * Obtiene el fingerprint (desde cache o genera uno nuevo)
 * Esta es la función que debes usar en tu código
 *
 * @returns {string} Device fingerprint
 */
export function getDeviceFingerprint() {
    if (!cachedFingerprint) {
        cachedFingerprint = generateDeviceFingerprint();
        console.log('Device Fingerprint generado:', cachedFingerprint.substring(0, 16) + '...');
    }

    return cachedFingerprint;
}

/**
 * Limpia el cache del fingerprint (útil para testing)
 * NO usar en producción
 */
export function clearFingerprintCache() {
    cachedFingerprint = null;
}
