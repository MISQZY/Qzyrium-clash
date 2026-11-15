import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from './logger'

const execute = promisify(execFile)

function toGVariantString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export class LinuxProxySettings {
  private gsettingsAvailable: boolean | null = null
  private kwriteconfigBin: string | null | undefined = undefined

  private isKde(): boolean {
    const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase()
    return desktop.includes('kde') || process.env.KDE_FULL_SESSION === 'true'
  }

  private async isGnomeAvailable(): Promise<boolean> {
    if (this.gsettingsAvailable !== null) return this.gsettingsAvailable
    try {
      await execute('gsettings', ['--version'], { timeout: 3000 })
      this.gsettingsAvailable = true
    } catch {
      this.gsettingsAvailable = false
    }
    return this.gsettingsAvailable
  }

  private async findKwriteconfig(): Promise<string | null> {
    if (this.kwriteconfigBin !== undefined) return this.kwriteconfigBin
    for (const bin of ['kwriteconfig6', 'kwriteconfig5']) {
      try {
        await execute(bin, ['--help'], { timeout: 2000 })
        this.kwriteconfigBin = bin
        return bin
      } catch {
        // try next binary
      }
    }
    this.kwriteconfigBin = null
    return null
  }

  private async reloadKde(): Promise<void> {
    try {
      await execute('dbus-send', [
        '--type=signal',
        '--dest=org.kde.kded5',
        '/kded',
        'org.kde.kded5.reloadConfiguration'
      ], { timeout: 2000 })
    } catch {
      try {
        await execute('dbus-send', [
          '--type=signal',
          '--dest=org.kde.kded6',
          '/kded',
          'org.kde.kded6.reloadConfiguration'
        ], { timeout: 2000 })
      } catch {
        // ignore
      }
    }
    try {
      await execute('dbus-send', [
        '--type=signal',
        '/KIO/Scheduler',
        'org.kde.KIO.Scheduler.reparseSlaveConfiguration',
        'string:'
      ], { timeout: 2000 })
    } catch {
      // ignore
    }
  }

  private async setKdeManual(host: string, port: number, bypass: string[] = []): Promise<boolean> {
    const bin = await this.findKwriteconfig()
    if (!bin) return false
    try {
      const url = `http://${host}:${port}`
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'ProxyType', '1'])
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'httpProxy', url])
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'httpsProxy', url])
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'socksProxy', `socks://${host}:${port}`])
      if (bypass.length) {
        await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'NoProxyFor', bypass.join(',')])
      }
      await this.reloadKde()
      logger.info(`Linux KDE system proxy set to manual: ${host}:${port}`)
      return true
    } catch (err) {
      logger.warn(`Failed to set KDE proxy settings: ${String(err)}`)
      return false
    }
  }

  private async setKdeAuto(pacUrl: string): Promise<boolean> {
    const bin = await this.findKwriteconfig()
    if (!bin) return false
    try {
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'ProxyType', '2'])
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'Proxy Config Script', pacUrl])
      await this.reloadKde()
      logger.info(`Linux KDE system proxy set to auto: ${pacUrl}`)
      return true
    } catch (err) {
      logger.warn(`Failed to set KDE auto proxy: ${String(err)}`)
      return false
    }
  }

  private async disableKde(): Promise<boolean> {
    const bin = await this.findKwriteconfig()
    if (!bin) return false
    try {
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'ProxyType', '0'])
      await this.reloadKde()
      logger.info('Linux KDE system proxy disabled')
      return true
    } catch (err) {
      logger.warn(`Failed to disable KDE proxy settings: ${String(err)}`)
      return false
    }
  }

  private async setGnomeManual(host: string, port: number, bypass: string[] = []): Promise<boolean> {
    if (!(await this.isGnomeAvailable())) return false
    try {
      const gvHost = toGVariantString(host)
      await execute('gsettings', ['set', 'org.gnome.system.proxy', 'mode', "'manual'"])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.http', 'host', gvHost])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.http', 'port', String(port)])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.https', 'host', gvHost])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.https', 'port', String(port)])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.socks', 'host', gvHost])
      await execute('gsettings', ['set', 'org.gnome.system.proxy.socks', 'port', String(port)])
      if (bypass.length) {
        const ignoreHosts = '[' + bypass.map(toGVariantString).join(', ') + ']'
        await execute('gsettings', ['set', 'org.gnome.system.proxy', 'ignore-hosts', ignoreHosts])
      }
      logger.info(`Linux GNOME system proxy set to manual: ${host}:${port}`)
      return true
    } catch (err) {
      logger.warn(`Failed to set GNOME proxy settings: ${String(err)}`)
      return false
    }
  }

  private async setGnomeAuto(pacUrl: string): Promise<boolean> {
    if (!(await this.isGnomeAvailable())) return false
    try {
      await execute('gsettings', ['set', 'org.gnome.system.proxy', 'mode', "'auto'"])
      await execute('gsettings', ['set', 'org.gnome.system.proxy', 'autoconfig-url', toGVariantString(pacUrl)])
      logger.info(`Linux GNOME system proxy set to auto: ${pacUrl}`)
      return true
    } catch (err) {
      logger.warn(`Failed to set GNOME auto proxy: ${String(err)}`)
      return false
    }
  }

  private async disableGnome(): Promise<boolean> {
    if (!(await this.isGnomeAvailable())) return false
    try {
      await execute('gsettings', ['set', 'org.gnome.system.proxy', 'mode', "'none'"])
      logger.info('Linux GNOME system proxy disabled')
      return true
    } catch (err) {
      logger.warn(`Failed to disable GNOME proxy settings: ${String(err)}`)
      return false
    }
  }

  async setManual(host: string, port: number, bypass: string[] = []): Promise<void> {
    if (this.isKde()) {
      const ok = await this.setKdeManual(host, port, bypass)
      if (ok) return
    }
    const gnomeOk = await this.setGnomeManual(host, port, bypass)
    if (!gnomeOk && !this.isKde()) {
      await this.setKdeManual(host, port, bypass)
    }
  }

  async setAuto(pacUrl: string): Promise<void> {
    if (this.isKde()) {
      const ok = await this.setKdeAuto(pacUrl)
      if (ok) return
    }
    const gnomeOk = await this.setGnomeAuto(pacUrl)
    if (!gnomeOk && !this.isKde()) {
      await this.setKdeAuto(pacUrl)
    }
  }

  async disable(): Promise<void> {
    if (this.isKde()) {
      const ok = await this.disableKde()
      if (ok) return
    }
    const gnomeOk = await this.disableGnome()
    if (!gnomeOk && !this.isKde()) {
      await this.disableKde()
    }
  }
}
