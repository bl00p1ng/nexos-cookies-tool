import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

/**
 * Utilidad para cargar sitios web desde archivos CSV
 * Permite importación masiva y sobrescritura de la base de datos
 */
class CsvLoader {
    constructor(databaseManager) {
        this.databaseManager = databaseManager;
        this.validCategories = [
            'news', 'ecommerce', 'tech', 'blog', 'social', 
            'reference', 'entertainment', 'finance', 'sports', 'general'
        ];
        this.validStatuses = ['active', 'inactive'];
        this.stats = {
            processed: 0,
            inserted: 0,
            updated: 0,
            errors: 0,
            duplicates: 0
        };
    }

    /**
     * Carga sitios web desde un archivo CSV
     * @param {string} csvFilePath - Ruta al archivo CSV
     * @param {Object} options - Opciones de importación
     * @returns {Promise<Object>} Resultado de la importación
     */
    async loadSitesFromCsv(csvFilePath, options = {}) {
        const {
            overwrite = false,           // Si true, sobrescribe toda la tabla
            skipDuplicates = true,       // Si true, omite URLs duplicadas
            validateUrls = true,         // Si true, valida formato de URLs
            batchSize = 100              // Tamaño del lote para inserciones
        } = options;

        try {
            console.log(`📂 Cargando sitios desde: ${csvFilePath}`);
            console.log(`   Opciones: overwrite=${overwrite}, skipDuplicates=${skipDuplicates}`);

            // Verificar que el archivo existe
            await this.validateCsvFile(csvFilePath);

            // Si overwrite es true, limpiar tabla existente
            if (overwrite) {
                console.log('🗑️  Limpiando tabla de sitios web existente...');
                await this.clearWebsitesTable();
            }

            // Parsear CSV y obtener datos
            const websites = await this.parseCsvFile(csvFilePath);
            console.log(`📊 Total de registros en CSV: ${websites.length}`);

            // Validar datos
            const validWebsites = await this.validateWebsites(websites, validateUrls);
            console.log(`✅ Registros válidos: ${validWebsites.length}`);

            // Procesar en lotes
            await this.processBatches(validWebsites, batchSize, skipDuplicates);

            // Mostrar estadísticas finales
            this.showFinalStats();

            return {
                success: true,
                stats: { ...this.stats },
                totalProcessed: this.stats.processed,
                message: `Importación completada: ${this.stats.inserted} insertados, ${this.stats.updated} actualizados`
            };

        } catch (error) {
            console.error('❌ Error cargando CSV:', error.message);
            throw error;
        }
    }

