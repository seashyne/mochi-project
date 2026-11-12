# Mochi Domain Migration Runbook: Zero-Code Custom Domain Rebinding

This document provides a step-by-step technical runbook to transition Mochi from temporary staging subdomains (`game.lenout.com`, `api-game.lenout.com`) to an independent custom domain (e.g., `mochigames.com`, `api.mochigames.com`) with zero code refactoring.

---

## 1. Architectural Foundation: Zero-Code Rebinding

Mochi is architected from inception to avoid any compile-time coupling to domain names. All origins, base endpoints, storage domains, cookie boundaries, and CORS whitelists are dynamically injected through environment variables.

### Rebinding Paradigm
```
Temporary Staging State                      Target Production State
-----------------------                      -----------------------
Web:   https://game.lenout.com        --->   Web:   https://mochigames.com
API:   https://api-game.lenout.com    --->   API:   https://api.mochigames.com
CDN:   https://cdn-game.lenout.com    --->   CDN:   https://cdn.mochigames.com
```

No source file, component, hook, or SQL migration contains hardcoded domain strings. A domain migration requires only Cloudflare DNS provisioning and environment variable updates.

---

## 2. Environment Configuration Matrix

Every domain touchpoint is governed by the following parameter matrix:

### 2.1 Frontend Client (`mochi`)
| Variable | Description | Staging Value | Target Custom Domain Value |
|----------|-------------|---------------|----------------------------|
| `VITE_APP_URL` | Canonical client origin | `https://game.lenout.com` | `https://mochigames.com` |
| `VITE_API_URL` | Cloudflare Worker API URL | `https://api-game.lenout.com` | `https://api.mochigames.com` |
| `VITE_CDN_URL` | Public R2 asset CDN URL | `https://cdn-game.lenout.com` | `https://cdn.mochigames.com` |

### 2.2 Backend Cloud Worker (`mochi-cloud`)
| Variable | Description | Staging Value | Target Custom Domain Value |
|----------|-------------|---------------|----------------------------|
| `APP_ORIGIN` | Web application origin | `https://game.lenout.com` | `https://mochigames.com` |
| `API_ORIGIN` | REST API Worker origin | `https://api-game.lenout.com` | `https://api.mochigames.com` |
| `CDN_ORIGIN` | R2 assets public origin | `https://cdn-game.lenout.com` | `https://cdn.mochigames.com` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated CORS origins | `https://game.lenout.com` | `https://mochigames.com,https://www.mochigames.com` |
| `COOKIE_DOMAIN` | Auth session cookie domain | `.lenout.com` | `.mochigames.com` |
| `JWT_ISSUER` | Token issuance identifier | `mochi-api-staging` | `mochi-api-production` |

---

## 3. Pre-Migration Audit Checklist

Execute these preflight checks prior to initiating cutover:

- [ ] Codebase Audit: Execute repository search to verify zero instances of hardcoded `lenout.com` in source code files (`src/`):
  ```bash
  grep -rnw 'mochi/src' -e 'lenout.com'
  grep -rnw 'mochi-cloud/src' -e 'lenout.com'
  ```
- [ ] Domain Acquisition & DNS: Register target domain (e.g., `mochigames.com`) and add nameservers to Cloudflare.
- [ ] SSL/TLS Mode: Set Cloudflare SSL/TLS encryption to Full (Strict).
- [ ] Certificate Readiness: Verify Cloudflare Universal SSL certificate has provisioned for the apex and subdomains (`mochigames.com`, `*.mochigames.com`).

---

## 4. Step-by-Step DNS and Cloudflare Migration Runbook

### Step 1: Bind Custom Domains to Worker (`mochi-cloud`)
1. Open Cloudflare Dashboard -> Compute (Workers) -> `mochi-api`.
2. Navigate to Settings -> Domains & Routes -> Custom Domains.
3. Click "Add Custom Domain" and input `api.mochigames.com`.
4. Cloudflare will automatically configure the DNS CNAME and provision edge SSL.

### Step 2: Configure R2 Bucket Custom Domain
1. In Cloudflare Dashboard, navigate to R2 -> `mochi-assets`.
2. Select Settings -> Custom Domains.
3. Click "Connect Domain" and enter `cdn.mochigames.com`.
4. Verify edge caching rules (Cache-Control: `public, max-age=31536000, immutable`).

### Step 3: Update Worker Environment Variables
Update `mochi-cloud/wrangler.jsonc` or push secrets via Wrangler CLI:
```bash
# Set updated origin variables
npx wrangler secret put APP_ORIGIN
# Input: https://mochigames.com

npx wrangler secret put API_ORIGIN
# Input: https://api.mochigames.com

npx wrangler secret put CDN_ORIGIN
# Input: https://cdn.mochigames.com

npx wrangler secret put CORS_ALLOWED_ORIGINS
# Input: https://mochigames.com,https://www.mochigames.com

npx wrangler secret put COOKIE_DOMAIN
# Input: .mochigames.com
```
Deploy the updated worker:
```bash
cd mochi-cloud
npx wrangler deploy
```

### Step 4: Rebuild and Deploy Frontend Client (`mochi`)
1. Update `mochi/.env.production`:
   ```ini
   VITE_APP_URL=https://mochigames.com
   VITE_API_URL=https://api.mochigames.com
   VITE_CDN_URL=https://cdn.mochigames.com
   ```
2. Build the production web bundle:
   ```bash
   cd mochi
   npm run build
   ```
3. Deploy the build artifacts (`dist/`) to your web hosting provider (Cloudflare Pages, Vercel, or Cloudflare Worker Sites) bound to `mochigames.com`.

### Step 5: Verification Testing on Custom Domain
Execute automated smoke checks against the new domain endpoints:
```bash
# 1. Health check verification
curl -I https://api.mochigames.com/api/v1/health

# 2. CORS preflight verification
curl -I -X OPTIONS https://api.mochigames.com/api/v1/games \
  -H "Origin: https://mochigames.com" \
  -H "Access-Control-Request-Method: GET"

# 3. Asset CDN verification
curl -I https://cdn.mochigames.com/covers/welcome.webp
```

---

## 5. Post-Migration Cutover and 301 Redirect Rules

To preserve incoming traffic and existing bookmarks from `game.lenout.com`, configure edge 301 redirects.

### Cloudflare Page Rules / Bulk Redirects
Create a Cloudflare Redirect Rule for the legacy zone (`lenout.com`):
```
Rule Configuration:
- Incoming URL match: https://game.lenout.com/*
- Target URL: https://mochigames.com/$1
- Status Code: 301 (Permanent Redirect)
- Preserve Query String: Yes
```

### Verification and Monitoring
- Monitor HTTP response status codes: Ensure legacy URL requests return HTTP 301 with correct `Location: https://mochigames.com/...` headers.
- Monitor Error Rates: Track Cloudflare Worker analytics for any unexpected CORS denials (`403 Forbidden`) or missing asset requests (`404 Not Found`).
- Seamless Session Transition: Users with active sessions on the legacy domain will simply re-authenticate on the new domain with zero account data loss.
