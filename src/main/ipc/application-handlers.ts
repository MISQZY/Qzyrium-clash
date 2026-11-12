import { app, clipboard, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import type { ServiceManager } from '../services/ServiceManager'
import { logger } from '../utils/logger'
import { isProcessElevated, restartAsAdmin } from '../utils/elevation'
import { saveRestartState, clearRestartState } from '../utils/restart-state'
import type { TrustedRegistrar } from './trusted-handler'

export function registerApplicationHandlers(
  handle: TrustedRegistrar,
  services: Pick<ServiceManager, 'windowService' | 'kernelService' | 'sysProxyService' | 'desktopService' | 'updateService' | 'settingService' | 'profileService'>
): void {
  const MAX_ICON_CACHE = 80
  handle(IPC_CHANNELS.APP_IMPORT_RENDERER_READY, () => services.windowService.importRendererReady())
  handle(IPC_CHANNELS.APP_COMPLETE_PROFILE_IMPORT, (_, id: string) => services.windowService.completeProfileImport(id))

  const iconCache = new Map<string, string>()

  const setCachedIcon = (key: string, value: string) => {
    if (iconCache.size >= MAX_ICON_CACHE) {
      const oldest = iconCache.keys().next().value
      if (oldest) iconCache.delete(oldest)
    }
    iconCache.set(key, value)
  }

  handle(IPC_CHANNELS.APP_ENTER_CORE_ONLY, () => {
    iconCache.clear()
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
    try {
      await services.sysProxyService.setCoreRunning(false)
    } catch (err) {
      logger.warn(`Failed to disable system proxy before admin restart: ${String(err)}`)
    }
    try {
      await services.kernelService.stop()
    } catch (err) {
      logger.warn(`Failed to stop kernel before admin restart: ${String(err)}`)
    }
    try {
      await services.desktopService.dispose()
    } catch (err) {
      logger.warn(`Failed to dispose desktop service before admin restart: ${String(err)}`)
    }
    let restarted = false
    try { restarted = await restartAsAdmin() }
    finally {
      if (!restarted) {
        clearRestartState()
        await services.desktopService.initialize()
        if (wasRunning) await services.kernelService.start()
        await services.sysProxyService.setCoreRunning(services.kernelService.getStatus() === 'running')
      }
    }
    return restarted
  })

  handle(IPC_CHANNELS.APP_GET_PROCESS_ICON, async (_, processPath: string) => {
    if (!processPath || typeof processPath !== 'string') return null
    if (iconCache.has(processPath)) return iconCache.get(processPath) || null
    try {
      const lower = processPath.toLowerCase()
      if (lower.includes('qzyrium') || lower === 'qzyrium-clash.exe' || lower === 'qzyrium-clash') {
        const appIcon = await app.getFileIcon(process.execPath, { size: 'normal' }).catch(() => null)
        if (appIcon && !appIcon.isEmpty()) {
          const dataUrl = appIcon.toDataURL()
          setCachedIcon(processPath, dataUrl)
          return dataUrl
        }
      }
  
      let targetPath = processPath
      if (!existsSync(targetPath)) {
        if (process.platform === 'win32') {
          const windir = process.env.WINDIR || 'C:\\Windows'
          const candidate = join(windir, 'System32', processPath)
          if (existsSync(candidate)) {
            targetPath = candidate
          }
        }
      }
  
      if (existsSync(targetPath)) {
        const icon = await app.getFileIcon(targetPath, { size: 'normal' })
        if (icon && !icon.isEmpty()) {
          const dataUrl = icon.toDataURL()
          setCachedIcon(processPath, dataUrl)
          return dataUrl
        }
      }
    } catch {
      // Ignore file icon extraction failures
    }
    setCachedIcon(processPath, '')
    return null
  })

  handle(IPC_CHANNELS.APP_GET_APP_VERSION, () => {
    return app.getVersion()
  })

  handle(IPC_CHANNELS.APP_CHECK_UPDATES, () => services.updateService.checkUpdates())

  handle(IPC_CHANNELS.APP_GET_UPDATER_STATUS, () => services.updateService.getStatus())

  handle(IPC_CHANNELS.APP_DOWNLOAD_UPDATE, () => services.updateService.downloadUpdate())

  handle(IPC_CHANNELS.APP_GET_WHATS_NEW, () => services.updateService.getWhatsNew())

  handle(IPC_CHANNELS.APP_OPEN_URL, async (_, url: string) => {
    if (typeof url === 'string') {
      try {
        const parsed = new URL(url)
        if (parsed.protocol === 'https:') {
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

  handle(IPC_CHANNELS.APP_GET_BOOT_SNAPSHOT, async () => {
    const coreStatus = services.kernelService.getStatus()
    return {
      settings: services.settingService.getSettings(),
      profiles: services.profileService.getProfiles(),
      activeProfile: services.profileService.getActiveProfile(),
      coreStatus,
      sessionStartedAt: coreStatus === 'running'
        ? await (services.kernelService.getSessionStartedAt?.() ?? Promise.resolve(null))
        : null,
      sysProxy: await services.sysProxyService.getStatus()
    }
  })
}
