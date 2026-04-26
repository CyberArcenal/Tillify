
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DeviceInfo {
  /**
   * Get machine ID based on platform
   * @returns {Promise<string>}
   */
  static async getMachineId() {
    try {
      const platform = process.platform;
      let machineId = '';

      switch (platform) {
        case 'win32':
          machineId = await this.getWindowsMachineId();
          break;
        case 'darwin':
          machineId = await this.getMacMachineId();
          break;
        case 'linux':
          machineId = await this.getLinuxMachineId();
          break;
        default:
          machineId = await this.getFallbackId();
      }

      // Combine with MAC address
      const macAddress = await this.getMacAddress();
      const combined = `${machineId}:${macAddress}`;
      
      // Create SHA256 hash
      return crypto
        .createHash('sha256')
        .update(combined)
        .digest('hex')
        .toUpperCase();
    } catch (error) {
      console.error('Error getting machine ID:', error);
      return this.getFallbackId();
    }
  }

  /**
   * Get Windows machine ID
   * @returns {Promise<string>}
   */
  static async getWindowsMachineId() {
    try {
      const stdout = execSync(
        'wmic csproduct get uuid',
        { encoding: 'utf-8', windowsHide: true }
      );
      const lines = stdout.split('\n');
      return lines[1]?.trim() || '';
    } catch {
      // Fallback to serial number
      try {
        const stdout = execSync(
          'wmic bios get serialnumber',
          { encoding: 'utf-8', windowsHide: true }
        );
        const lines = stdout.split('\n');
        return lines[1]?.trim() || '';
      } catch {
        return os.hostname();
      }
    }
  }

  /**
   * Get macOS machine ID
   * @returns {Promise<string>}
   */
  static async getMacMachineId() {
    try {
      const stdout = execSync(
        'ioreg -rd1 -c IOPlatformExpertDevice | grep -E \'(UUID|IOPlatformSerialNumber)\'',
        { encoding: 'utf-8' }
      );
      const match = stdout.match(/"IOPlatformSerialNumber" = "([^"]+)"/);
      return match ? match[1] : os.hostname();
    } catch {
      return os.hostname();
    }
  }

  /**
   * Get Linux machine ID
   * @returns {Promise<string>}
   */
  static async getLinuxMachineId() {
    try {
      // Try /etc/machine-id first
      if (fs.existsSync('/etc/machine-id')) {
        const content = fs.readFileSync('/etc/machine-id', 'utf-8').trim();
        if (content) return content;
      }

      // Try /var/lib/dbus/machine-id
      if (fs.existsSync('/var/lib/dbus/machine-id')) {
        const content = fs.readFileSync('/var/lib/dbus/machine-id', 'utf-8').trim();
        if (content) return content;
      }

      return os.hostname();
    } catch {
      return os.hostname();
    }
  }

  /**
   * Get fallback ID
   * @returns {string}
   */
  static getFallbackId() {
    const hostname = os.hostname();
    const arch = os.arch();
    const totalMem = os.totalmem();
    
    const combined = `${hostname}:${arch}:${totalMem}`;
    return crypto
      .createHash('md5')
      .update(combined)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Get MAC address
   * @returns {Promise<string>}
   */
  static async getMacAddress() {
    try {
      const networkInterfaces = os.networkInterfaces();
      let macAddress = '';

      for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        // @ts-ignore
        for (const iface of interfaces) {
          if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
            macAddress = iface.mac;
            break;
          }
        }
        if (macAddress) break;
      }

      return macAddress || '00:00:00:00:00:00';
    } catch {
      return '00:00:00:00:00:00';
    }
  }

  /**
   * Get device fingerprint
   * @returns {Promise<{
   *   deviceId: string,
   *   platform: string,
   *   hostname: string,
   *   macAddress: string,
   *   cpuArch: string,
   *   totalMemory: number
   * }>}
   */
  static async getDeviceFingerprint() {
    const deviceId = await this.getMachineId();
    const macAddress = await this.getMacAddress();

    return {
      deviceId,
      platform: process.platform,
      hostname: os.hostname(),
      macAddress,
      cpuArch: os.arch(),
      totalMemory: os.totalmem(),
      // @ts-ignore
      cpuCount: os.cpus().length,
      homeDir: os.homedir(),
      tempDir: os.tmpdir()
    };
  }

  /**
   * Generate activation request data
   * @returns {Promise<{
   *   deviceId: string,
   *   timestamp: string,
   *   appVersion: string,
   *   data: string
   * }>}
   */
  static async generateActivationRequest() {
    const fingerprint = await this.getDeviceFingerprint();
    const timestamp = new Date().toISOString();
    
    // Create a hash of the fingerprint
    const dataString = JSON.stringify(fingerprint);
    const hash = crypto
      .createHash('sha256')
      .update(dataString + timestamp)
      .digest('hex');

    return {
      deviceId: fingerprint.deviceId,
      timestamp,
      appVersion: require('../../package.json').version,
      data: dataString,
      // @ts-ignore
      hash
    };
  }
}

module.exports = DeviceInfo;