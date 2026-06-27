# WPLM JavaScript / TypeScript SDK

Official isomorphic client for [WP License Manager (WPLM)](https://github.com/wplm) —
works in **Node, Electron, and the browser**.

- Online **validate / activate / deactivate / heartbeat** against the `wplm/v1` REST API.
- **Offline verification** of Ed25519-signed license payloads and the CRL (via `@noble`).
- Offline **expiry enforcement** with a monotonic time-floor (resists clock rollback).
- Real **device metadata** sent on activation; pluggable transport / storage / fingerprint / device-info.
- Strongly typed, zero secrets shipped (public key + URL only).

## Install

```bash
npm install @wplm/sdk
```

## Quick start

```ts
import { WplmClient } from '@wplm/sdk';

const wplm = new WplmClient({
  baseUrl: 'https://license.vendor.com',
  licenseKey: userKey,
  productId: 42,
  publicKeyBase64: 'BASE64_ED25519_PUBLIC_KEY', // bundle for offline verification
});

await wplm.activate();                       // bind this device
const result = await wplm.validate(true);    // online, falling back to a cached payload offline
if (!result.valid) {
  // result.code: 'expired' | 'revoked' | 'suspended' | ...
}
```

### Persistent storage (Electron / browser)

```ts
import { WplmClient, WebStorageTokenStore, StaticDeviceInfoProvider } from '@wplm/sdk';

const wplm = new WplmClient({
  baseUrl: 'https://license.vendor.com',
  licenseKey: userKey,
  publicKeyBase64: PUBLIC_KEY,
  store: new WebStorageTokenStore(window.localStorage),
  deviceInfoProvider: new StaticDeviceInfoProvider({
    name: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    appVersion: app.getVersion(),
  }),
});
```

## Security

Only the **public key**, product id, and server URL are ever shipped. See
[SECURITY.md](SECURITY.md).

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (type-checked)
npm test            # vitest (includes the shared golden crypto vector)
npm run build       # tsc -> dist (ESM + .d.ts)
```

## License

MIT — see [LICENSE](LICENSE).
