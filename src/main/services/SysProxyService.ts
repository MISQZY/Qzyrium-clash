import { execFile } from 'child_process'
import { promisify } from 'node:util'
import { createServer, type Server } from 'node:http'
import { SysProxyStatus } from '@shared/ipc'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { SettingService } from './SettingService'
import { pacScript } from '../utils/pac'

const execFileAsync = promisify(execFile)

export class SysProxyService implements BaseService {
  private enabled = false
  private settingService: SettingService
  private proxyUpdate: Promise<void> = Promise.resolve()
  private pacServer: Server | null = null
  private pacContent = ''

  constructor(settingService: SettingService) {
    this.settingService = settingService
  }

  async initialize(): Promise<void> {
    const settings = this.settingService.getSettings()
    if (settings.sysProxy.enable) {
      await this.setSysProxy(true)
    }
  }

  async dispose(): Promise<void> {
    await this.proxyUpdate
    if (this.enabled) {
      await this.applySysProxy(false, false)
    }
    this.closePacServer()
  }

  getStatus(): SysProxyStatus {
    const settings = this.settingService.getSettings()
    return {
      enabled: this.enabled,
      mode: settings.sysProxy.mode ?? 'manual',
      host: settings.sysProxy.host || '127.0.0.1',
      port: settings.kernel.mixedPort
    }
  }

  waitForUpdates(): Promise<void> {
    return this.proxyUpdate
  }

  setSysProxy(enable: boolean): Promise<void> {
    const update = this.proxyUpdate.then(() => this.applySysProxy(enable))
    this.proxyUpdate = update.catch(() => {})
    return update
  }

  private async applySysProxy(enable: boolean, persist = true): Promise<void> {
    const settings = this.settingService.getSettings()
    const port = settings.kernel.mixedPort
    const bypassList = settings.sysProxy.bypass.join(';')
    const host = settings.sysProxy.host || '127.0.0.1'
    const mode = settings.sysProxy.mode ?? 'manual'
    let pacUrl = ''
    const hadServer = !!this.pacServer
    if (enable && mode === 'pac') {
      this.pacContent = pacScript(settings)
      pacUrl = await this.ensurePacServer()
    }

    if (process.platform === 'win32') {
      try {
        const regBase = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
        const setRegistryValue = (name: string, type: string, value: string) => {
          return execFileAsync('reg.exe', ['add', regBase, '/v', name, '/t', type, '/d', value, '/f'], { windowsHide: true })
        }
        if (enable && mode === 'manual') {
          await setRegistryValue('AutoConfigURL', 'REG_SZ', '')
          await setRegistryValue('ProxyServer', 'REG_SZ', `${host.includes(':') ? `[${host}]` : host}:${port}`)
          await setRegistryValue('ProxyOverride', 'REG_SZ', bypassList)
          await setRegistryValue('ProxyEnable', 'REG_DWORD', '1')
          this.enabled = true
          logger.info(`System proxy enabled on port ${port}`)
        } else if (enable) {
          await setRegistryValue('ProxyEnable', 'REG_DWORD', '0')
          await setRegistryValue('AutoConfigURL', 'REG_SZ', pacUrl)
          this.enabled = true
        } else {
          await setRegistryValue('AutoConfigURL', 'REG_SZ', '')
          await setRegistryValue('ProxyEnable', 'REG_DWORD', '0')
          this.enabled = false
          logger.info('System proxy disabled')
        }
      } catch (err) {
        if (!hadServer) this.closePacServer()
        logger.error('Failed to update Windows system proxy settings', err)
        throw err
      }
    } else {
      logger.info(`System proxy toggle (${enable}) requested on non-windows platform`)
      this.enabled = enable
    }

    if (!enable || mode !== 'pac') this.closePacServer()
    if (persist) await this.settingService.updateSettings({
      sysProxy: {
        ...settings.sysProxy,
        enable: this.enabled
      }
    })
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
