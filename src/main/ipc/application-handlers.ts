import { app, clipboard, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { ServiceManager } from '../services/ServiceManager'
import { logger } from '../utils/logger'
import { isProcessElevated, restartAsAdmin } from '../utils/elevation'
import { saveRestartState } from '../utils/restart-state'
import { createRestartCoordinator } from '../services/restart-coordinator'
import { getProcessIconDataUrl, clearProcessIconCache } from '../utils/process-icon'
import type { TrustedRegistrar } from './trusted-handler'

export function registerApplicationHandlers(
  handle: TrustedRegistrar,
  services: Pick<ServiceManager, 'windowService' | 'kernelService' | 'sysProxyService' | 'desktopService' | 'updateService' | 'settingService' | 'profileService'>
): void {
  handle(IPC_CHANNELS.APP_IMPORT_RENDERER_READY, () => services.windowService.importRendererReady())
  handle(IPC_CHANNELS.APP_COMPLETE_PROFILE_IMPORT, (_, id: string) => services.windowService.completeProfileImport(id))

  handle(IPC_CHANNELS.APP_ENTER_CORE_ONLY, () => {
    clearProcessIconCache()
    // Let the IPC response finish before destroying its sender.
    setImmediate(() => services.windowService.setCoreOnlyMode(true))
  })

  handle(IPC_CHANNELS.APP_MINIMIZE, () => {
    services.windowService.minimize()
  })

  handle(IPC_CHANNELS.APP_MAXIMIZE, () => {
    services.windowService.maximize()
  })

  handle(IPC_CHANNELS.APP_CLOSE, () => {
    services.windowService.close()
  })

  handle(IPC_CHANNELS.APP_OPEN_FOLDER, async (_, target: 'logs' | 'appLogs' | 'connectionLogs' | 'data' | 'profiles') => {
    await services.windowService.openFolder(target)
  })

  handle(IPC_CHANNELS.APP_IS_ELEVATED, () => {
    return isProcessElevated()
  })

  handle(IPC_CHANNELS.APP_RESTART_AS_ADMIN, async () => {
    const wasRunning = ['running', 'starting'].includes(services.kernelService.getStatus())
    saveRestartState({ running: wasRunning, visible: true, elevated: true })
    const coordinator = createRestartCoordinator(services)
    await coordinator.teardown()
    let restarted = false
    try {
      restarted = await restartAsAdmin()
    } finally {
      if (!restarted) {
        await coordinator.rollback(wasRunning)
      }
    }
    return restarted
  })

  handle(IPC_CHANNELS.APP_GET_PROCESS_ICON, async (_, processPath: string) => {
    return getProcessIconDataUrl(processPath)
  })

  handle(IPC_CHANNELS.APP_GET_APP_VERSION, () => {
    return app.getVersion()
  })

  handle(IPC_CHANNELS.APP_CHECK_UPDATES, () => services.updateService.checkUpdates(true))

  handle(IPC_CHANNELS.APP_GET_UPDATER_STATUS, () => services.updateService.getStatus())

  handle(IPC_CHANNELS.APP_DOWNLOAD_UPDATE, () => services.updateService.downloadUpdate())

  handle(IPC_CHANNELS.APP_GET_WHATS_NEW, (_event, force?: boolean) => services.updateService.getWhatsNew(force))

  handle(IPC_CHANNELS.APP_OPEN_URL, async (_, url: string) => {
    if (typeof url === 'string') {
      try {
        const parsed = new URL(url)
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          await shell.openExternal(parsed.href)
        } else {
          logger.warn(`Rejected opening unsafe URL protocol: ${parsed.protocol}`)
        }
      } catch {
        logger.warn(`Rejected malformed URL: ${url}`)
      }
    }
  })

  handle(IPC_CHANNELS.APP_COPY_TO_CLIPBOARD, async (_, text: string) => {
    if (typeof text === 'string') {
      clipboard.writeText(text)
      return true
    }
    return false
  })

  handle(IPC_CHANNELS.APP_READ_CLIPBOARD, async () => {
    const text = await clipboard.readText()
    if (text.length > 8192) {
      return text.slice(0, 8192)
    }
    return text
  })

  handle(IPC_CHANNELS.APP_GET_BOOT_SNAPSHOT, async () => {
    const coreStatus = services.kernelService.getStatus()
    return {
      settings: services.settingService.getSettings(),
      profiles: services.profileService.getProfiles(),
      activeProfile: services.profileService.getActiveProfile(),
      coreStatus,
      coreFailure: services.kernelService.getFailure?.() ?? null,
      sessionStartedAt: coreStatus === 'running'
        ? await (services.kernelService.getSessionStartedAt?.() ?? Promise.resolve(null))
        : null,
      sysProxy: await (async () => {
        await services.sysProxyService.waitForUpdates?.()
        return services.sysProxyService.getStatus()
      })()
    }
  })
}
