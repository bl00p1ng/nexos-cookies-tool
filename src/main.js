#!/usr/bin/env node

import { Command } from 'commander';
import AdsPowerManager from './core/adspower/AdsPowerManager.js';
import DatabaseManager from './core/database/DatabaseManager.js';

const program = new Command();

/**
 * Aplicación principal CLI para el sistema de pruebas de carga web
 */
class LoadTestCLI {
    constructor() {
        this.adsPowerManager = new AdsPowerManager();
        this.databaseManager = new DatabaseManager();
    }

    /**
     * Inicializa la aplicación y configura los comandos CLI
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            // Inicializar base de datos
            await this.databaseManager.initialize();
            
            this.setupCommands();
            
        } catch (error) {
            console.error('Error inicializando aplicación:', error.message);
            process.exit(1);
        }
    }

    /**
     * Configura los comandos disponibles en la CLI
     */
    setupCommands() {
        program
            .name('load-test-cli')
            .description('Sistema automatizado de pruebas de carga web')
            .version('1.0.0');

        // Comando para verificar estado de Ads Power
        program
            .command('check-adspower')
            .description('Verifica si Ads Power está ejecutándose')
            .action(async () => {
                await this.checkAdsPowerStatus();
            });

        // Comando para listar perfiles disponibles
        program
            .command('list-profiles')
            .description('Lista todos los perfiles disponibles en Ads Power')
            .action(async () => {
                await this.listProfiles();
            });

        // Comando para obtener información de un perfil específico
        program
            .command('profile-info')
            .description('Obtiene información detallada de un perfil')
            .argument('<profileId>', 'ID del perfil')
            .action(async (profileId) => {
                await this.getProfileInfo(profileId);
            });

        // Comando para iniciar un perfil
        program
            .command('start-profile')
            .description('Inicia un perfil específico de Ads Power')
            .argument('<profileId>', 'ID del perfil a iniciar')
            .action(async (profileId) => {
                await this.startProfile(profileId);
            });

        // Comando para detener un perfil
        program
            .command('stop-profile')
            .description('Detiene un perfil específico')
            .argument('<profileId>', 'ID del perfil a detener')
            .action(async (profileId) => {
                await this.stopProfile(profileId);
            });

        // Comando para obtener sitios web aleatorios de la DB
        program
            .command('get-random-sites')
            .description('Obtiene sitios web aleatorios de la base de datos')
            .option('-c, --count <number>', 'Cantidad de sitios a obtener', '5')
            .action(async (options) => {
                await this.getRandomSites(parseInt(options.count));
            });

        // Comando para mostrar estadísticas de la base de datos
        program
            .command('db-stats')
            .description('Muestra estadísticas de la base de datos')
            .action(async () => {
                await this.showDatabaseStats();
            });

        // Comando para limpiar y salir
        program
            .command('cleanup')
            .description('Detiene todos los perfiles activos y limpia recursos')
            .action(async () => {
                await this.cleanup();
            });
    }

    /**
     * Verifica el estado de Ads Power
     */
    async checkAdsPowerStatus() {
        try {
            console.log('Verificando estado de Ads Power...');
            const isAvailable = await this.adsPowerManager.checkAdsPowerStatus();
            
            if (isAvailable) {
                console.log('✅ Ads Power está ejecutándose y disponible');
            } else {
                console.log('❌ Ads Power no está disponible');
                console.log('Asegúrate de que Ads Power esté ejecutándose en el puerto 50325');
            }
        } catch (error) {
            console.error('Error verificando Ads Power:', error.message);
        }
    }

    /**
     * Lista todos los perfiles disponibles
     */
    async listProfiles() {
        try {
            console.log('Obteniendo lista de perfiles...');
            const profiles = await this.adsPowerManager.getAvailableProfiles();
            
            if (profiles.length === 0) {
                console.log('No se encontraron perfiles disponibles');
                return;
            }

            console.log(`\nPerfiles disponibles (${profiles.length}):`);
            console.log('─'.repeat(60));
            
            profiles.forEach(profile => {
                console.log(`ID: ${profile.user_id || profile.serial_number || 'N/A'}`);
                console.log(`Nombre: ${profile.name || 'Sin nombre'}`);
                console.log(`Estado: ${profile.status || 'Desconocido'}`);
                console.log('─'.repeat(30));
            });
        } catch (error) {
            console.error('Error obteniendo perfiles:', error.message);
        }
    }

