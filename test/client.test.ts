import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ed25519 } from '@noble/curves/ed25519';
import { describe, expect, it } from 'vitest';

import { WplmClient } from '../src/client.js';
import { StaticDeviceInfoProvider } from '../src/deviceInfo.js';
import { WplmLimitExceeded, WplmNetworkError, WplmProductMismatch } from '../src/errors.js';
import { InMemoryTokenStore } from '../src/storage.js';
import type { Transport, WplmResponse } from '../src/transport.js';

interface Golden {
  public_key_base64: string;
  token: string;
}
const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/golden.json', import.meta.url)), 'utf-8'),
) as Golden;
const GOLDEN_KEY = 'NDV-LLMG-EXNY-RPU1-7T2Q';

class FakeTransport implements Transport {
  calls: { method: string; url: string; body?: string }[] = [];
  constructor(
    private readonly handler: (m: string, u: string, b?: string) => WplmResponse | Promise<WplmResponse>,
  ) {}
  async send(method: string, url: string, _h?: Record<string, string>, body?: string): Promise<WplmResponse> {
    this.calls.push({ method, url, body });
    return this.handler(method, url, body);
  }
}

const ok = (data: Record<string, unknown>, status = 200): WplmResponse => ({
  statusCode: status,
  body: JSON.stringify({ success: true, data, meta: {} }),
});
const err = (code: string, message: string, status: number): WplmResponse => ({
  statusCode: status,
  body: JSON.stringify({ code, message, data: { status } }),
});
const offline = (): never => {
  throw new WplmNetworkError('offline');
};

describe('WplmClient', () => {
  it('activate sends device info from the provider', async () => {
    const transport = new FakeTransport(() =>
      ok({ id: 1, license_id: 1, fingerprint: 'fp', status: 1 }, 201),
    );
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: 'KEY',
      transport,
      deviceInfoProvider: new StaticDeviceInfoProvider({
        name: 'pc1',
        hostname: 'pc1.local',
        platform: 'Windows 11',
        appVersion: '9.9.0',
      }),
    });

    await client.activate();

    const sent = JSON.parse(transport.calls[0]!.body ?? '{}') as Record<string, unknown>;
    expect(sent['name']).toBe('pc1');
    expect(sent['hostname']).toBe('pc1.local');
    expect(sent['platform']).toBe('Windows 11');
    expect(sent['app_version']).toBe('9.9.0');
  });

  it('explicit activate args override the provider', async () => {
    const transport = new FakeTransport(() =>
      ok({ id: 1, license_id: 1, fingerprint: 'fp', status: 1 }, 201),
    );
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: 'KEY',
      transport,
      deviceInfoProvider: new StaticDeviceInfoProvider({ name: 'pc1' }),
    });

    await client.activate({ name: 'Custom' });

    const sent = JSON.parse(transport.calls[0]!.body ?? '{}') as Record<string, unknown>;
    expect(sent['name']).toBe('Custom');
  });

  it('maps a server error code to a typed error', async () => {
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: 'KEY',
      transport: new FakeTransport(() => err('machine_limit_exceeded', 'No seats', 422)),
    });
    await expect(client.activate()).rejects.toBeInstanceOf(WplmLimitExceeded);
  });

  it('validates offline from an old cached payload', async () => {
    const store = new InMemoryTokenStore();
    await store.write('wplm.signed_payload', golden.token);
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: GOLDEN_KEY,
      publicKeyBase64: golden.public_key_base64,
      transport: new FakeTransport(offline),
      store,
    });

    const result = await client.validate(true);

    expect(result.valid).toBe(true);
    expect(result.fromCache).toBe(true);
  });

  it('rejects offline when the time floor is past expiry (clock rollback)', async () => {
    const store = new InMemoryTokenStore();
    await store.write('wplm.signed_payload', golden.token);
    // A time far past the token's 2099 expiry was already observed.
    await store.write('wplm.time_floor', '9999999999');
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: GOLDEN_KEY,
      publicKeyBase64: golden.public_key_base64,
      transport: new FakeTransport(offline),
      store,
    });

    const result = await client.validate(true);

    expect(result.valid).toBe(false);
    expect(result.code).toBe('expired');
  });
});

