# Mochi Project

> Working in this repository? Read **`AGENTS.md`** first. It is the binding
> standard for every agent and contributor: file-size limits, i18n placement,
> dependency policy, parallel-work protocol and the definition of done.

Mochi is an independent, high-performance web-first gaming and creator publishing platform. It delivers real-time 3D game playback directly in desktop and tablet browsers, paired with an integrated creator studio and a serverless edge backend.

---

## 1. System Overview

Mochi enables creators to build, package, publish, and distribute interactive 3D web games without requiring native binary downloads. Players access games instantly via modern web browsers with sub-second launch times and smooth frame pacing.

### Core Capabilities
- Web-First 3D Playback: WebGL2 and WebGPU graphics pipeline with decoupled 60Hz physics and up to 120Hz display interpolation.
- Creator Publishing Studio: Browser-based authoring, asset bundling, integrity hashing, and one-click cloud deployment.
- Edge-Native Cloud: Serverless Cloudflare Workers API, D1 relational database, R2 content-addressed storage, and Durable Objects for real-time multiplayer state.
- Zero-Code Domain Portability: Fully parameterized infrastructure allowing seamless migration from staging domains to any custom domain.

---

## 2. Workspace Architecture

The repository is structured into two completely decoupled sub-projects:

```
Mochi Project/
|-- mochi/                    # Frontend Web Client, 3D Runtime & Studio
|   |-- package.json
|   |-- tsconfig.json
|   |-- vite.config.ts
|   |-- index.html
|   `-- src/
|       |-- app/              # Router, layout shell, providers
|       |-- components/       # Reusable UI controls and navigation
|       |-- engine/           # 3D game player runtime and loop
|       |-- studio/           # Creator authoring and manifest editor
|       |-- services/         # Parameterized API client
|       `-- types/            # TypeScript data contracts
|
|-- mochi-cloud/              # Standalone Cloudflare Workers Backend
|   |-- package.json
|   |-- wrangler.jsonc        # Worker bindings (D1, R2, DO)
|   |-- tsconfig.json
|   |-- migrations/           # D1 relational database schemas
|   `-- src/
|       |-- index.ts          # Worker entry point and router
|       |-- config/           # Parameterized environment bindings
|       |-- middleware/       # Dynamic CORS, auth, error handling
|       |-- routes/           # REST endpoints (health, auth, games, assets)
|       |-- objects/          # Durable Objects (GameRoom real-time state)
|       |-- services/         # D1 database and R2 storage services
|       `-- types/            # API models and request/response types
|
`-- docs/                     # Technical Architecture Documentation Suite
    |-- ARCHITECTURE.md       # System blueprint and topology
    |-- RUNTIME.md            # 3D player engine and loop mechanics
    |-- PUBLISHING.md         # Creator publishing and bundle specification
    |-- ROADMAP.md            # Web-first foundation to mobile progression
    `-- MIGRATION.md          # Domain rebinding and DNS cutover runbook
```

---

## 3. Decoupling and Isolation Invariants

Mochi is designed as a standalone platform with strict architectural boundaries:
- Zero External Code Coupling: No runtime imports, build dependencies, or shared schemas with external projects.
- Independent Lifecycle: `mochi` and `mochi-cloud` possess separate `package.json`, `tsconfig.json`, and deployment pipelines.
- Parameterized Networking: Origin headers, API endpoints, CDN URLs, and cookie scopes are configured exclusively via environment variables.

---

## 4. Quickstart Guide

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0
- Cloudflare Wrangler CLI (for backend development)
- Rust + `wasm32-unknown-unknown` target (only when changing `mochi-physics-wasm`)

### Rebuilding the physics kernel
```bash
npm run build:wasm
```
Compiles the Rust crate, copies `mochi_physics_wasm.wasm` into `mochi/public/wasm`,
and verifies the exported kernel surface.

### Setting Up the Frontend (`mochi`)
1. Navigate to the client directory:
   ```bash
   cd mochi
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Start the local development server:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:5173` in a desktop or tablet browser.

### Setting Up the Backend (`mochi-cloud`)
1. Navigate to the cloud directory:
   ```bash
   cd mochi-cloud
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Apply local database migrations:
   ```bash
   npx wrangler d1 migrations apply mochi-db --local
   ```
4. Start the local Worker runtime:
   ```bash
   npm run dev
   ```
5. Verify health check at `http://localhost:8787/api/v1/health`.

---

## 5. Environment Configuration

### Frontend Variables (`mochi/.env`)
| Variable | Description | Default Development Value |
|----------|-------------|---------------------------|
| `VITE_API_URL` | Base URL for mochi-cloud API | `http://localhost:8787` |
| `VITE_CDN_URL` | Base URL for R2 game assets | `http://localhost:8787/assets` |
| `VITE_APP_URL` | Canonical web app origin | `http://localhost:5173` |
| `VITE_ACCESS_ASSETS_URL` | Origin for creator-uploaded access assets (empty = same origin) | `https://access-game.lenout.com` |

### Backend Variables (`mochi-cloud/wrangler.jsonc`)
| Variable | Description | Production Staging Value |
|----------|-------------|--------------------------|
| `APP_ORIGIN` | Web client domain | `https://game.lenout.com` |
| `API_ORIGIN` | API worker domain | `https://api-game.lenout.com` |
| `CDN_ORIGIN` | Asset delivery domain | `https://cdn-game.lenout.com` |
| `ACCESS_ASSETS_URL` | Dedicated origin for creator-uploaded assets (rebind to migrate domains) | `https://access-game.lenout.com` |
| `CORS_ALLOWED_ORIGINS` | Comma-delimited CORS whitelist | `https://game.lenout.com,http://localhost:5173` |

---

## 6. Documentation Suite

Detailed architectural specifications are maintained in the `docs/` directory:
- [System Architecture](docs/ARCHITECTURE.md): System blueprint, client-edge-cloud topology, data flows, and security model.
- [Game Runtime Specification](docs/RUNTIME.md): 3D player engine, 60Hz physics / 120Hz display interpolation loop, asset streaming, and sandboxing.
- [Publishing Lifecycle](docs/PUBLISHING.md): Bundle manifest specification (`mochi-game.json`), SHA-256 asset verification, and CDN caching.
- [Platform Roadmap](docs/ROADMAP.md): Evolutionary path from web-first desktop/tablet to PWA and Capacitor native containers.
- [Domain Migration Runbook](docs/MIGRATION.md): Step-by-step checklist to rebind temporary subdomains to any custom domain.

---

## 7. License

This project is licensed under the MIT License. All source code and algorithmic implementations are clean-room and commercially safe.
