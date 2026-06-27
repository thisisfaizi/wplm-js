/**
 * Official JavaScript/TypeScript SDK for WP License Manager (WPLM).
 *
 * Isomorphic (Node, Electron, browser). Validate, activate, and verify software
 * licenses online and offline.
 */

export { WplmClient } from './client.js';
export type { WplmClientOptions, ActivateOptions } from './client.js';
export { SignatureVerifier, RevocationList } from './crypto.js';
export {
  WplmError,
  WplmApiError,
  WplmNetworkError,
  WplmSignatureInvalid,
  WplmConfigError,
  WplmNotFound,
  WplmExpired,
  WplmSuspended,
  WplmRevoked,
  WplmTerminated,
  WplmLimitExceeded,
  WplmBlacklisted,
  WplmNotActive,
  WplmMachineNotFound,
  WplmProductMismatch,
} from './errors.js';
export type { License, Machine, ValidationResult } from './models.js';
export { machineIsActive } from './models.js';
export { FetchTransport } from './transport.js';
export type { Transport, WplmResponse } from './transport.js';
export {
  InMemoryTokenStore,
  WebStorageTokenStore,
} from './storage.js';
export type { TokenStore } from './storage.js';
export {
  StaticFingerprintProvider,
  PersistedUuidFingerprintProvider,
} from './fingerprint.js';
export type { FingerprintProvider } from './fingerprint.js';
export { StaticDeviceInfoProvider } from './deviceInfo.js';
export type { DeviceInfoProvider, WplmDeviceInfo } from './deviceInfo.js';
