/** The WPLM client. */

import { RevocationList, SignatureVerifier } from './crypto.js';
import type { DeviceInfoProvider, WplmDeviceInfo } from './deviceInfo.js';
import {
  WplmApiError,
  WplmConfigError,
  WplmError,
  WplmNetworkError,
  WplmSignatureInvalid,
} from './errors.js';
import {
  PersistedUuidFingerprintProvider,
  type FingerprintProvider,
} from './fingerprint.js';
import {
  machineFromJson,
  validationResultFromJson,
  type Machine,
  type ValidationResult,
} from './models.js';
import { InMemoryTokenStore, type TokenStore } from './storage.js';
import { FetchTransport, type Transport, type WplmResponse } from './transport.js';

const K_SIGNED = 'wplm.signed_payload';
const K_PUBKEY = 'wplm.public_key';
const K_CRL = 'wplm.crl';
const K_CRL_AT = 'wplm.crl_at';
const K_TIME_FLOOR = 'wplm.time_floor';

export interface WplmClientOptions {
  baseUrl: string;
  licenseKey?: string;
  productId?: number;
  publicKeyBase64?: string;
  maxClockDriftSeconds?: number;
  crlTtlSeconds?: number;
  transport?: Transport;
  store?: TokenStore;
  fingerprintProvider?: FingerprintProvider;
  deviceInfoProvider?: DeviceInfoProvider;
}

export interface ActivateOptions {
  name?: string;
  hostname?: string;
  platform?: string;
  appVersion?: string;
}

export class WplmClient {
  private readonly base: string;
  private readonly licenseKey?: string;
  private readonly productId?: number;
  private readonly publicKeyBase64?: string;
  private readonly maxClockDrift: number;
  private readonly crlTtl: number;
  private readonly transport: Transport;
  private readonly store: TokenStore;
  private readonly fingerprint: FingerprintProvider;
  private readonly deviceInfoProvider?: DeviceInfoProvider;

  private verifier: SignatureVerifier | null = null;
  private deviceInfoCache: WplmDeviceInfo | null = null;

  constructor(opts: WplmClientOptions) {
    this.base = WplmClient.normalizeBase(opts.baseUrl);
    this.licenseKey = opts.licenseKey;
    this.productId = opts.productId;
    this.publicKeyBase64 = opts.publicKeyBase64;
    this.maxClockDrift = opts.maxClockDriftSeconds ?? 300;
    this.crlTtl = opts.crlTtlSeconds ?? 3600;
    this.transport = opts.transport ?? new FetchTransport();
    this.store = opts.store ?? new InMemoryTokenStore();
    this.fingerprint = opts.fingerprintProvider ?? new PersistedUuidFingerprintProvider(this.store);
    this.deviceInfoProvider = opts.deviceInfoProvider;
  }

  get product(): number | undefined {
    return this.productId;
  }

  async validate(offlineOk = false): Promise<ValidationResult> {
    const key = this.requireKey();
    try {
      const data = await this.post('/validate', {
        license_key: key,
        fingerprint: await this.fingerprint.get(),
      });
      const result = validationResultFromJson(data);
      if (result.signedPayload) {
        await this.store.write(K_SIGNED, result.signedPayload);
      }
      await this.advanceTimeFloor(Math.floor(Date.now() / 1000));
      await this.maybeRefreshCrl();
      return result;
    } catch (e) {
      if (e instanceof WplmNetworkError && offlineOk) {
        const offline = await this.validateOffline(key);
        if (offline !== null) {
          return offline;
        }
      }
      throw e;
    }
  }

  async activate(opts: ActivateOptions = {}): Promise<Machine> {
    const body: Record<string, unknown> = {
      license_key: this.requireKey(),
      fingerprint: await this.fingerprint.get(),
      ...(await this.deviceFields(opts)),
    };
    return machineFromJson(await this.post('/activate', body));
  }

  async deactivate(): Promise<boolean> {
    const data = await this.post('/deactivate', {
      license_key: this.requireKey(),
      fingerprint: await this.fingerprint.get(),
    });
    return data['deactivated'] === true;
  }

  async heartbeat(appVersion?: string): Promise<Machine> {
    const resolved = appVersion ?? (await this.deviceInfo())?.appVersion;
    const body: Record<string, unknown> = {
      license_key: this.requireKey(),
      fingerprint: await this.fingerprint.get(),
    };
    if (resolved) {
      body['app_version'] = resolved;
    }
    return machineFromJson(await this.post('/heartbeat', body));
  }

  async verifyOffline(token: string): Promise<Record<string, unknown>> {
    return (await this.getVerifier()).verify(token);
  }

  async checkCrl(): Promise<RevocationList> {
    const data = await this.get('/crl');
    const token = typeof data['crl'] === 'string' ? data['crl'] : '';
    const crl = RevocationList.parse(token, await this.getVerifier());
    await this.store.write(K_CRL, token);
    await this.store.write(K_CRL_AT, String(Date.now()));
    return crl;
  }

  // ----------------------------------------------------------------- offline

