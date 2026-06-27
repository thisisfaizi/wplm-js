/** Produces a stable per-install fingerprint (raw; the server hashes it). */

import type { TokenStore } from './storage.js';

export interface FingerprintProvider {
  get(): Promise<string>;
}

/** Always returns a caller-supplied value (e.g. a derived hardware id). */
export class StaticFingerprintProvider implements FingerprintProvider {
  constructor(private readonly value: string) {}

  get(): Promise<string> {
    return Promise.resolve(this.value);
  }
}

/** Generates a random fingerprint once and persists it in the store. */
export class PersistedUuidFingerprintProvider implements FingerprintProvider {
  constructor(
    private readonly store: TokenStore,
    private readonly storageKey = 'wplm.fingerprint',
  ) {}

  async get(): Promise<string> {
    const existing = await this.store.read(this.storageKey);
    if (existing) {
      return existing;
    }
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const fingerprint = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await this.store.write(this.storageKey, fingerprint);
    return fingerprint;
  }
}
