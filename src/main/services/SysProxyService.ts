import { createServer, type Server } from 'node:http'
import { SysProxyStatus } from '@shared/ipc'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { SettingService } from './SettingService'
import { pacScript } from '../utils/pac'
import { flushSystemDns, notifySystemProxyChanged } from '../utils/network-transition'
import { WindowsProxySettings } from '../utils/windows-proxy'
import { LinuxProxySettings } from '../utils/linux-proxy'

export class SysProxyService implements BaseService {
  private enabled = false
  private coreRunning = false
  private settingService: SettingService
  private proxyUpdate: Promise<void> = Promise.resolve()
  private pacServer: Server | null = null
  private pacContent = ''
  private effectivePort?: number
  private portProvider?: () => Promise<number>

  setPortProvider(provider: () => Promise<number>): void { this.portProvider = provider }

  constructor(
    settingService: SettingService,
    private registry = new WindowsProxySettings(),
    private linuxProxy = new LinuxProxySettings()
  ) {
    this.settingService = settingService
  }

  async initialize(): Promise<void> {
    // Restore only changes owned by this app, preserving somebody else's proxy.
    try {
      if (process.platform === 'win32') await this.registry.restore()
      if (process.platform === 'linux') await this.linuxProxy.disable()
    } catch (error) {
      logger.error('Failed to restore initial system proxy state; continuing startup', error)
      try {
        if (process.platform === 'win32') {
          await this.registry.quarantineRecoveryFile?.()
          await this.registry.set('ProxyEnable', '0', 'REG_DWORD')
        }
      } catch (fallbackError) {
        logger.warn(`Failed to apply fallback proxy settings: ${String(fallbackError)}`)
      }
    }
  }

  async dispose(): Promise<void> {
    this.coreRunning = false
    await this.proxyUpdate
    if (this.enabled || process.platform === 'win32' || process.platform === 'linux') {
      await this.applySysProxy(false)
    }
    this.closePacServer()
  }

  getStatus(): SysProxyStatus {
    const settings = this.settingService.getSettings()
    return {
      enabled: this.enabled,
      mode: settings.sysProxy.mode ?? 'manual',
      host: settings.sysProxy.host || '127.0.0.1',
      port: this.coreRunning ? this.effectivePort ?? settings.kernel.mixedPort : settings.kernel.mixedPort
    }
  }

  waitForUpdates(): Promise<void> {
    return this.proxyUpdate
  }

  setSysProxy(enable: boolean, persist = true): Promise<void> {
    return this.enqueue(async () => {
      const previous = this.settingService.getSettings().sysProxy.enable
      await this.applySysProxy(enable && this.coreRunning)
      if (persist) {
        try {
          await this.settingService.updateSettings({ sysProxy: { ...this.settingService.getSettings().sysProxy, enable } })
        } catch (error) {
          await this.applySysProxy(previous && this.coreRunning)
          throw error
        }
      }
    })
  }

  setCoreRunning(running: boolean): Promise<void> {
    this.coreRunning = running
    return this.enqueue(async () => {
      const enable = this.coreRunning && this.settingService.getSettings().sysProxy.enable
      if (enable || this.enabled) await this.applySysProxy(enable)
    })
  }

  private enqueue(action: () => Promise<void>): Promise<void> {
    const update = this.proxyUpdate.then(action)
    this.proxyUpdate = update.catch(() => {})
    return update
  }

  private async applySysProxy(enable: boolean): Promise<void> {
    const settings = this.settingService.getSettings()
    const port = enable && this.portProvider ? await this.portProvider() : settings.kernel.mixedPort
    if (enable) this.effectivePort = port
    const bypassList = settings.sysProxy.bypass.join(';')
    const host = settings.sysProxy.host || '127.0.0.1'
    const mode = settings.sysProxy.mode ?? 'manual'
    let pacUrl = ''
    const hadServer = !!this.pacServer
    if (enable && mode === 'pac') {
      this.pacContent = pacScript(settings, port)
      pacUrl = await this.ensurePacServer()
    }

    if (process.platform === 'win32') {
      try {
        const setRegistryValue = (name: 'AutoConfigURL' | 'ProxyServer' | 'ProxyOverride' | 'ProxyEnable', type: 'REG_SZ' | 'REG_DWORD', value: string) => {
          return this.registry.set(name, value, type)
        }
        if (enable) await this.registry.capture()
        if (enable && mode === 'manual') {
          await setRegistryValue('AutoConfigURL', 'REG_SZ', '')
          await setRegistryValue('ProxyServer', 'REG_SZ', `${host.includes(':') ? `[${host}]` : host}:${port}`)
          await setRegistryValue('ProxyOverride', 'REG_SZ', bypassList)
          await setRegistryValue('ProxyEnable', 'REG_DWORD', '1')
          this.enabled = true
          logger.info(`System proxy enabled on port ${port}`)
          notifySystemProxyChanged()
        } else if (enable) {
          await setRegistryValue('ProxyEnable', 'REG_DWORD', '0')
          await setRegistryValue('AutoConfigURL', 'REG_SZ', pacUrl)
          this.enabled = true
          notifySystemProxyChanged()
        } else {
          await this.registry.restore()
          this.enabled = false
          logger.info('System proxy disabled')
          notifySystemProxyChanged()
          flushSystemDns()
        }
      } catch (err) {
        if (enable) {
          await this.registry.restore().then(() => { this.enabled = false }).catch(error => logger.error('Failed to restore system proxy after a partial update', error))
        }
        if (!hadServer) this.closePacServer()
        logger.error('Failed to update Windows system proxy settings', err)
        throw err
      }
    } else if (process.platform === 'linux') {
      try {
        if (enable && mode === 'manual') {
          await this.linuxProxy.setManual(host, port, settings.sysProxy.bypass)
          this.enabled = true
        } else if (enable && mode === 'pac') {
          await this.linuxProxy.setAuto(pacUrl)
          this.enabled = true
        } else {
          await this.linuxProxy.disable()
          this.enabled = false
          flushSystemDns()
        }
      } catch (err) {
        if (enable) {
          await this.linuxProxy.disable().then(() => { this.enabled = false })
            .catch(error => logger.error('Failed to restore Linux proxy after a partial update', error))
        }
        if (!hadServer) this.closePacServer()
        logger.error('Failed to update Linux system proxy settings', err)
        throw err
      }
    } else {
      logger.info(`System proxy toggle (${enable}) requested on non-windows platform`)
      this.enabled = enable
    }

    if (!enable || mode !== 'pac') this.closePacServer()
  }

  private async ensurePacServer(): Promise<string> {
    if (!this.pacServer) {
      const server = createServer((request, response) => {
        if (request.url !== '/proxy.pac') { response.writeHead(404); response.end(); return }
        response.writeHead(200, { 'Content-Type': 'application/x-ns-proxy-autoconfig', 'Cache-Control': 'no-cache' })
        response.end(this.pacContent)
      })
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
      })
      server.unref()
      this.pacServer = server
    }
    const address = this.pacServer.address()
    if (!address || typeof address === 'string') throw new Error('PAC server did not start')
    return `http://127.0.0.1:${address.port}/proxy.pac`
  }

  private closePacServer(): void {
    this.pacServer?.closeAllConnections()
    this.pacServer?.close()
    this.pacServer = null
  }
}