  private async validateOffline(key: string): Promise<ValidationResult | null> {
    const token = await this.store.read(K_SIGNED);
    if (!token) {
      return null;
    }
    const verifier = await this.verifierOrNull(false);
    if (verifier === null) {
      return null;
    }

    let payload: Record<string, unknown>;
    try {
      payload = verifier.verify(token);
    } catch (e) {
      if (e instanceof WplmSignatureInvalid) {
        return { valid: false, code: 'signature_invalid', needsActivation: false, fromCache: true };
      }
      throw e;
    }

    if (!SignatureVerifier.isWithinClockDrift(payload, this.maxClockDrift)) {
      return { valid: false, code: 'clock_drift', needsActivation: false, fromCache: true };
    }

    const iat = payload['iat'];
    if (typeof iat === 'number') {
      await this.advanceTimeFloor(iat);
    }
    await this.advanceTimeFloor(Math.floor(Date.now() / 1000));
    const effectiveNow = await this.readTimeFloor();

    const expires = payload['expires'];
    if (typeof expires === 'string' && expires.length > 0) {
      const exp = Math.floor(Date.parse(expires) / 1000);
      if (!Number.isNaN(exp) && effectiveNow > exp) {
        return { valid: false, code: 'expired', needsActivation: false, fromCache: true };
      }
    }

    const crl = await this.cachedCrl(verifier);
    if (crl !== null && crl.isKeyRevoked(key)) {
      return { valid: false, code: 'revoked', needsActivation: false, fromCache: true };
    }

    return { valid: true, needsActivation: false, fromCache: true };
  }

  private async cachedCrl(verifier: SignatureVerifier): Promise<RevocationList | null> {
    const token = await this.store.read(K_CRL);
    if (!token) {
      return null;
    }
    try {
      return RevocationList.parse(token, verifier);
    } catch {
      return null;
    }
  }

  private async maybeRefreshCrl(): Promise<void> {
    const at = await this.store.read(K_CRL_AT);
    if (at !== null) {
      const age = Date.now() - Number(at);
      if (!Number.isNaN(age) && age < this.crlTtl * 1000) {
        return;
      }
    }
    try {
      await this.checkCrl();
    } catch (e) {
      if (!(e instanceof WplmError)) {
        throw e;
      }
      // Best-effort; a stale/missing CRL must not break online validation.
    }
  }

  // --------------------------------------------------------------- timefloor

  private async readTimeFloor(): Promise<number> {
    const raw = await this.store.read(K_TIME_FLOOR);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  private async advanceTimeFloor(epochSeconds: number): Promise<void> {
    if (epochSeconds <= 0) {
      return;
    }
    if (epochSeconds > (await this.readTimeFloor())) {
      await this.store.write(K_TIME_FLOOR, String(epochSeconds));
    }
  }

  // ----------------------------------------------------------- device fields

  private async deviceInfo(): Promise<WplmDeviceInfo | null> {
    if (!this.deviceInfoProvider) {
      return null;
    }
    this.deviceInfoCache ??= await this.deviceInfoProvider.get();
    return this.deviceInfoCache;
  }

  private async deviceFields(opts: ActivateOptions): Promise<Record<string, string>> {
    const info = await this.deviceInfo();
    const out: Record<string, string> = {};
    const merged: Record<string, string | undefined> = {
      name: opts.name ?? info?.name,
      hostname: opts.hostname ?? info?.hostname,
      platform: opts.platform ?? info?.platform,
      app_version: opts.appVersion ?? info?.appVersion,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) {
        out[k] = v;
      }
    }
    return out;
  }

  // ------------------------------------------------------------- verifier

  private async getVerifier(): Promise<SignatureVerifier> {
    const v = await this.verifierOrNull(true);
    if (v === null) {
      throw new WplmConfigError(
        'No Ed25519 public key available. Pass publicKeyBase64 or call an online method once.',
      );
    }
    return v;
  }

  private async verifierOrNull(allowNetwork: boolean): Promise<SignatureVerifier | null> {
    if (this.verifier !== null) {
      return this.verifier;
    }
    let b64 = this.publicKeyBase64 ?? (await this.store.read(K_PUBKEY)) ?? undefined;
    if (!b64 && allowNetwork) {
      const data = await this.get('/public-key');
      const fetched = data['public_key'];
      if (typeof fetched === 'string' && fetched.length > 0) {
        await this.store.write(K_PUBKEY, fetched);
        b64 = fetched;
      }
    }
    if (!b64) {
      return null;
    }
    this.verifier = SignatureVerifier.fromBase64(b64);
    return this.verifier;
  }

  // ----------------------------------------------------------------- http

  private async post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await this.transport.send(
      'POST',
      this.base + path,
      { 'Content-Type': 'application/json', Accept: 'application/json' },
      JSON.stringify(body),
    );
    return this.unwrap(res);
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    const res = await this.transport.send('GET', this.base + path, { Accept: 'application/json' });
    return this.unwrap(res);
  }

  private unwrap(res: WplmResponse): Record<string, unknown> {
    let decoded: unknown;
    try {
      decoded = JSON.parse(res.body);
    } catch {
      decoded = null;
    }
    if (typeof decoded !== 'object' || decoded === null) {
      throw new WplmApiError(`Unexpected response (HTTP ${res.statusCode})`, undefined, res.statusCode);
    }
    const obj = decoded as Record<string, unknown>;
    if (obj['success'] === true && typeof obj['data'] === 'object' && obj['data'] !== null) {
      return obj['data'] as Record<string, unknown>;
    }
    const code = typeof obj['code'] === 'string' ? obj['code'] : 'wplm_unknown_error';
    const message =
      typeof obj['message'] === 'string'
        ? obj['message']
        : `Request failed (HTTP ${res.statusCode}).`;
    throw WplmError.fromCode(code, message, res.statusCode);
  }

  private requireKey(): string {
    if (!this.licenseKey) {
      throw new WplmConfigError('No licenseKey configured.');
    }
    return this.licenseKey;
  }

  private static normalizeBase(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/, '') + '/wp-json/wplm/v1';
  }
}
