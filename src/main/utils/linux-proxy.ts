import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from './logger'
import path from 'node:path'
import { getAppPaths } from './paths'
import { writeFileAtomicAsync } from './atomicWrite'
import { entries, readSnapshot, restoreSnapshot, type LinuxProxySnapshot } from '../../../resources/linux-proxy-recovery.cjs'

const executeFile = promisify(execFile)
const execute = (binary: string, args: string[], options = { timeout: 5000 }) => executeFile(binary, args, options)

function toGVariantString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export class LinuxProxySettings {
  private gsettingsAvailable: boolean | null = null
  private kwriteconfigBin: string | null | undefined = undefined

  constructor(private filename = () => path.join(getAppPaths().userData, 'linux-proxy-recovery.json')) {}

  private async capture(): Promise<LinuxProxySnapshot> {
    const previous = readSnapshot(this.filename())
    if (previous) return previous
    const kde = this.isKde() ? await this.findKwriteconfig() : null
    const backend = kde ? 'kde' : await this.isGnomeAvailable() ? 'gnome' : 'kde'
    const binary = backend === 'gnome' ? 'gsettings' : kde ?? await this.findKwriteconfig()
    if (!binary) throw new Error('Failed to find a supported Linux proxy backend')
    const snapshot: LinuxProxySnapshot = { version: 1, backend, binary, values: [] }
    const absent = `qzyrium-absent-${Math.random().toString(36).slice(2)}`
    for (const entry of entries(backend)) {
      const { stdout } = await execute(backend === 'gnome' ? binary : binary.replace('kwriteconfig', 'kreadconfig'),
        backend === 'gnome' ? ['get', entry.schema, entry.key]
          : ['--file', 'kioslaverc', '--group', entry.schema, '--key', entry.key, '--default', absent], { timeout: 5000 })
      const value = stdout.replace(/\r?\n$/, '')
      snapshot.values.push({ ...entry, value: backend === 'kde' && value === absent ? null : value })
    }
    await writeFileAtomicAsync(this.filename(), JSON.stringify(snapshot))
    return snapshot
  }

  private async apply(change: (snapshot: LinuxProxySnapshot) => Promise<boolean>): Promise<void> {
    const snapshot = await this.capture()
    try {
      if (!await change(snapshot)) throw new Error('Failed to apply Linux system proxy settings')
    } catch (error) {
      await this.disable().catch(recoveryError => logger.error('Failed to restore Linux proxy after partial update', recoveryError))
      throw error
    }
  }

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
      const address = host.includes(':') ? `[${host}]` : host
      const url = `http://${address}:${port}`
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'ProxyType', '1'])
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'httpProxy', url])
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'httpsProxy', url])
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'socksProxy', `socks://${address}:${port}`])
      await execute(bin, ['--file', 'kioslaverc', '--group', 'Proxy Settings', '--key', 'NoProxyFor', bypass.join(',')])
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
      const ignoreHosts = '[' + bypass.map(toGVariantString).join(', ') + ']'
      await execute('gsettings', ['set', 'org.gnome.system.proxy', 'ignore-hosts', ignoreHosts])
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

  async setManual(host: string, port: number, bypass: string[] = []): Promise<void> {
    await this.apply(snapshot => snapshot.backend === 'kde'
      ? this.setKdeManual(host, port, bypass) : this.setGnomeManual(host, port, bypass))
  }

  async setAuto(pacUrl: string): Promise<void> {
    await this.apply(snapshot => snapshot.backend === 'kde' ? this.setKdeAuto(pacUrl) : this.setGnomeAuto(pacUrl))
  }

  async disable(): Promise<void> {
    await restoreSnapshot(this.filename(), execute)
  }
}
