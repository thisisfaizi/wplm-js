# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-19

### Added
- Initial release: isomorphic `WplmClient` (Node, Electron, browser).
- validate / activate / deactivate / heartbeat against the `wplm/v1` REST API.
- Offline Ed25519 verification of license payloads and the signed CRL (`@noble`).
- Monotonic time-floor: offline expiry enforcement that resists clock rollback.
- One-sided clock-drift check; typed error hierarchy mapping every server code.
- Pluggable transport, storage, fingerprint, and device-info providers.
- Golden-vector crypto tests shared across all WPLM SDKs.
