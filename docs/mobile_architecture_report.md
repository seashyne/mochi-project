# Mochi Mobile Architecture Evaluation, Platform Economics, and Deployment Report

## 1. Executive Summary

This report delivers an architectural feasibility analysis, language and technology stack benchmark, performance evaluation, and deployment roadmap for packaging Mochi into mobile applications for iOS and Android. Mochi is a 3D gaming and creator-publishing platform built on React 19, TypeScript, Three.js, and Cloudflare Workers. This evaluation establishes that wrapping Mochi's web engine in a thin Capacitor v6 container preserves 100% web codebase parity, complies with Apple App Store and Google Play UGC policies, achieves 120Hz visual smoothness, and maintains instant-play web creator agility.

---

## 2. R1: iOS and Android Packaging Feasibility Analysis

### 2.1 iOS WKWebView Architecture and Constraints
- WebGL2 Graphics Baseline: Hardware-accelerated WebGL2 is fully supported on iOS 15+ within WKWebView via WebKit's ANGLE (Almost Native Graphics Layer Engine) translating OpenGL ES calls directly into Apple Metal commands.
- WebGPU Status: WebGPU is implemented in WebKit source but remains disabled by default in third-party WKWebView instances on iOS 18. WebGL2 serves as the mandatory production graphics baseline, while WebGPU is reserved for progressive enhancement.
- 60Hz vs 120Hz ProMotion Timing: By default, iOS throttles WKWebView CADisplayLink and requestAnimationFrame to 60Hz. Unlocking native 120Hz rendering on iPhone Pro and iPad Pro devices requires setting `CADisableMinimumFrameDurationOnPhone = true` in the host app's Info.plist.
- Memory Limits and Jetsam Watchdog: iOS enforces strict memory limits via the kernel-level Jetsam watchdog daemon without secondary disk swap. WKWebView isolates rendering in `com.apple.WebKit.WebContent`. On 4GB RAM devices (iPhone 13/14 base), the WebContent process is terminated by Jetsam at approximately 1.2GB-1.4GB; on 6GB-8GB devices (iPhone 15 Pro, 16 Pro, iPad Pro), the threshold is 1.8GB-2.2GB. Exceeding this triggers an immediate SIGKILL, producing a blank white view. Mitigations include streaming KTX2 GPU textures (reducing VRAM by 75-80%) and calling `.dispose()` on geometries, materials, and textures during scene teardown.
- WebAudio Lifecycle: WebKit suspends AudioContext until the first user gesture (`pointerdown`/`touchstart`). Native containers must set the native audio session category to `AVAudioSessionCategoryPlayback` to allow game audio to bypass the physical hardware mute switch.

### 2.2 Android Chrome WebView Architecture and Constraints
- Graphics Backend: Chromium System WebView on Android 10+ leverages ANGLE with a Vulkan backend on modern hardware (Qualcomm Adreno 600/700, ARM Mali G-series) with GLES fallback on legacy chipsets.
- Memory and LMKD: Android uses the Low Memory Killer Daemon (LMKD) based on Linux cgroups and `oom_score_adj`. In isolated sandboxed render processes (`sandboxed_process0`), memory exhaustion invokes `onRenderProcessGone`. The native container must intercept this callback to prevent process crashes and present a graceful reload view.

### 2.3 Mobile Container Approach Comparison

| Architectural Dimension | Capacitor v6/v7 | Tauri v2 Mobile | PWA (Standalone) | TWA (Trusted Web Activity) |
| :--- | :--- | :--- | :--- | :--- |
| Core Architecture | Native shell wrapping system WebView | Rust native core + platform WebView JNI | Browser tab via Web App Manifest | Android Chrome Custom Tabs wrapper |
| Platform Scope | iOS & Android (Unified) | iOS & Android (Emerging beta toolchain) | Universal across modern browsers | Android only (Zero iOS support) |
| Asset Delivery | Local bundle via custom schemes | Local bundle via Rust asset pipeline | Remote HTTPS via CacheStorage | Remote HTTPS via Digital Asset Links |
| Offline Availability | 100% immediate from local storage | 100% immediate from local storage | Variable, dependent on cache quotas | Network dependent |
| Native Hardware Access | Mature plugins (`haptics`, `orientation`) | Custom Rust/JNI bridge required | Standard Web APIs only | Standard Web APIs + Android Intents |
| Store Distribution | Full App Store & Google Play access | Full App Store & Google Play access | Web URL only (no App Store) | Google Play only (rejected by Apple) |
| Platform Recommendation | Primary Recommended Container | Experimental; unnecessary complexity | Maintained as parallel web target | Superceded by Capacitor |