    /**
     * Obtiene información detallada de un perfil
     * @param {string} profileId - ID del perfil
     */
    async getProfileInfo(profileId) {
        try {
            console.log(`Obteniendo información del perfil ${profileId}...`);
            const profileInfo = await this.adsPowerManager.getProfileInfo(profileId);
            
            console.log('\nInformación del perfil:');
            console.log('─'.repeat(40));
            console.log(JSON.stringify(profileInfo, null, 2));
        } catch (error) {
            console.error('Error obteniendo información del perfil:', error.message);
        }
    }

    /**
     * Inicia un perfil específico
     * @param {string} profileId - ID del perfil a iniciar
     */
    async startProfile(profileId) {
        try {
            console.log(`Iniciando perfil ${profileId}...`);
            const browserInstance = await this.adsPowerManager.startProfile(profileId);
            
            console.log('✅ Perfil iniciado correctamente');
            console.log(`WebSocket: ${browserInstance.wsEndpoint}`);
            console.log(`Página actual: ${await browserInstance.page.url()}`);
            
            // Mantener el perfil activo por un momento para demostración
            console.log('\nPerfil activo. Presiona Ctrl+C para detener...');
            
            // Manejar cierre graceful
            process.on('SIGINT', async () => {
                console.log('\nDeteniendo perfil...');
                await this.adsPowerManager.stopProfile(profileId);
                await this.cleanup();
                process.exit(0);
            });
            
        } catch (error) {
            console.error('Error iniciando perfil:', error.message);
        }
    }

    /**
     * Detiene un perfil específico
     * @param {string} profileId - ID del perfil a detener
     */
    async stopProfile(profileId) {
        try {
            console.log(`Deteniendo perfil ${profileId}...`);
            await this.adsPowerManager.stopProfile(profileId);
            console.log('✅ Perfil detenido correctamente');
        } catch (error) {
            console.error('Error deteniendo perfil:', error.message);
        }
    }

    /**
     * Obtiene sitios web aleatorios de la base de datos
     * @param {number} count - Cantidad de sitios a obtener
     */
    async getRandomSites(count) {
        try {
            console.log(`Obteniendo ${count} sitios web aleatorios...`);
            const websites = await this.databaseManager.getRandomWebsites(count);
            
            if (websites.length === 0) {
                console.log('No se encontraron sitios web en la base de datos');
                return;
            }

            console.log(`\nSitios web obtenidos (${websites.length}):`);
            console.log('─'.repeat(80));
            
            websites.forEach((site, index) => {
                console.log(`${index + 1}. ${site.url}`);
                console.log(`   Dominio: ${site.domain}`);
                console.log(`   Categoría: ${site.category}`);
                console.log(`   Visitas: ${site.visit_count}`);
                console.log(`   Última visita: ${site.last_visited || 'Nunca'}`);
                console.log('─'.repeat(40));
            });
        } catch (error) {
            console.error('Error obteniendo sitios web:', error.message);
        }
    }

    /**
     * Muestra estadísticas de la base de datos
     */
    async showDatabaseStats() {
        try {
            console.log('Obteniendo estadísticas de la base de datos...');
            const websiteCount = await this.databaseManager.getWebsiteCount();
            
            console.log('\nEstadísticas de la base de datos:');
            console.log('─'.repeat(40));
            console.log(`Total de sitios web: ${websiteCount}`);
            
            // Obtener algunos sitios de muestra
            if (websiteCount > 0) {
                const sampleSites = await this.databaseManager.getRandomWebsites(3);
                console.log('\nMuestra de sitios disponibles:');
                sampleSites.forEach(site => {
                    console.log(`• ${site.domain} (${site.category})`);
                });
            }
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error.message);
        }
    }

    /**
     * Limpia recursos y cierra conexiones
     */
    async cleanup() {
        try {
            console.log('Limpiando recursos...');
            
            // Detener todos los perfiles activos
            await this.adsPowerManager.stopAllProfiles();
            
            // Cerrar base de datos
            await this.databaseManager.close();
            
            console.log('✅ Recursos limpiados correctamente');
        } catch (error) {
            console.error('Error en limpieza:', error.message);
        }
    }

    /**
     * Ejecuta la aplicación CLI
     */
    async run() {
        await this.initialize();
        program.parse();
    }
}

// Ejecutar aplicación
const app = new LoadTestCLI();
app.run().catch(error => {
    console.error('Error fatal:', error.message);
    process.exit(1);
});