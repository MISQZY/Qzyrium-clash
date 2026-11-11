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
    private kernel: Pick<KernelService, 'getStatus' | 'restart' | 'patchConfigs'>,
    private proxy: Pick<SysProxyService, 'getStatus' | 'setSysProxy'>,
    private applyDesktop: (settings: AppConfig) => Promise<void> = async () => {},
    private changed: (general: boolean) => void = () => {},
    private elevated = isProcessElevated
  ) {}

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const task = this.pending.then(action)
    this.pending = task.catch(() => {})
    return task
  }

  updateSettings(patch: Partial<AppConfig>): Promise<AppConfig> {
    const snapshot = structuredClone(patch)
    return this.enqueue(() => this.apply(snapshot))
  }

  setSystemProxy(enable: boolean): Promise<void> {
    return this.enqueue(async () => {
      const current = this.settings.getSettings()
      await this.apply({ sysProxy: { ...current.sysProxy, enable } })
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

  private async apply(patch: Partial<AppConfig>): Promise<AppConfig> {
    const previous = structuredClone(this.settings.getSettings())
    let candidate = mergeSettings(previous, patch)
    if (patch.kernel?.tun?.enable) {
      if (!this.elevated()) throw new Error(nativeMessage(candidate.general.language, 'tunRequiresAdmin', candidate.general))
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
    try {
      if (candidate.kernel.tun.enable && (previous.sysProxy.enable || this.proxy.getStatus().enabled)) {
        await this.proxy.setSysProxy(false)
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
      if (patch.sysProxy || (previous.kernel.mixedPort !== updated.kernel.mixedPort && updated.sysProxy.enable)) {
        await this.proxy.setSysProxy(updated.sysProxy.enable)
      }
      this.changed(!!patch.general)
      return updated
    } catch (error) {
      const recover = async () => {
        if (saved) await this.settings.updateSettings(previous)
        if (liveModeChanged && this.kernel.getStatus() === 'running') await this.kernel.patchConfigs({ mode: previous.kernel.mode })
        if (saved && kernelChanged && !modeOnly && running()) await this.kernel.restart()
        if (proxyDisabled || (saved && patch.sysProxy)) await this.proxy.setSysProxy(previous.sysProxy.enable)
        if (patch.general) await this.applyDesktop(previous)
      }
      await recover().catch(recoveryError => logger.error('Failed to restore previous network settings', recoveryError))
      throw error
    }
  }
}
