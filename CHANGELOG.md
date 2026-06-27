# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-28

### Added
- **Product binding.** Set `productId` and the client rejects any license whose
  signed `pid` does not match — enforced both online and offline from the
  cryptographically signed payload (`WplmProductMismatch`). Omit `productId` to
  opt out (backward compatible).
- **Keypair-rotation self-heal.** If the cached public key fails verification
  during an online `validate`, the SDK drops it, re-fetches `/public-key` once,
  and retries — so a vendor rotating the signing keypair no longer bricks clients.

## [0.1.0] - 2026-06-19

### Added
- Initial release: isomorphic `WplmClient` (Node, Electron, browser).
- validate / activate / deactivate / heartbeat against the `wplm/v1` REST API.
- Offline Ed25519 verification of license payloads and the signed CRL (`@noble`).
- Monotonic time-floor: offline expiry enforcement that resists clock rollback.
- One-sided clock-drift check; typed error hierarchy mapping every server code.
- Pluggable transport, storage, fingerprint, and device-info providers.
- Golden-vector crypto tests shared across all WPLM SDKs.
