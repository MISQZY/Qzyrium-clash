import { IPC_CHANNELS } from '@shared/ipc'
import type { AppConfig } from '@shared/app-config'
import type { ServiceManager } from '../services/ServiceManager'
import { logger } from '../utils/logger'
import type { TrustedRegistrar } from './trusted-handler'

export function registerSettingsHandlers(
  handle: TrustedRegistrar,
  services: Pick<ServiceManager, 'windowService' | 'desktopService' | 'sysProxyService' | 'networkModeController' | 'trayService' | 'settingService'>
): void {
  let finishShortcutRecording: (() => void) | undefined

  handle(IPC_CHANNELS.APP_SET_SHORTCUT_RECORDING, (event, recording: boolean) => {
    const win = services.windowService.getMainWindow()
    if (!win || event.sender !== win.webContents || typeof recording !== 'boolean') throw new Error('Invalid shortcut recorder')
    finishShortcutRecording?.()
    if (!recording || !win.isFocused()) return
    services.desktopService.setShortcutRecording(true)
    const stop = () => {
      clearTimeout(timer)
      win.removeListener('blur', stop)
      win.removeListener('hide', stop)
      event.sender.removeListener('destroyed', stop)
      event.sender.removeListener('render-process-gone', stop)
      event.sender.removeListener('did-start-navigation', stop)
      finishShortcutRecording = undefined
      try { services.desktopService.setShortcutRecording(false) }
      catch (error) { logger.error('Failed to restore shortcuts after recording', error) }
    }
    const timer = setTimeout(stop, 45_000)
    timer.unref()
    finishShortcutRecording = stop
    win.once('blur', stop)
    win.once('hide', stop)
    event.sender.once('destroyed', stop)
    event.sender.once('render-process-gone', stop)
    event.sender.once('did-start-navigation', stop)
  })

  handle(IPC_CHANNELS.SYSPROXY_GET_STATUS, async () => {
    await services.sysProxyService.waitForUpdates()
    return services.sysProxyService.getStatus()
  })

  handle(IPC_CHANNELS.SYSPROXY_SET, async (_, enable: boolean) => {
    await services.networkModeController.setSystemProxy(enable)
    services.trayService.updateContextMenu()
  })

  handle(IPC_CHANNELS.APP_GET_SETTINGS, () => {
    return services.settingService.getSettings()
  })

  handle(IPC_CHANNELS.APP_UPDATE_SETTINGS, async (_, patch: Partial<AppConfig>) => {
    finishShortcutRecording?.()
    return services.networkModeController.updateSettings(patch)
  })
}
