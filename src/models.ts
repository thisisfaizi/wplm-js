/** Immutable data models mirroring the WPLM server responses. */

function asInt(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

export interface License {
  readonly id: number;
  readonly status: number;
  readonly statusLabel: string;
  readonly activationCount: number;
  readonly maxActivations?: number;
  readonly productId?: number;
  readonly expiresAt?: string;
}

export function licenseFromJson(data: Record<string, unknown>): License {
  return {
    id: asInt(data['id']) ?? 0,
    status: asInt(data['status']) ?? 0,
    statusLabel: typeof data['status_label'] === 'string' ? data['status_label'] : '',
    activationCount: asInt(data['activation_count']) ?? 0,
    maxActivations: asInt(data['max_activations']),
    productId: asInt(data['product_id']),
    expiresAt: typeof data['expires_at'] === 'string' ? data['expires_at'] : undefined,
  };
}

export interface Machine {
  readonly id: number;
  readonly licenseId: number;
  readonly fingerprint: string;
  readonly status: number;
  readonly name?: string;
  readonly platform?: string;
}

export function machineFromJson(data: Record<string, unknown>): Machine {
  return {
    id: asInt(data['id']) ?? 0,
    licenseId: asInt(data['license_id']) ?? 0,
    fingerprint: typeof data['fingerprint'] === 'string' ? data['fingerprint'] : '',
    status: asInt(data['status']) ?? 1,
    name: typeof data['name'] === 'string' ? data['name'] : undefined,
    platform: typeof data['platform'] === 'string' ? data['platform'] : undefined,
  };
}

export function machineIsActive(m: Machine): boolean {
  return m.status === 1;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly code?: string;
  readonly license?: License;
  readonly signedPayload?: string;
  readonly needsActivation: boolean;
  readonly fromCache: boolean;
}

export function validationResultFromJson(
  data: Record<string, unknown>,
  fromCache = false,
): ValidationResult {
  const lic = data['license'];
  return {
    valid: data['valid'] === true,
    code: typeof data['code'] === 'string' ? data['code'] : undefined,
    license:
      typeof lic === 'object' && lic !== null
        ? licenseFromJson(lic as Record<string, unknown>)
        : undefined,
    signedPayload: typeof data['signed_payload'] === 'string' ? data['signed_payload'] : undefined,
    needsActivation: data['needs_activation'] === true,
    fromCache,
  };
}
