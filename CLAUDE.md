# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Cookies Hexzor** (v1.3.0) is a desktop application (Windows/macOS) that integrates with AdsPower browser automation to collect cookies by navigating through websites. The application supports both a CLI mode for automation and an Electron GUI with authentication.

### Dual Execution Modes

The project has **two distinct entry points**:

1. **CLI Mode** ([src/main.js](src/main.js)): Command-line interface for direct automation tasks
2. **Electron GUI Mode** ([src/electron/main.js](src/electron/main.js)): Desktop application with authentication, user interface, and persistent configuration

**Important**: When making changes to core services (under [src/core/](src/core/)), ensure they work in both execution contexts.

## Development Commands

### Running the Application

```bash
# CLI mode - Direct execution
npm start <command> [options]
# or
node src/main.js <command> [options]

# GUI mode - Electron with auto-reload
npm run electron-dev

# GUI mode - Electron without dev server
npm run electron
```

### Building

```bash
# No build step needed for development
npm run build  # Just echoes a message

# Package for distribution
npm run electron-pack          # Uses preelectron-pack
npm run dist                   # Build without publishing
npm run build-win              # Windows package
npm run build-mac              # macOS package (DMG + ZIP)

# Publish to GitHub releases
npm run build-win -- --publish always
npm run build-mac -- --publish always
```

### Database Operations

```bash
# Reset database tables (SQLite)
sqlite3 data/loadtest.db "DELETE FROM site_visits; DELETE FROM navigation_sessions; DELETE FROM sqlite_sequence WHERE name IN ('navigation_sessions', 'site_visits');"

# View database stats
npm start db-stats

# Load websites from CSV
npm start load-csv <file.csv> [--overwrite] [--allow-duplicates]
```

### Clearing Packaged App Configuration

If packaged app config doesn't update:
- **Windows**: Delete `%APPDATA%\hexzor-cookies-tool`
- **macOS**: Delete `~/Library/Application Support/hexzor-cookies-tool/`

## Architecture

### Core Services Architecture

All core business logic lives in [src/core/](src/core/) and is shared between CLI and Electron modes:

```
src/core/
├── adspower/
│   └── AdsPowerManager.js       # Browser profile lifecycle & Playwright integration
├── auth/
│   ├── AuthService.js           # Authentication with backend API
│   └── deviceFingerprint.js     # Device identification for session control
├── config/
│   └── ConfigManager.js         # Configuration loading and management
├── database/
│   ├── DatabaseManager.js       # SQLite operations for websites/sessions
│   ├── CsvLoader.js             # Bulk website loading from CSV
│   └── initialWebsites.js       # Default website seed data
├── navigation/
│   ├── NavigationController.js  # Orchestrates multi-profile navigation
│   ├── HumanBehaviorSimulator.js    # Realistic human browsing patterns
│   ├── CookieDetector.js        # Cookie count detection
│   ├── CookieCounterManager.js  # Cookie counting per session
│   ├── ScrollSimulator.js       # Natural scrolling simulation
│   ├── MouseMovementSimulator.js # Mouse movement patterns
│   ├── LinkSelector.js          # Smart link selection
│   ├── TimingManager.js         # Timing randomization
│   ├── ContentAnalyzer.js       # Page content analysis
│   └── NavigationPatternGenerator.js # Navigation strategy patterns
└── utils/
    └── RequestQueue.js          # Rate-limited AdsPower API requests
```

### AdsPower Integration

- **AdsPowerManager** manages browser profiles via AdsPower's REST API (`http://local.adspower.net:50325/api/v1`)
- Uses **Playwright** to connect to browser sessions via WebSocket endpoints provided by AdsPower
- **RequestQueue** implements rate limiting (default: 1 req/sec) to prevent API throttling
- Supports concurrent profile execution (recommended max: 10 profiles)

### Navigation Flow

