<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=14,21,28&height=160&section=header&text=wplm-js&fontSize=52&fontAlignY=42&animation=fadeIn&fontColor=ffffff" />

### WP License Manager — JavaScript / TypeScript SDK

[![npm](https://img.shields.io/npm/v/@wplm/sdk?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@wplm/sdk)
[![CI](https://img.shields.io/github/actions/workflow/status/wplm/wplm-js/ci.yaml?style=for-the-badge&label=CI&logo=github-actions&logoColor=white)](https://github.com/thisisfaizi/wplm-js/actions/workflows/ci.yaml)
[![Coverage](https://img.shields.io/codecov/c/github/wplm/wplm-js?style=for-the-badge&logo=codecov&logoColor=white)](https://codecov.io/gh/wplm/wplm-js)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)

<p>Offline-first Ed25519 license validation for Node, Electron, and the browser,<br>
backed by a self-hosted <a href="https://github.com/thisisfaizi/wp-license-manager">WP License Manager</a> server.</p>

</div>

---

Official isomorphic client for **[WP License Manager (WPLM)](https://github.com/thisisfaizi/wp-license-manager)** —
works in **Node, Electron, and the browser**.

- ✅ Online `validate` / `activate` / `deactivate` / `heartbeat`
- 🔏 **Offline** Ed25519 signature verification (via `@noble/ed25519`)
- 🛡️ Signed CRL check (reject revoked keys offline)
- 🔌 Pluggable transport, storage, fingerprint, and device-info providers
- 🔄 Offline expiry enforcement with monotonic time-floor (resists clock rollback)
- 📦 Dual ESM/CJS build, zero runtime dependencies beyond `@noble`

---

## Install

```bash
npm install @wplm/sdk
```

---

## Quick Start

```ts
import { WplmClient } from '@wplm/sdk';

const wplm = new WplmClient({
  baseUrl: 'https://license.vendor.com',
  licenseKey: userKey,
  productId: 42,
  publicKeyBase64: 'BASE64_ED25519_PUBLIC_KEY', // bundle for offline verification
});

await wplm.activate();                        // bind this device
const result = await wplm.validate(true);     // online, offline fallback from cache
if (!result.valid) {
  // result.code: 'expired' | 'revoked' | 'suspended' | ...
}
await wplm.heartbeat();                       // keep floating lease alive
await wplm.deactivate();                      // free seat on sign-out
```

---

## Persistent Storage (Electron / Browser)

```ts
import { WplmClient, WebStorageTokenStore, StaticDeviceInfoProvider } from '@wplm/sdk';
import * as os from 'os';

const wplm = new WplmClient({
  baseUrl: 'https://license.vendor.com',
  licenseKey: userKey,
  publicKeyBase64: PUBLIC_KEY,
  store: new WebStorageTokenStore(window.localStorage), // or safeStorage in Electron
  deviceInfoProvider: new StaticDeviceInfoProvider({
    name: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    appVersion: app.getVersion(),
  }),
});
```

---

## Subscription Renewal

Renewals are handled through **WooCommerce My Account → Subscriptions → Renew**.
No SDK code is needed: after the customer pays, the server extends `expires_at`
and re-signs the offline payload. The next `validate()` call returns the updated
expiry and refreshes the local cache automatically.

---

## Security

Only the **public key**, product id, and server URL are ever shipped — never a
private signing key or any server secret. See [SECURITY.md](SECURITY.md).

---

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (type-checked)
npm test            # vitest (includes shared golden crypto vectors)
npm run build       # tsc → dist/ (ESM + CJS + .d.ts)
```

---

## Links

- [WP License Manager (server plugin)](https://github.com/thisisfaizi/wp-license-manager)
- [Dart / Flutter SDK](https://github.com/thisisfaizi/wplm-dart)
- [Python SDK](https://github.com/thisisfaizi/wplm-python)
- [PHP SDK](https://github.com/thisisfaizi/wplm-php)
- [OpenAPI 3.1 spec](https://github.com/thisisfaizi/wplm-openapi)

---

<div align="center">

MIT License · Part of the [WP License Manager](https://github.com/thisisfaizi/wp-license-manager) ecosystem

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=14,21,28&height=80&section=footer" />

</div>
