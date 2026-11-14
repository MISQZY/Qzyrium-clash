import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from './logger'

const execute = promisify(execFile)

function toGVariantString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export class LinuxProxySettings {
  private gsettingsAvailable: boolean | null = null

  private async isAvailable(): Promise<boolean> {
    if (this.gsettingsAvailable !== null) return this.gsettingsAvailable
    try {
      await execute('gsettings', ['--version'], { timeout: 3000 })
      this.gsettingsAvailable = true
    } catch {
      this.gsettingsAvailable = false
    }
    return this.gsettingsAvailable
  }

  async setManual(host: string, port: number): Promise<void> {
    if (!(await this.isAvailable())) return
    try {
      const gvHost = toGVariantString(host)
      await execute('gsettings', ['set', 'org.gnome.system.proxy', 'mode', "'manual'"])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.http', 'host', gvHost])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.http', 'port', String(port)])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.https', 'host', gvHost])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.https', 'port', String(port)])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.socks', 'host', gvHost])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.socks', 'port', String(port)])
      logger.info(`Linux GNOME system proxy set to manual: ${host}:${port}`)
    } catch (err) {
      logger.warn(`Failed to set GNOME proxy settings: ${String(err)}`)
    }
  }

  async setAuto(pacUrl: string): Promise<void> {
    if (!(await this.isAvailable())) return
    try {
      await execute('gsettings', ['set', 'org.gnome.system.proxy', 'mode', "'auto'"])
      await execute('gsettings', ['set', 'org.gnome.system.proxy', 'autoconfig-url', toGVariantString(pacUrl)])
      logger.info(`Linux GNOME system proxy set to auto: ${pacUrl}`)
    } catch (err) {
      logger.warn(`Failed to set GNOME auto proxy: ${String(err)}`)
    }
  }

  async disable(): Promise<void> {
    if (!(await this.isAvailable())) return
    try {
      await execute('gsettings', ['set', 'org.gnome.system.proxy', 'mode', "'none'"])
      logger.info('Linux GNOME system proxy disabled')
    } catch (err) {
      logger.warn(`Failed to disable GNOME proxy settings: ${String(err)}`)
    }
  }
}
