/** Offline Ed25519 verification of WPLM signed tokens and the CRL. */

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

import { WplmSignatureInvalid } from './errors.js';

/**
 * Decode base64 (standard or URL-safe) to bytes, isomorphically.
 * `/public-key` is standard base64; tokens and the CRL are base64url (no pad).
 */
function decodeBase64(input: string, urlSafe: boolean): Uint8Array {
  let s = input.trim();
  if (urlSafe) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
  }
  const pad = s.length % 4;
  if (pad !== 0) {
    s += '='.repeat(4 - pad);
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export class SignatureVerifier {
  private constructor(private readonly publicKey: Uint8Array) {}

  static fromBase64(publicKeyBase64: string): SignatureVerifier {
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(publicKeyBase64, false);
    } catch {
      throw new WplmSignatureInvalid('Invalid public key encoding');
    }
    return new SignatureVerifier(bytes);
  }

  /** Verify `token` and return its decoded JSON payload. */
  verify(token: string): Record<string, unknown> {
    const dot = token.indexOf('.');
    if (dot <= 0 || dot >= token.length - 1) {
      throw new WplmSignatureInvalid('Malformed signed token');
    }
    const body = token.slice(0, dot);
    const signature = decodeBase64(token.slice(dot + 1), true);
    const message = new TextEncoder().encode(body);

    let ok = false;
    try {
      ok = ed25519.verify(signature, message, this.publicKey);
    } catch {
      ok = false;
    }
    if (!ok) {
      throw new WplmSignatureInvalid('Signature verification failed');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(decodeBase64(body, true)));
    } catch {
      throw new WplmSignatureInvalid('Signed payload is not valid JSON');
    }
    if (typeof payload !== 'object' || payload === null) {
      throw new WplmSignatureInvalid('Signed payload is not a JSON object');
    }
    return payload as Record<string, unknown>;
  }

  /**
   * One-sided check: reject only a payload issued in the *future* beyond
   * `maxDriftSeconds` (clock rolled back). An old payload is fine — `expires`
   * governs offline validity.
   */
  static isWithinClockDrift(payload: Record<string, unknown>, maxDriftSeconds: number): boolean {
    const iat = payload['iat'];
    if (typeof iat !== 'number') {
      return true;
    }
    return iat - Math.floor(Date.now() / 1000) <= maxDriftSeconds;
  }
}

export class RevocationList {
  constructor(
    readonly revokedKeyHashes: Set<string>,
    readonly revokedFingerprints: Set<string>,
    readonly generatedAt?: string,
  ) {}

  static parse(token: string, verifier: SignatureVerifier): RevocationList {
    const payload = verifier.verify(token);
    const asSet = (v: unknown): Set<string> =>
      new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    const generated = payload['generated_at'];
    return new RevocationList(
      asSet(payload['revoked_keys']),
      asSet(payload['revoked_fingerprints']),
      typeof generated === 'string' ? generated : undefined,
    );
  }

  isKeyRevoked(licenseKey: string): boolean {
    const digest = bytesToHex(sha256(new TextEncoder().encode(licenseKey)));
    return this.revokedKeyHashes.has(digest);
  }
}
