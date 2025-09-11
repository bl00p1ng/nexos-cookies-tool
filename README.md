# Sistema Automatizado de Pruebas de Carga Web

Aplicación de escritorio para Windows y Mac OS que se integra con el navegador de Ads Power de forma que abra perfiles del navegador y navegue por una serie de sitios web con el fin de solictar cookies

## Requisitos Previos

### Software Requerido
- **Node.js** 18.0.0 o superior
- **Ads Power** instalado y ejecutándose
- **Sistema Operativo**: Windows 10/11 o macOS 10.14+

### Hardware Recomendado
- **RAM**: 8GB mínimo, 16GB recomendado (para 10+ instancias)
- **Procesador**: Multi-core
- **Almacenamiento**: 2GB espacio libre
- **Conexión**: Internet estable

## Instalación

### 1. Clonar el Repositorio
```bash
git clone <repository-url>
cd web-load-testing-automation
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Configurar Ads Power
1. Abrir Ads Power
2. Asegurarse de que esté ejecutándose en el puerto por defecto (50325)
3. Crear o configurar perfiles de navegador según sea necesario

### 4. Verificar Instalación
```bash
npm run start check-adspower
```

## Uso

### Comandos Disponibles

#### Verificar Estado de Ads Power
```bash
npm start check-adspower
```
Verifica si Ads Power está ejecutándose y disponible.

#### Listar Perfiles Disponibles
```bash
npm start list-profiles
```
Muestra todos los perfiles configurados en Ads Power.

#### Obtener Información de Perfil
```bash
npm start profile-info <profileId>
```
Obtiene información detallada de un perfil específico.

#### Iniciar Perfil
```bash
npm start start-profile <profileId>
```
Inicia un perfil específico de Ads Power y conecta Playwright.

#### Detener Perfil
```bash
npm start stop-profile <profileId>
```
Detiene un perfil específico.

#### Obtener Sitios Web Aleatorios
```bash
npm start get-random-sites --count 10
```
Obtiene sitios web aleatorios de la base de datos para pruebas.

#### Estadísticas de Base de Datos
```bash
npm start db-stats
```
Muestra estadísticas de la base de datos de sitios web.

#### Limpiar Recursos
```bash
npm start cleanup
```
Detiene todos los perfiles activos y limpia recursos.

## Estructura del Proyecto

```
src/
├── core/
│   ├── adspower/
│   │   └── AdsPowerManager.js    # Gestión de perfiles Ads Power
│   ├── database/
│   │   └── DatabaseManager.js    # Gestión de base de datos SQLite
│   └── config/
│       └── ConfigManager.js      # Gestión de configuración
├── main.js                       # Aplicación principal CLI
data/
└── loadtest.db                   # Base de datos SQLite (se crea automáticamente)
config/
└── config.json                   # Archivo de configuración (se crea automáticamente)
```

## Configuración

El sistema crea automáticamente un archivo de configuración en `config/config.json` con valores por defecto:

```json
{
    "adspower": {
        "baseUrl": "http://local.adspower.com:50325/api/v1",
        "timeout": 30000,
        "retryAttempts": 3
    },
    "navigation": {
        "defaultCookieTarget": 2500,
        "maxPagesPerSite": 10,
        "minTimePerPage": 2000,
        "maxTimePerPage": 15000,
        "scrollDepthMin": 0.3,
        "scrollDepthMax": 0.9
    },
    "database": {
        "path": "./data/loadtest.db",
        "backupInterval": 86400000,
        "maxRetries": 3
    },
    "logging": {
        "level": "info",
        "saveToFile": true,
        "maxLogFiles": 5
    }
}
```

### Parámetros Configurables

- **defaultCookieTarget**: Cantidad objetivo de cookies por defecto (2500)
- **maxPagesPerSite**: Máximo de páginas a visitar por sitio
- **minTimePerPage/maxTimePerPage**: Rango de tiempo por página en ms
- **scrollDepthMin/Max**: Profundidad de scroll (0.0 a 1.0)

## Base de Datos

### Sitios Web Incluidos
El sistema incluye automáticamente una selección de sitios web populares:
- Sitios de noticias (BBC, CNN, Reuters, The Guardian)
- E-commerce (Amazon, eBay, Walmart)
- Tecnología (TechCrunch, Wired, The Verge)
- Referencia y social (Wikipedia, Reddit, Medium)

### Tablas de Base de Datos
- **websites**: Almacena sitios web disponibles
- **navigation_sessions**: Registra sesiones de navegación
- **site_visits**: Detalla visitas por sesión

## Desarrollo

### Modo Desarrollo
```bash
npm run dev
```
Ejecuta la aplicación en modo desarrollo con recarga automática.

### Estructura Modular
El código está organizado siguiendo:
- **Principios SOLID**
- **Screaming Architecture**
- **Separación de responsabilidades**
- **Comentarios en tercera persona**
- **Indentación de 4 espacios**

## Próximas Funcionalidades

### Sprint Actual (MVP)
- [x] Integración con Ads Power
- [x] Gestión de base de datos
- [x] CLI básica
- [ ] Detección de cookies
- [ ] Navegación automatizada

### Sprints Futuros
- [ ] Simulación de comportamiento humano
- [ ] Interfaz gráfica de usuario
- [ ] Reportes avanzados
- [ ] Sistema de autenticación
- [ ] Modelo SaaS

## Troubleshooting

### Ads Power No Disponible
```
❌ Ads Power no está disponible
```
**Solución**: Verificar que Ads Power esté ejecutándose y en el puerto 50325.

### Error de Conexión a Base de Datos
**Solución**: Verificar permisos de escritura en el directorio `data/`.

### Perfil No Inicia
**Solución**: Verificar que el ID del perfil existe y está configurado correctamente en Ads Power.

## Soporte

Para reportar problemas o solicitar funcionalidades:
1. Verificar que se cumplan todos los requisitos previos
2. Revisar la sección de troubleshooting
3. Ejecutar `npm start db-stats` para verificar el estado del sistema

## Licencia

Este proyecto está destinado para pruebas de carga legítimas y preparación de infraestructura para picos de tráfico.