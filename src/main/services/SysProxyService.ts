import { execSync } from 'child_process'
import { SysProxyStatus } from '@shared/ipc'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { SettingService } from './SettingService'

export class SysProxyService implements BaseService {
  private enabled = false
  private settingService: SettingService

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
    if (this.enabled) {
      await this.setSysProxy(false)
    }
  }

  getStatus(): SysProxyStatus {
    const settings = this.settingService.getSettings()
    return {
      enabled: this.enabled,
      mode: 'manual',
      port: settings.kernel.mixedPort
    }
  }

  async setSysProxy(enable: boolean): Promise<void> {
    const settings = this.settingService.getSettings()
    const port = settings.kernel.mixedPort
    const bypassList = settings.sysProxy.bypass.join(';')

    if (process.platform === 'win32') {
      try {
        const regBase = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
        if (enable) {
          execSync(`reg add "${regBase}" /v ProxyEnable /t REG_DWORD /d 1 /f`, { stdio: 'ignore' })
          execSync(`reg add "${regBase}" /v ProxyServer /t REG_SZ /d "127.0.0.1:${port}" /f`, {
            stdio: 'ignore'
          })
          execSync(`reg add "${regBase}" /v ProxyOverride /t REG_SZ /d "${bypassList}" /f`, {
            stdio: 'ignore'
          })
          this.enabled = true
          logger.info(`System proxy enabled on port ${port}`)
        } else {
          execSync(`reg add "${regBase}" /v ProxyEnable /t REG_DWORD /d 0 /f`, { stdio: 'ignore' })
          this.enabled = false
          logger.info('System proxy disabled')
        }
      } catch (err) {
        logger.error('Failed to update Windows system proxy settings', err)
      }
    } else {
      logger.info(`System proxy toggle (${enable}) requested on non-windows platform`)
      this.enabled = enable
    }

    await this.settingService.updateSettings({
      sysProxy: {
        ...settings.sysProxy,
        enable: this.enabled
      }
    })
  }
}
