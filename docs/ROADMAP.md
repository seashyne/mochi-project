# Mochi Platform: Evolutionary Technical Roadmap

This roadmap defines the multi-phase progression of Mochi from its initial web-first desktop and tablet foundation to Progressive Web App (PWA) distribution and native hybrid containers for iOS and Android.

---

## 1. Strategic Phasing Overview

Mochi adopts a strict "web-first, zero-rewrite" progression strategy. Core rendering, game physics, studio authoring, and networking logic are implemented exclusively in web-standard technologies (TypeScript, WebGL2, WebGPU, WebAudio, WebSockets). Mobile and native distributions act strictly as thin container wrappers over the unified web codebase.

```
+-------------------------------------------------------------------------+
|                       STRATEGIC PLATFORM PHASES                         |
|                                                                         |
|  [Phase 1] Web-First Desktop & Tablet Foundation (Current Core)         |
|  * Universal browser runtime (WebGL2/WebGPU)                            |
|  * 60Hz physics / 120Hz display loop                                    |
|  * Creator Studio prototype & Edge API                                  |
|       |                                                                 |
|       v                                                                 |
|  [Phase 2] Progressive Web App (PWA) & Offline Playback                 |
|  * Web App Manifest & Service Worker caching                            |
|  * Background asset synchronization                                     |
|  * Standalone window chrome & install prompts                           |
|       |                                                                 |
|       v                                                                 |
|  [Phase 3] Native Containers for Mobile & Tablet (Capacitor v6+)        |
|  * iOS (App Store) & Android (Google Play) shells                       |
|  * Native haptics, safe area insets, orientation locks                  |
|  * In-App Purchases (StoreKit & Google Play Billing)                    |
|       |                                                                 |
|       v                                                                 |
|  [Phase 4] Visual Creator Studio & Social Ecosystem                     |
|  * In-browser 3D scene composer & node-based visual scripting           |
|  * Multiplayer matchmaking & social lobbies via Durable Objects         |
|  * Creator monetization and analytics dashboard                         |
+-------------------------------------------------------------------------+
```

---

## 2. Phase 1: Web-First Desktop & Tablet Foundation

### Focus Areas
- Target Form Factors: Modern Desktop browsers (macOS, Windows, Linux) and Tablet browsers (iPadOS Safari, Android Chrome).
- Target Browsers: Chromium (Chrome, Edge) >= 110, Safari >= 16.4, Firefox >= 115.
- Graphics & Physics:
  - WebGL2 baseline with automatic WebGPU feature detection.
  - Accumulator-based 60Hz deterministic physics engine with variable-refresh interpolation up to 120Hz.
- Input Modalities:
  - Unified input system mapping Keyboard/Mouse, Stylus (Apple Pencil, S-Pen), Touch gestures, and HTML5 Gamepad controllers.
- Creator Studio MVP:
  - Game metadata editor, static bundle packager, presigned R2 upload client, and single-click edge deployment.
- Edge Infrastructure:
  - Cloudflare Workers REST API, D1 relational store, R2 asset storage, and GameRoom Durable Objects.

---

## 3. Phase 2: Progressive Web App (PWA)

### Focus Areas
- Web App Manifest:
  - Standalone display mode (`display: "standalone"`), dark theme tokens (`#090b10`), and multi-density maskable icon sets.
- Service Worker & Caching:
  - Workbox-powered Service Worker implementing:
    - Cache-First with Cache-Expiration for versioned game assets (`/assets/...`).
    - Stale-While-Revalidate for catalog feeds and manifests.
    - Network-Only with graceful offline fallback for authenticated mutations.
- Offline Playback Capability:
  - Pre-cached games run offline directly from IndexedDB without requiring an active internet connection.
- Install Ergonomics:
  - Unobtrusive customized install banners for Safari (iOS/iPadOS "Add to Home Screen") and Chromium ("Install Mochi").

---

## 4. Phase 3: Native Containers via Capacitor (iOS & Android)

### Focus Areas
- Container Architecture:
  - Thin, lightweight native shell using Capacitor v6+ wrapping the responsive `mochi` web bundle.
  - Zero code duplication: 100% of game runtime and studio code is shared between Web and Native.
- Native Hardware Integrations:
  - Haptics: Tactile feedback on collision, jump, and user actions via `@capacitor/haptics`.
  - Screen Orientation: Forced landscape or portrait mode per game manifest via `@capacitor/screen-orientation`.
  - Status Bar & Safe Area: Seamless viewport inset handling for iPhone dynamic islands, iPad home bars, and Android display cutouts.
  - Splash Screen: Smooth native-to-web visual transition via `@capacitor/splash-screen`.
- Store Compliance and In-App Monetization:
  - Apple App Store and Google Play Store packaging.
  - Native in-app purchase bridging (Apple StoreKit 2 and Google Play Billing) communicating via the existing typed RPC bridge.

```
+-------------------------------------------------------------------------+
|                  NATIVE CONTAINER TOPOLOGY (PHASE 3)                    |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | NATIVE MOBILE OS LAYER (iOS / Android)                            |  |
|  | Hardware Haptics | Screen Orientation | StoreKit | Play Billing   |  |
|  +---------------------------------+---------------------------------+  |
|                                    | Capacitor Plugin Bridge            |
|                                    v                                    |
|  +-------------------------------------------------------------------+  |
|  | EMBEDDED HIGH-PERFORMANCE WEBVIEW (WKWebView / Android WebView)   |  |
|  | - Mochi Web Shell (React 19 / Vite App)                           |  |
|  | - 3D Game Runtime Canvas (WebGL2 / WebGPU)                         |  |
|  | - IndexedDB L2 Asset Store & Service Worker Offline Cache         |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

---

## 5. Phase 4: Visual Creator Studio & Social Ecosystem

### Focus Areas
- Browser-Based 3D Visual Composer:
  - Three.js/WebGPU-powered scene viewport with transform gizmos, material inspector, and glTF drop-zone.
- Node-Based Visual Scripting:
  - Drag-and-drop gameplay logic nodes compiled to lightweight deterministic bytecode executed by the sandboxed runtime.
- Real-Time Multiplayer Infrastructure:
  - Durable Object game rooms with automatic region routing, lobby matchmaking, and state broadcast.
- Creator Marketplace & Analytics:
  - Real-time play counter, telemetry metrics (FPS, session length, crash reports), and digital credit licensing payouts.

---

## 6. Platform Compatibility Matrix

| Capability | Phase 1 (Web) | Phase 2 (PWA) | Phase 3 (Capacitor) | Phase 4 (Social) |
|------------|---------------|---------------|----------------------|------------------|
| Desktop Browser Playback | Full | Full | N/A | Full |
| Tablet Browser Playback  | Full | Full | N/A | Full |
| Offline Game Execution   | Partial | Full | Full | Full |
| Home Screen Launching    | Browser Bookmark | Native PWA Icon | App Store Binary | App Store Binary |
| Native Device Haptics    | Web Vibration | Web Vibration | Native Taptic API | Native Taptic API |
| Store Monetization       | Web Stripe | Web Stripe | Apple/Google IAP | Multi-Platform |
| Real-time Multiplayer    | Prototype | Full | Full | Advanced Lobbies |
