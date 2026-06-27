import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RevocationList, SignatureVerifier } from '../src/crypto.js';
import { WplmSignatureInvalid } from '../src/errors.js';

interface Golden {
  public_key_base64: string;
  token: string;
  payload: { key: string; max: number };
  crl_token: string;
  revoked_key: string;
}

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/golden.json', import.meta.url)), 'utf-8'),
) as Golden;

describe('SignatureVerifier (golden vector)', () => {
  it('verifies a genuine token and decodes its payload', () => {
    const verifier = SignatureVerifier.fromBase64(golden.public_key_base64);
    const payload = verifier.verify(golden.token);
    expect(payload['key']).toBe('NDV-LLMG-EXNY-RPU1-7T2Q');
    expect(payload['max']).toBe(3);
  });

  it('rejects a tampered token', () => {
    const verifier = SignatureVerifier.fromBase64(golden.public_key_base64);
    const tampered = 'A' + golden.token.slice(1);
    expect(() => verifier.verify(tampered)).toThrow(WplmSignatureInvalid);
  });

  it('rejects a malformed token', () => {
    const verifier = SignatureVerifier.fromBase64(golden.public_key_base64);
    expect(() => verifier.verify('not-a-token')).toThrow(WplmSignatureInvalid);
  });

  it('detects a revoked key in the CRL', () => {
    const verifier = SignatureVerifier.fromBase64(golden.public_key_base64);
    const crl = RevocationList.parse(golden.crl_token, verifier);
    expect(crl.isKeyRevoked(golden.revoked_key)).toBe(true);
    expect(crl.isKeyRevoked('SOME-OTHER-KEY')).toBe(false);
  });

  it('clock drift is one-sided (old ok, future rejected)', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(SignatureVerifier.isWithinClockDrift({ iat: now }, 300)).toBe(true);
    expect(SignatureVerifier.isWithinClockDrift({ iat: now - 3600 }, 300)).toBe(true);
    expect(SignatureVerifier.isWithinClockDrift({ iat: now + 3600 }, 300)).toBe(false);
  });
});