// ----------------------------------------------------------- product binding

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Sign a WPLM-format token with a fresh keypair; returns token + public key. */
function signWithPid(pid: number | null): { token: string; publicKey: string } {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = ed25519.getPublicKey(priv);
  const payload = {
    key: 'KEY',
    expires: '2099-01-01T00:00:00Z',
    max: 3,
    pid,
    iat: Math.floor(Date.now() / 1000),
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = ed25519.sign(new TextEncoder().encode(body), priv);
  return {
    token: `${body}.${b64url(sig)}`,
    publicKey: Buffer.from(pub).toString('base64'),
  };
}

function onlineValidate(token: string): (m: string, u: string, b?: string) => WplmResponse {
  return (_m, u) => {
    if (u.endsWith('/validate')) {
      return ok({
        valid: true,
        license: { id: 1, status: 1 },
        signed_payload: token,
        needs_activation: false,
      });
    }
    return ok({ crl: '' });
  };
}

describe('WplmClient product binding', () => {
  it('online: matching pid passes', async () => {
    const { token, publicKey } = signWithPid(42);
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: 'KEY',
      productId: 42,
      publicKeyBase64: publicKey,
      transport: new FakeTransport(onlineValidate(token)),
      store: new InMemoryTokenStore(),
    });
    const result = await client.validate();
    expect(result.valid).toBe(true);
  });

  it('online: mismatched pid throws WplmProductMismatch', async () => {
    const { token, publicKey } = signWithPid(99);
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: 'KEY',
      productId: 42,
      publicKeyBase64: publicKey,
      transport: new FakeTransport(onlineValidate(token)),
      store: new InMemoryTokenStore(),
    });
    await expect(client.validate()).rejects.toBeInstanceOf(WplmProductMismatch);
  });

  it('offline: matching pid passes', async () => {
    const { token, publicKey } = signWithPid(42);
    const store = new InMemoryTokenStore();
    await store.write('wplm.signed_payload', token);
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: 'KEY',
      productId: 42,
      publicKeyBase64: publicKey,
      transport: new FakeTransport(offline),
      store,
    });
    const result = await client.validate(true);
    expect(result.valid).toBe(true);
    expect(result.fromCache).toBe(true);
  });

  it('offline: mismatched pid throws WplmProductMismatch', async () => {
    const { token, publicKey } = signWithPid(99);
    const store = new InMemoryTokenStore();
    await store.write('wplm.signed_payload', token);
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: 'KEY',
      productId: 42,
      publicKeyBase64: publicKey,
      transport: new FakeTransport(offline),
      store,
    });
    await expect(client.validate(true)).rejects.toBeInstanceOf(WplmProductMismatch);
  });

  it('offline: missing pid with productId set throws', async () => {
    const { token, publicKey } = signWithPid(null);
    const store = new InMemoryTokenStore();
    await store.write('wplm.signed_payload', token);
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: 'KEY',
      productId: 42,
      publicKeyBase64: publicKey,
      transport: new FakeTransport(offline),
      store,
    });
    await expect(client.validate(true)).rejects.toBeInstanceOf(WplmProductMismatch);
  });

  it('backward compatible: no productId skips the pid check', async () => {
    const { token, publicKey } = signWithPid(null);
    const store = new InMemoryTokenStore();
    await store.write('wplm.signed_payload', token);
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: 'KEY',
      publicKeyBase64: publicKey,
      transport: new FakeTransport(offline),
      store,
    });
    const result = await client.validate(true);
    expect(result.valid).toBe(true);
  });

  it('online recovers from a rotated signing key', async () => {
    // Token signed by the CURRENT key, but the store holds a STALE key.
    const { token, publicKey } = signWithPid(42);
    const stale = signWithPid(7); // different keypair
    const store = new InMemoryTokenStore();
    await store.write('wplm.public_key', stale.publicKey);
    const client = new WplmClient({
      baseUrl: 'https://example.test',
      licenseKey: 'KEY',
      productId: 42,
      // publicKeyBase64 omitted so it reads the stale store key first
      transport: new FakeTransport((_m, u) => {
        if (u.endsWith('/validate')) {
          return ok({
            valid: true,
            license: { id: 1, status: 1 },
            signed_payload: token,
            needs_activation: false,
          });
        }
        if (u.endsWith('/public-key')) {
          return ok({ public_key: publicKey });
        }
        return ok({ crl: '' });
      }),
      store,
    });
    const result = await client.validate();
    expect(result.valid).toBe(true);
  });
});
