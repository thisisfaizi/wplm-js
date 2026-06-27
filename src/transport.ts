/** Pluggable HTTP transport (isomorphic `fetch` by default). */

import { WplmNetworkError } from './errors.js';

export interface WplmResponse {
  readonly statusCode: number;
  readonly body: string;
}

export interface Transport {
  send(
    method: string,
    url: string,
    headers?: Record<string, string>,
    body?: string,
  ): Promise<WplmResponse>;
}

/** Default transport using the global `fetch`. */
export class FetchTransport implements Transport {
  constructor(private readonly timeoutMs = 15000) {}

  async send(
    method: string,
    url: string,
    headers: Record<string, string> = {},
    body?: string,
  ): Promise<WplmResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const text = await res.text();
      return { statusCode: res.status, body: text };
    } catch (e) {
      throw new WplmNetworkError(e instanceof Error ? e.message : 'Network request failed');
    } finally {
      clearTimeout(timer);
    }
  }
}
