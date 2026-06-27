import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { WplmClient } from '../src/client.js';
import { StaticDeviceInfoProvider } from '../src/deviceInfo.js';
import { WplmLimitExceeded, WplmNetworkError } from '../src/errors.js';
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