    /**
     * Valida que el archivo CSV existe y es accesible
     * @param {string} csvFilePath - Ruta al archivo CSV
     * @returns {Promise<void>}
     */
    async validateCsvFile(csvFilePath) {
        try {
            const stats = await fs.stat(csvFilePath);
            if (!stats.isFile()) {
                throw new Error('La ruta especificada no es un archivo válido');
            }
            
            const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`   Tamaño del archivo: ${fileSizeMB} MB`);
            
            if (stats.size === 0) {
                throw new Error('El archivo CSV está vacío');
            }
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Archivo CSV no encontrado: ${csvFilePath}`);
            }
            throw error;
        }
    }

    /**
     * Parsea el archivo CSV y retorna los datos
     * @param {string} csvFilePath - Ruta al archivo CSV
     * @returns {Promise<Array>} Array de objetos con datos del CSV
     */
    async parseCsvFile(csvFilePath) {
        return new Promise((resolve, reject) => {
            const websites = [];
            const parser = parse({
                columns: true,              // Usar primera fila como headers
                skip_empty_lines: true,     // Omitir líneas vacías
                trim: true,                 // Remover espacios en blanco
                delimiter: ',',             // Delimitador de columnas
                quote: '"',                 // Caracter de quote
                escape: '"'                 // Caracter de escape
            });

            parser.on('readable', function() {
                let record;
                while (record = parser.read()) {
                    websites.push(record);
                }
            });

            parser.on('error', function(err) {
                reject(new Error(`Error parseando CSV: ${err.message}`));
            });

            parser.on('end', function() {
                resolve(websites);
            });

            // Crear stream del archivo
            const stream = createReadStream(csvFilePath);
            stream.on('error', (err) => {
                reject(new Error(`Error leyendo archivo: ${err.message}`));
            });

            stream.pipe(parser);
        });
    }

    /**
     * Valida los datos del CSV
     * @param {Array} websites - Array de sitios web del CSV
     * @param {boolean} validateUrls - Si debe validar formato de URLs
     * @returns {Promise<Array>} Array de sitios web válidos
     */
    async validateWebsites(websites, validateUrls) {
        const validWebsites = [];
        
        console.log('🔍 Validando registros...');
        
        for (let i = 0; i < websites.length; i++) {
            const site = websites[i];
            const rowNumber = i + 2; // +2 porque fila 1 son headers y contamos desde 1
            
            try {
                // Verificar campos requeridos
                if (!site.url || !site.domain || !site.category || !site.status) {
                    throw new Error('Campos requeridos faltantes (url, domain, category, status)');
                }

                // Limpiar y normalizar datos
                const cleanSite = {
                    url: site.url.trim(),
                    domain: site.domain.trim().toLowerCase(),
                    category: site.category.trim().toLowerCase(),
                    status: site.status.trim().toLowerCase()
                };

                // Validar URL si está habilitado
                if (validateUrls) {
                    try {
                        new URL(cleanSite.url);
                        
                        // Verificar que el dominio coincida con la URL
                        const urlDomain = new URL(cleanSite.url).hostname.replace('www.', '');
                        const csvDomain = cleanSite.domain.replace('www.', '');
                        
                        if (urlDomain !== csvDomain) {
                            console.warn(`   ⚠️  Fila ${rowNumber}: Dominio no coincide con URL (${urlDomain} vs ${csvDomain})`);
                        }
                    } catch (urlError) {
                        throw new Error(`URL inválida: ${cleanSite.url}`);
                    }
                }

                // Validar categoría
                if (!this.validCategories.includes(cleanSite.category)) {
                    console.warn(`   ⚠️  Fila ${rowNumber}: Categoría inválida '${cleanSite.category}', usando 'general'`);
                    cleanSite.category = 'general';
                }

                // Validar status
                if (!this.validStatuses.includes(cleanSite.status)) {
                    console.warn(`   ⚠️  Fila ${rowNumber}: Status inválido '${cleanSite.status}', usando 'active'`);
                    cleanSite.status = 'active';
                }

                validWebsites.push(cleanSite);

            } catch (error) {
                console.error(`   ❌ Fila ${rowNumber}: ${error.message}`);
                this.stats.errors++;
            }
        }

        return validWebsites;
    }

    /**
     * Procesa los sitios web en lotes
     * @param {Array} websites - Sitios web válidos
     * @param {number} batchSize - Tamaño del lote
     * @param {boolean} skipDuplicates - Si omitir duplicados
     * @returns {Promise<void>}
     */
    async processBatches(websites, batchSize, skipDuplicates) {
        console.log('💾 Procesando e insertando en base de datos...');
        
        for (let i = 0; i < websites.length; i += batchSize) {
            const batch = websites.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(websites.length / batchSize);
            
            console.log(`   Procesando lote ${batchNumber}/${totalBatches} (${batch.length} registros)`);
            
            for (const site of batch) {
                await this.insertOrUpdateWebsite(site, skipDuplicates);
                this.stats.processed++;
            }
            
            // Mostrar progreso cada 5 lotes
            if (batchNumber % 5 === 0) {
                console.log(`   Progreso: ${this.stats.processed}/${websites.length} procesados`);
            }
        }
    }

    /**
     * Inserta o actualiza un sitio web individual
     * @param {Object} site - Datos del sitio web
     * @param {boolean} skipDuplicates - Si omitir duplicados
     * @returns {Promise<void>}
     */
    async insertOrUpdateWebsite(site, skipDuplicates) {
        try {
            // Verificar si ya existe
            const existing = await this.databaseManager.db.getAsync(
                'SELECT id FROM websites WHERE url = ?',
                [site.url]
            );

            if (existing) {
                if (skipDuplicates) {
                    this.stats.duplicates++;
                    return;
                } else {
                    // Actualizar registro existente
                    await this.databaseManager.db.runAsync(`
                        UPDATE websites 
                        SET domain = ?, category = ?, status = ?
                        WHERE url = ?
                    `, [site.domain, site.category, site.status, site.url]);
                    
                    this.stats.updated++;
                }
            } else {
                // Insertar nuevo registro
                await this.databaseManager.db.runAsync(`
                    INSERT INTO websites (url, domain, category, status) 
                    VALUES (?, ?, ?, ?)
                `, [site.url, site.domain, site.category, site.status]);
                
                this.stats.inserted++;
            }

        } catch (error) {
            console.error(`   Error procesando ${site.url}:`, error.message);
            this.stats.errors++;
        }
    }

    /**
     * Limpia la tabla de sitios web
     * @returns {Promise<void>}
     */
    async clearWebsitesTable() {
        try {
            await this.databaseManager.db.runAsync('DELETE FROM websites');
            console.log('   ✅ Tabla de sitios web limpiada');
        } catch (error) {
            console.error('   ❌ Error limpiando tabla:', error.message);
            throw error;
        }
    }

    /**
     * Muestra estadísticas finales
     */
    showFinalStats() {
        console.log('\n📊 Estadísticas de importación:');
        console.log('─'.repeat(40));
        console.log(`   Registros procesados: ${this.stats.processed}`);
        console.log(`   Insertados: ${this.stats.inserted}`);
        console.log(`   Actualizados: ${this.stats.updated}`);
        console.log(`   Duplicados omitidos: ${this.stats.duplicates}`);
        console.log(`   Errores: ${this.stats.errors}`);
        console.log('─'.repeat(40));
    }

    /**
     * Genera un CSV de ejemplo
     * @param {string} outputPath - Ruta donde guardar el ejemplo
     * @returns {Promise<void>}
     */
    async generateExampleCsv(outputPath) {
        const exampleData = [  
            'url,domain,category,status',
            'https://www.elespectador.com/,elespectador.com,news,active',
            'https://www.espn.com.co/,espn.com.co,sports,active',
            'https://cnnespanol.cnn.com/,cnnespanol.cnn.com,news,active',
            'https://www.lemonde.fr/,lemonde.fr,news,active',
            'https://www.20minutos.es/,20minutos.es,news,active',
            'https://www.nytimes.com/es/,nytimes.com,news,active',
            'https://www.theportugalnews.com/,theportugalnews.com,news,active',
            'https://www.nbcnews.com/,nbcnews.com,news,active',
            'https://abcnews.go.com/,abcnews.go.com,news,active',
            'https://www.washingtonpost.com/,washingtonpost.com,news,active',
            'https://www.larazon.es/,larazon.es,news,active',
            'https://www.3djuegos.com/,3djuegos.com,entertainment,active',
            'https://www.economist.com/,economist.com,news,active',
            'https://edition.cnn.com/,edition.cnn.com,news,active',
            'https://elpais.com/,elpais.com,news,active',
            'https://www.tennis.com.co/,tennis.com.co,sports,active',
            'https://www.alibaba.com/,alibaba.com,ecommerce,active',
        ].join('\n');

        await fs.writeFile(outputPath, exampleData, 'utf8');
        console.log(`✅ CSV de ejemplo generado en: ${outputPath}`);
    }

    /**
     * Resetea las estadísticas
     */
    resetStats() {
        this.stats = {
            processed: 0,
            inserted: 0,
            updated: 0,
            errors: 0,
            duplicates: 0
        };
    }
}

export default CsvLoader;