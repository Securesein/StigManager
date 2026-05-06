# STIG Manager

Desktop app voor het beheren, annoteren en vergelijken van DISA STIGs over versies.  
Ondersteunt iOS en Android Enterprise STIGs. Draait lokaal — geen cloud, geen telemetrie.

## Vereisten

- Node.js 20+
- npm 10+

## Installeren

```bash
npm install --ignore-scripts
node node_modules/electron/install.js
npx @electron/rebuild -f -w better-sqlite3
```

> `better-sqlite3` is een native module en moet gecompileerd worden voor Electron's interne Node-versie, niet de systeem Node. `--ignore-scripts` voorkomt dat better-sqlite3 tijdens de install voor de verkeerde versie compileert; de laatste twee stappen downloaden Electron en herbouwen de module correct.

## Ontwikkelen

```bash
npm run dev
```

Start Vite (renderer) en Electron tegelijk. Electron wacht tot de dev-server beschikbaar is.

## Bouwen

```bash
npm run build
```

Produceert een `.dmg` (macOS) en/of een NSIS-installer (Windows) in de `release/` map.

## Projectstructuur

```
STIG/
├── main/
│   ├── index.js      # Electron main process
│   ├── preload.js    # Veilige IPC-brug naar renderer
│   ├── ipc.js        # IPC handlers
│   ├── db.js         # SQLite schema + query helpers
│   ├── parser.js     # XML/XCCDF en CSV import
│   └── matcher.js    # Gelaagd versie-matching algoritme
├── renderer/
│   ├── index.html
│   ├── index.css     # Tailwind entry
│   ├── main.jsx      # React entry point
│   ├── pages/        # Dashboard, RuleList, RuleDetail, VersionCompare
│   └── components/   # Sidebar, RuleRow, TimerBadge
├── shared/
│   └── constants.js  # Confidence drempels, status-enums
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── electron-builder.yml
```

## Matching algoritme

Bij het importeren van een nieuwe STIG-versie vergelijkt de matcher automatisch met de vorige versie:

| Laag | Methode          | Confidence |
|------|-----------------|-----------|
| 1    | Exact Vuln-ID   | 1.00      |
| 2    | Exact STIG-ID   | 0.95      |
| 3    | Exacte titel    | 0.85      |
| 4    | Fuzzy titel     | variabel  |
| 5    | Geen match      | 0.00      |

Annotaties worden automatisch overgenomen bij confidence ≥ 0.85.  
Bij 0.75–0.85 worden ze overgenomen maar gemarkeerd als "vereist controle".
