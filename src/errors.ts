/** Typed error hierarchy for the WPLM SDK. */

export class WplmError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Map a server error `code` to a concrete error type. */
  static fromCode(code: string, message: string, status?: number): WplmError {
    const map: Record<string, new (m: string, c?: string, s?: number) => WplmError> = {
      license_not_found: WplmNotFound,
      wplm_not_found: WplmNotFound,
      expired: WplmExpired,
      license_expired: WplmExpired,
      license_suspended: WplmSuspended,
      license_revoked: WplmRevoked,
      license_terminated: WplmTerminated,
      machine_limit_exceeded: WplmLimitExceeded,
      blacklisted: WplmBlacklisted,
      license_pending: WplmNotActive,
      license_not_active: WplmNotActive,
      machine_not_found: WplmMachineNotFound,
      machine_revoked: WplmRevoked,
      product_mismatch: WplmProductMismatch,
    };
    const Ctor = map[code] ?? WplmApiError;
    return new Ctor(message, code, status);
  }
}

export class WplmApiError extends WplmError {}
export class WplmNetworkError extends WplmError {}
export class WplmSignatureInvalid extends WplmError {}
export class WplmConfigError extends WplmError {}
export class WplmNotFound extends WplmError {}
export class WplmExpired extends WplmError {}
export class WplmSuspended extends WplmError {}
export class WplmRevoked extends WplmError {}
export class WplmTerminated extends WplmError {}
export class WplmLimitExceeded extends WplmError {}
export class WplmBlacklisted extends WplmError {}
export class WplmNotActive extends WplmError {}
export class WplmMachineNotFound extends WplmError {}

/**
 * The license is bound to a different product than this client expects.
 *
 * Thrown when the signed payload's `pid` does not match the configured
 * `productId`. Enforced online and offline from the cryptographically signed
 * payload, so a key issued for product A cannot run in product B's app.
 */
export class WplmProductMismatch extends WplmError {}
