import { NetworkModeController } from './NetworkModeController'
import { BaseService } from './BaseService'
import { KernelService } from './KernelService'
import { ProfileService } from './ProfileService'
import { SettingService } from './SettingService'
import { SysProxyService } from './SysProxyService'
import { TrayService } from './TrayService'
import { WindowService } from './WindowService'
import { DesktopService } from './DesktopService'
import { ThemeStore } from './ThemeStore'
import { UpdateService } from './UpdateService'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'
import { isProcessElevated } from '../utils/elevation'
import { saveRestartState, readRestartState, clearRestartState } from '../utils/restart-state'

const defaults = { SettingService, ProfileService, SysProxyService, KernelService, WindowService, TrayService, DesktopService, ThemeStore, UpdateService, NetworkModeController }
export type ServiceConstructors = typeof defaults

/** Composition root: creation and event wiring happen before lifecycle startup. */
export function createApplicationServices(overrides: Partial<ServiceConstructors> = {}) {
  const types = { ...defaults, ...overrides }
    const settingService = new types.SettingService()
    const profileService = new types.ProfileService(settingService)
    const sysProxyService = new types.SysProxyService(settingService)
    const kernelService = new types.KernelService(settingService, profileService)
    profileService.setCoreStatusProvider?.(() => kernelService.getStatus() === 'running')
    const themeStore = new types.ThemeStore(getAppPaths().userData)
    const windowService = new types.WindowService(settingService, themeStore)
    const networkModeController = new types.NetworkModeController(settingService, kernelService, sysProxyService,
      async settings => { await desktopService?.applySettings(settings) },
      general => {
        if (general) windowService.updateTheme()
        windowService.broadcast('event:settings-changed', null)
        trayService?.updateContextMenu()
      })
    const trayService = new types.TrayService(
      windowService,
      kernelService,
      sysProxyService,
      settingService,
      networkModeController
    )
    const desktopService = new types.DesktopService(settingService, profileService, kernelService, sysProxyService, windowService, () => {
      windowService.broadcast('event:settings-changed', null)
      trayService.updateContextMenu()
    }, networkModeController)
    const updateService = new types.UpdateService((channel, payload) => windowService.broadcast(channel, payload), async () => {
      const window = windowService.getMainWindow()
      saveRestartState({ running: ['running', 'starting'].includes(kernelService.getStatus()), visible: !!window?.isVisible() && !window.isMinimized(), elevated: isProcessElevated(), coreOnly: windowService.isCoreOnlyMode() })
      await desktopService.dispose()
      await kernelService.stop()
      await sysProxyService.setCoreRunning(false)
    }, () => settingService.getSettings().general.autoCheckUpdates !== false, async () => {
      const state = readRestartState()
      clearRestartState()
      await desktopService.initialize()
      if (state?.running) await kernelService.start()
      await sysProxyService.setCoreRunning(kernelService.getStatus() === 'running')
    })

    // Route kernel broadcasts to renderer via WindowService
    kernelService.setBroadcaster((channel, data) => {
      windowService.broadcast(channel, data)
      if (channel === 'event:core-status') {
        if (data === 'running') {
          void trayService.refreshProxies().then(() => {
            trayService.updateContextMenu()
          })
        } else if (data === 'error' || data === 'stopped') {
          trayService.clearProxies()
        }
        trayService.updateContextMenu()
        if (data === 'running' || data === 'error' || data === 'stopped') {
          void sysProxyService.setCoreRunning(data === 'running').then(() => {
            windowService.broadcast('event:settings-changed', null)
            trayService.updateContextMenu()
          }).catch((error) => logger.error('Failed to synchronize system proxy with the core', error))
        }
      }
    })

    // Pause network streams while the interface is hidden.
    windowService.setVisibilityHandler((visible: boolean) => {
      if (visible) {
        kernelService.resumeStreams()
      } else {
        kernelService.pauseStreams()
      }
    })
    windowService.setModeChangedHandler(() => trayService.updateContextMenu())

    // Ordered lifecycle array: window is created early for instant UI presentation
    const services: BaseService[] = [
      settingService,
      profileService,
      windowService,
      updateService,
      sysProxyService,
      trayService,
      kernelService,
      desktopService
    ]
    return { settingService, profileService, sysProxyService, kernelService, windowService, trayService, desktopService, themeStore, updateService, networkModeController, services }
}

export type ApplicationServices = ReturnType<typeof createApplicationServices>