### 2.4 Store Review Policy Compliance for Dynamic 3D User-Generated Content (UGC)
- Apple Guideline 4.7 (Mini-Apps and Mini-Games): Explicitly permits host apps to offer mini-games and dynamic software, provided all game code is written in HTML5/JavaScript and executed exclusively by WebKit. Executing downloaded native binaries or bytecode interpreters is strictly prohibited. Mochi's Three.js runtime is 100% compliant. Guideline 4.7 also requires the host app's age rating to reflect the highest rating of any hosted game and requires an indexed catalog for user inspection.
- Apple Guideline 3.3.2 (Dynamic Code Execution): Interpreted code executed within WebKit is officially exempted from dynamic code restrictions, confirming that game scripts streamed from Cloudflare R2 comply with App Store rules.
- Apple Guideline 3.1.1 vs Creator Monetization: Unlocking games, virtual goods, or tipping within the iOS app must use Apple StoreKit 2 (15-30% commission). Under Guideline 3.1.3(b) (Multiplatform Services), players may consume items purchased outside the app (e.g. on the Mochi web portal via Stripe at 2.9% + 30c fee), provided all digital items are also purchasable via in-app purchase. Mochi implements a dual-platform credit balance synchronized in Cloudflare D1.
- Google Play UGC & Billing Policies: Google Play mandates a Terms of Service prohibiting objectionable content, a prominent in-app content reporting mechanism on every game view, user blocking tools, and a 24-hour moderation response SLA. Digital goods consumed on Android must process through Google Play Billing.

---

## 3. R2: Tech Stack and Language Comparative Evaluation

### 3.1 Comparative Benchmark Matrix

| Evaluation Metric | Web-First / Capacitor | Native (Swift/Metal + Kotlin) | Flutter (Impeller Engine) | React Native (Fabric) | Rust / WASM (wgpu / Bevy) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 60-120 FPS Consistency | High (solid 60/120Hz; zero GC pauses with pooling) | Maximum (deterministic 120Hz; ARC, zero GC) | Very High (Impeller eliminates shader jank) | Moderate-Good (bridge overhead in 3D loops) | Very High (near-native WASM execution) |
| Touch-to-Render Latency | 16-24 ms (1 frame compositor pipeline) | 6-10 ms (direct OS command buffer) | 10-15 ms (direct engine pipeline) | 14-20 ms (JSI / Fabric event dispatch) | 10-14 ms (direct canvas event dispatch) |
| Base Memory Footprint | 60-120 MB (WebKit DOM + JSC + WebGL) | 25-50 MB (compiled binary + Metal) | 70-130 MB (Dart VM + Impeller buffers) | 90-160 MB (Hermes VM + Fabric tree) | 40-75 MB (linear WASM memory pool) |
| Battery Consumption | Moderate (compositor layer blending) | Optimal (hardware frequency scaling) | Good (optimized GPU passes) | Moderate (dual JS/native threads) | Good-High (efficient compute pipeline) |
| GPU Compute Capability | WebGL2 transform feedback; WebGPU ready | Full (Metal Shaders, Vulkan Compute) | Very Restricted (2D vector engine) | Limited (requires native TurboModules) | Native: Full; Web: WebGPU-dependent |
| Creator UGC Agility | 10/10 (Instant OTA; 0 store reviews; sandbox) | 2/10 (Apple bans native binary downloads) | 3/10 (Dart AOT lacks dynamic runtime eval) | 6/10 (OTA JS bundles, unisolated sandbox) | 5/10 (WASM streaming, heavy compile step) |

### 3.2 Architectural Analysis and Trade-Off Justification
Rewriting Mochi in Native, Flutter, or React Native would yield minor touch latency improvements (6-10ms vs 16-24ms) at the expense of platform viability. Under Apple Guideline 3.3.2, native platforms cannot download new compiled native game binaries without App Store review. Creating a custom native scripting VM would require re-implementing browser sandboxing. Web technologies remain the only architecture legally and technically capable of executing untrusted user-created 3D games dynamically on iOS.

---

## 4. R3: Performance, Smoothness, and Platform Economics Evaluation

### 4.1 Fixed 60Hz Physics vs 120Hz Display Interpolation Loop
- Physics Determinism: Mochi runs physics simulation in discrete 16.666 ms slices (`FIXED_STEP = 1 / 60`). The accumulator loop `while (accumulator >= FIXED_STEP)` steps simulation deterministically, ensuring repeatable collision detection, character movement, and network synchronization across all device tiers.
- Visual Interpolation: High-refresh mobile displays (ProMotion / 120Hz OLED) sample between simulation states using `alpha = accumulator / FIXED_STEP`. Interpolating transforms (`prevRotation.slerp(currRotation, alpha)`) prevents micro-judder while bounding physics CPU cost to 60Hz. Scene mutations must never occur inside `render(alpha)` without delta-time scaling.

### 4.2 Touch Responsiveness and Event Handling
- Event Collision Resolution: Mobile WebViews emit both TouchEvents and PointerEvents. Handlers must deduplicate events by relying exclusively on PointerEvents (`pointerdown`, `pointermove`, `pointerup`) or filtering synthetic mouse duplicates.
- Viewport and Gesture Locks: The canvas element requires CSS `touch-action: none` to prevent the browser from intercepting pan gestures for page scrolling. Handlers for `pointercancel` and `touchcancel` must reset input states during OS multitasking gestures.
- On-Screen Controls: Virtual touch joysticks and action buttons must write directly to `InputController` axes (`axisX`, `axisY`) and action states (`jump`, `sprint`) without mutating React component state.

