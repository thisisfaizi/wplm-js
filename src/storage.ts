/** Pluggable persistent store for cached tokens. */

export interface TokenStore {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Default in-memory store. Inject a persistent one (e.g. localStorage) on device. */
export class InMemoryTokenStore implements TokenStore {
  private readonly data = new Map<string, string>();

  read(key: string): Promise<string | null> {
    return Promise.resolve(this.data.get(key) ?? null);
  }

  write(key: string, value: string): Promise<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
  }
}

/** A store backed by the Web Storage API (browser `localStorage`). */
export class WebStorageTokenStore implements TokenStore {
  constructor(
    private readonly storage: Storage,
    private readonly prefix = 'wplm.',
  ) {}

  read(key: string): Promise<string | null> {
    return Promise.resolve(this.storage.getItem(this.prefix + key));
  }

  write(key: string, value: string): Promise<void> {
    this.storage.setItem(this.prefix + key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.storage.removeItem(this.prefix + key);
    return Promise.resolve();
  }
}
