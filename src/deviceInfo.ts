/** Device metadata sent to the server on activate/heartbeat. */

export interface WplmDeviceInfo {
  readonly name?: string;
  readonly hostname?: string;
  readonly platform?: string;
  readonly appVersion?: string;
}

export interface DeviceInfoProvider {
  get(): Promise<WplmDeviceInfo>;
}

/**
 * A device-info provider built from a static object — supply host-appropriate
 * values (e.g. from Electron's `os` module or a browser's `navigator`).
 */
export class StaticDeviceInfoProvider implements DeviceInfoProvider {
  constructor(private readonly info: WplmDeviceInfo) {}

  get(): Promise<WplmDeviceInfo> {
    return Promise.resolve(this.info);
  }
}
