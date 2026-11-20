import { isDeepStrictEqual } from 'node:util'
import type { AppConfig } from '@shared/app-config'
import type { TunnelMode } from '@shared/types'
import { mergeSettings } from '@shared/settings-config'
import { nativeMessage } from '@shared/localization'
import { isProcessElevated } from '../utils/elevation'
import { pacScript } from '../utils/pac'
import { logger } from '../utils/logger'
import type { SettingService } from './SettingService'
import type { KernelService } from './KernelService'
import type { SysProxyService } from './SysProxyService'

export class NetworkModeController {
  private pending: Promise<unknown> = Promise.resolve()

  constructor(
    private settings: Pick<SettingService, 'getSettings' | 'updateSettings'>,
    private kernel: Pick<KernelService, 'getStatus' | 'start' | 'stop' | 'restart' | 'patchConfigs'>,
    private proxy: Pick<SysProxyService, 'getStatus' | 'setSysProxy' | 'setCoreRunning'>,
    private applyDesktop: (settings: AppConfig) => Promise<void> = async () => {},
    private changed: (general: boolean) => void = () => {},
    private elevated = isProcessElevated
  ) {}

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const task = this.pending.then(action)
    this.pending = task.catch(() => {})
    return task
  }

  runExclusive<T>(action: () => Promise<T>): Promise<T> {
    return this.enqueue(action)
  }

  updateSettings(patch: Partial<AppConfig>): Promise<AppConfig> {
    const snapshot = structuredClone(patch)
    return this.enqueue(() => this.apply(snapshot))
  }

  setSystemProxy(enable: boolean): Promise<void> {
    return this.enqueue(async () => {
      const current = this.settings.getSettings()
      await this.apply({ sysProxy: { ...current.sysProxy, enable } }, enable)
    })
  }

  setTunEnabled(enable: boolean): Promise<void> {
    return this.enqueue(async () => {
      const current = this.settings.getSettings()
      await this.apply({ kernel: { ...current.kernel, tun: { ...current.kernel.tun, enable } } })
    })
  }

  setRoutingMode(mode: TunnelMode): Promise<void> {
    return this.enqueue(async () => {
      const current = this.settings.getSettings()
      await this.apply({ kernel: { ...current.kernel, mode } })
    })
  }

  private async apply(patch: Partial<AppConfig>, startProxy = false): Promise<AppConfig> {
    const previous = structuredClone(this.settings.getSettings())
    // The core manager owns channel changes; a settings draft may predate a switch.
    if (patch.kernel) patch = { ...patch, kernel: { ...patch.kernel, channel: previous.kernel.channel } }
    let candidate = mergeSettings(previous, patch)
    if (patch.kernel?.tun?.enable) {
      if (process.platform === 'win32' && !this.elevated()) throw new Error(nativeMessage(candidate.general.language, 'tunRequiresAdmin', candidate.general))
      candidate.sysProxy.enable = false
      patch = { ...patch, sysProxy: candidate.sysProxy }
    } else if (patch.sysProxy?.enable && candidate.kernel.tun.enable) {
      candidate.kernel.tun.enable = false
      patch = { ...patch, kernel: candidate.kernel }
    }
    candidate = mergeSettings(previous, patch)
    if (candidate.sysProxy.mode === 'pac') pacScript(candidate)
    const kernelChanged = !isDeepStrictEqual(previous.kernel, candidate.kernel)
    const modeOnly = kernelChanged && isDeepStrictEqual({ ...previous.kernel, mode: candidate.kernel.mode }, candidate.kernel)
    const running = () => ['running', 'starting'].includes(this.kernel.getStatus())
    let liveModeChanged = false
    let proxyDisabled = false
    let saved = false
    let startedCore = false
    try {
      if (candidate.kernel.tun.enable && (previous.sysProxy.enable || this.proxy.getStatus().enabled)) {
        await this.proxy.setSysProxy(false, false)
        proxyDisabled = true
      }
      if (modeOnly && this.kernel.getStatus() === 'running') {
        await this.kernel.patchConfigs({ mode: candidate.kernel.mode })
        liveModeChanged = true
      }
      if (patch.general) await this.applyDesktop(candidate)
      const updated = await this.settings.updateSettings(patch)
      saved = true
      if (kernelChanged && !modeOnly && running()) await this.kernel.restart()
      if (startProxy && updated.sysProxy.enable) {
        if (this.kernel.getStatus() !== 'running') {
          startedCore = !running()
          await this.kernel.start()
        }
        if (this.kernel.getStatus() !== 'running') throw new Error('Mihomo core did not start')
        await this.proxy.setCoreRunning(true)
      }
      if (patch.sysProxy || (previous.kernel.mixedPort !== updated.kernel.mixedPort && updated.sysProxy.enable)) {
        await this.proxy.setSysProxy(updated.sysProxy.enable, false)
      }
      this.changed(!!patch.general)
      return updated
    } catch (error) {
      const recover = async () => {
        if (saved) await this.settings.updateSettings(previous)
        if (startedCore) {
          await this.kernel.stop()
          await this.proxy.setCoreRunning(false)
        }
        if (liveModeChanged && this.kernel.getStatus() === 'running') await this.kernel.patchConfigs({ mode: previous.kernel.mode })
        if (saved && kernelChanged && !modeOnly && running()) await this.kernel.restart()
        if (proxyDisabled || (saved && patch.sysProxy)) await this.proxy.setSysProxy(previous.sysProxy.enable, false)
        if (patch.general) await this.applyDesktop(previous)
      }
      await recover().catch(recoveryError => logger.error('Failed to restore previous network settings', recoveryError))
      throw error
    }
  }
}