1. **NavigationController** coordinates multiple profile sessions in parallel
2. For each profile:
   - AdsPowerManager starts the browser profile
   - Playwright connects to the browser session
   - HumanBehaviorSimulator drives realistic navigation patterns
   - DatabaseManager tracks sessions and site visits
   - CookieDetector monitors cookie accumulation until target is reached
3. Sessions run independently until completion or error
4. Results are aggregated and reported

### Human Behavior Simulation

The navigation system simulates human-like browsing through:
- Random scroll depths (30%-90% of page)
- Variable timing between actions (2-15 seconds per page)
- Smart link selection based on content relevance
- Mouse movement simulation
- Navigation pattern variations (depth-first, breadth-first, mixed)

Configuration in [config/config.json](config/config.json):
```json
{
  "navigation": {
    "defaultCookieTarget": 2500,
    "maxPagesPerSite": 10,
    "minTimePerPage": 2000,
    "maxTimePerPage": 15000,
    "scrollDepthMin": 0.3,
    "scrollDepthMax": 0.9
  }
}
```

### Authentication System (Electron Mode Only)

- **AuthService** handles email-based authentication with device fingerprinting
- Backend URL configured in [config/config.json](config/config.json) under `auth.backendUrl`
- Device fingerprints ensure single-device sessions per account
- **electron-store** persists tokens and subscription data
- Authentication state is checked on app startup

### Database Schema

SQLite database at [data/loadtest.db](data/loadtest.db):
- **websites**: Available sites for navigation (url, domain, category, status)
- **navigation_sessions**: Session records per profile
- **site_visits**: Individual site visits within sessions

Uses WAL mode for concurrent access during multi-profile execution.

### Electron IPC Communication

The Electron app uses IPC for renderer ↔ main process communication:
- Authentication requests (`login`, `verify-code`, `logout`)
- Navigation control (`start-navigation`, `stop-navigation`)
- Profile management (`list-profiles`)
- Configuration access (`get-config`)

Handlers defined in [src/electron/main.js](src/electron/main.js), exposed via [src/electron/preload.js](src/electron/preload.js).

## Code Style Guidelines

- **Comments**: Third-person narrative (e.g., "Starts a browser profile")
- **Indentation**: 4 spaces
- **Architecture**: SOLID principles, Screaming Architecture, separation of concerns
- **ES Modules**: `import`/`export` syntax (Node.js `"type": "module"`)

## Configuration

### AdsPower URL Configuration (v1.3.0+)

The AdsPower base URL is now **user-configurable** through the GUI Settings panel:

- **Default URL**: `http://local.adspower.com:50325`
- **Storage**: Persisted in electron-store (not in config.json)
- **Auto-migration**: Users upgrading from v1.2.x automatically migrate their URL from config.json to electron-store
- **GUI Access**: Settings → AdsPower Connection → Update URL

The app automatically appends `/api/v1` to the base URL internally.

**For developers**: AdsPowerManager accepts the base URL as a constructor parameter. The URL is retrieved from electron-store in [src/electron/main.js](src/electron/main.js).

## Common Issues

### AdsPower Not Available
Ensure AdsPower is running on the configured port (default: `50325`). Check with:
```bash
npm start check-adspower
```

If AdsPower changes its port, update the URL in the GUI: **Settings → AdsPower Connection**

### Database Connection Errors
Verify write permissions in the [data/](data/) directory.

### Profile Won't Start
Confirm the profile ID exists in AdsPower:
```bash
npm start list-profiles
```

### Build Issues on macOS
The postinstall script handles `dmg-license` installation on macOS. If issues occur, manually install:
```bash
npm install dmg-license --no-save
```

## Testing Key Workflows

### Multi-Profile Navigation
```bash
# Single profile
npm start start-navigation <profileId> --cookies 100

# Multiple profiles (comma-separated)
npm start start-navigation <profileId1>,<profileId2>,<profileId3> --cookies 2500 --validate-profiles
```

### CSV Website Loading
```bash
# Load sites
npm start load-csv websites.csv --overwrite

# Expected CSV format:
# url,domain,category,status
# https://www.example.com,example.com,news,active
```