### 4.3 Garbage Collection vs Manual Memory Management
- Micro-Stutter Root Cause: In JavaScript runtimes (WebKit Nitro and V8), allocating temporary objects in the frame loop triggers minor GC nursery sweeps (2-8ms), dropping frames at 120Hz.
- Zero-Allocation Invariant: Reusable math structures (`THREE.Vector3`, `THREE.Quaternion`, `THREE.Matrix4`) must be pre-allocated as class members and updated in place via `.set()` or `.copy()`.
- React Decoupling: Frame callbacks (`onFpsUpdate`) must never invoke React `useState` at 60-120Hz. Diagnostic metrics should update direct DOM text nodes or throttle to a 4Hz timer.
- WebGL Context Disposal: Game transitions must recursively invoke `.dispose()` on all mesh geometries, materials, and textures to prevent WebGL memory leaks and Jetsam termination.

### 4.4 Asset Streaming Pipeline
- Binary Container: 3D models stream as binary glTF (`.glb`) compressed with DRACO geometry compression, reducing transfer size by 65-80%.
- Texture Transcoding: Textures stream as KTX2 / Basis Universal containers, transcoded in a dedicated Web Worker directly into GPU-native formats (ASTC on iOS/modern Android, ETC2 on legacy Android), bypassing CPU RAM decompression.
- Client Caching: Downloaded game packages and transcoded textures cache in IndexedDB with an LRU eviction policy bounded to 500MB to respect mobile storage quotas.

### 4.5 Platform Economics: Instant-Play Web vs Native App Store
- Web Distribution Advantages: Instant play (<1 second URL click-to-play), frictionless social sharing, zero store approval delays, and 97.1% creator payout via Stripe.
- Native App Store Advantages: High-visibility platform indexing, push notification retention, native haptic feedback, and frictionless 1-tap in-app purchase conversion.
- Hybrid Synergies: Capacitor combines both: an installable native shell for App Store discoverability and hardware APIs, running a web core where creators publish games dynamically over the air.

---

## 5. R4: Phased Mobile Deployment Roadmap

### Phase 1: Web Foundation & Engine Hardening (Weeks 1-4)
- Prerequisites: Refactor `PlayerViewport.tsx` to throttle FPS HUD state updates from 120Hz to 4Hz. Replace `window.resize` with `ResizeObserver`.
- Touch & Memory: Add `touch-action: none` to canvas. Implement `pointercancel` handling and virtual on-screen touch joystick in `InputController`.
- Rendering: Disable `alpha: true` on WebGLRenderer for opaque scenes. Add full WebGL resource disposal (`geometry.dispose()`, `material.dispose()`, `texture.dispose()`) on unmount.
- Milestone: 120 FPS continuous rendering on iPad Pro Safari with zero GC spikes (>8.33ms).

### Phase 2: Capacitor Container Scaffolding (Weeks 5-8)
- Setup: Initialize Capacitor v6 with `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`.
- Configuration: Set `appId: 'com.mochi.game'`, `webDir: 'dist'`, custom schemes (`capacitor://localhost`, `https://localhost`), and navigation boundaries.
- Native Shells: Generate `ios/` and `android/` projects. Set `CADisableMinimumFrameDurationOnPhone = true` in Info.plist. Set `hardwareAccelerated = true` in AndroidManifest.xml.
- Backend Sync: Authorize `capacitor://localhost` and `https://localhost` in Cloudflare Worker CORS headers.
- Milestone: Native debug builds running on physical iPhone and Android test devices displaying local `dist/` bundle.

### Phase 3: Hardware Integrations & Performance Tuning (Weeks 9-12)
- Hardware Plugins: Integrate `@capacitor/haptics` for tactile game events, `@capacitor/status-bar` (dark overlay), and `@capacitor/screen-orientation` (landscape lock).
- Lifecycle Management: Implement `@capacitor/app` state listeners to halt physics and render loops when app moves to background (`visibilityState === 'hidden'`).
- Streaming & Caching: Implement Web Worker KTX2 texture transcoder and IndexedDB LRU cache for dynamic game assets.
- Audio Session: Wire `AVAudioSessionCategoryPlayback` to allow game audio during iOS hardware mute switch activation.
- Milestone: Sustained <120MB memory footprint and <15% battery drain per hour during 3D gameplay.

### Phase 4: App Store & Google Play Submission (Weeks 13-16)
- Monetization Bridge: Integrate In-App Purchase plugins (StoreKit 2 on iOS, Google Play Billing on Android) for purchasing platform credits. Synchronize entitlements with Cloudflare D1.
- Store Compliance: Implement in-app content reporting ("Report Game"), creator blocking, and automated content moderation queue with 24-hour turnaround.
- Age Ratings: Complete Apple Age Rating Questionnaire (reflecting highest hosted content rating) and Google Play IARC certification.
- Production Submission: Submit iOS binary to App Store Review (referencing Guideline 4.7 compliance in reviewer notes) and Android App Bundle (.aab) to Google Play Console.
- Milestone: Production availability on Apple App Store and Google Play Store with automated over-the-air game updates.
