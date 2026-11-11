import { nativeMessage } from '@shared/localization'
import { app, clipboard, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { AddProfileDto, IPC_CHANNELS } from '@shared/ipc'
import { CustomRuleItem } from '@shared/profile'
import { AppConfig } from '@shared/app-config'
import type { CustomThemePack } from '@shared/theme'
import { ServiceManager } from '../services/ServiceManager'
import { logger } from '../utils/logger'
import { isDeepStrictEqual } from 'node:util'
import { validateAppConfig } from '@shared/settings-validation'
import { pacScript } from '../utils/pac'
import { isProcessElevated, restartAsAdmin } from '../utils/elevation'
import { saveRestartState, clearRestartState } from '../utils/restart-state'

export function registerIpcHandlers(services: ServiceManager): void {
  logger.info('Registering type-safe IPC handlers...')
  const profileUpdates = new Map<string, Promise<void>>()
  let finishShortcutRecording: (() => void) | undefined
  ipcMain.handle(IPC_CHANNELS.APP_SET_SHORTCUT_RECORDING, (event, recording: boolean) => {
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
  const restartActiveProfile = async (id: string | undefined): Promise<void> => {
    const status = services.kernelService.getStatus()
    if (id && services.profileService.getActiveProfile()?.id === id && (status === 'running' || status === 'starting')) {
      await services.kernelService.restart()
    }
  }

  // --- Kernel Channels ---
  ipcMain.handle(IPC_CHANNELS.KERNEL_GET_SESSION_STARTED_AT, () => services.kernelService.getSessionStartedAt())
  ipcMain.handle(IPC_CHANNELS.KERNEL_GET_STATUS, () => {
    return services.kernelService.getStatus()
  })

  ipcMain.handle(IPC_CHANNELS.KERNEL_START, async () => {
    await services.kernelService.start()
  })

  ipcMain.handle(IPC_CHANNELS.KERNEL_STOP, async () => {
    await services.kernelService.stop()
  })

  ipcMain.handle(IPC_CHANNELS.KERNEL_RESTART, async () => {
    await services.kernelService.restart()
  })

  ipcMain.handle(IPC_CHANNELS.KERNEL_GET_VERSION, async () => {
    return await services.kernelService.getVersion()
  })

  // --- Mihomo Core API Channels ---
  ipcMain.handle(IPC_CHANNELS.MIHOMO_GET_CONFIGS, async () => {
    return await services.kernelService.getConfigs()
  })

  ipcMain.handle(IPC_CHANNELS.MIHOMO_PATCH_CONFIGS, async (_, patch: Record<string, unknown>) => {
    await services.kernelService.patchConfigs(patch)
  })

  ipcMain.handle(IPC_CHANNELS.MIHOMO_GET_PROXIES, async () => {
    return await services.kernelService.getProxies()
  })

  ipcMain.handle(IPC_CHANNELS.MIHOMO_SELECT_PROXY, async (_, group: string, proxy: string) => {
    await services.kernelService.selectProxy(group, proxy)
    services.trayService.setProxySelection(group, proxy)
  })

  ipcMain.handle(
    IPC_CHANNELS.MIHOMO_TEST_DELAY,
    async (_, name: string, url?: string, timeout?: number) => {
      return await services.kernelService.testDelay(name, url, timeout)
    }
  )

  ipcMain.handle(IPC_CHANNELS.MIHOMO_GET_RULES, async () => {
    return await services.kernelService.getRules()
  })

  ipcMain.handle(IPC_CHANNELS.MIHOMO_GET_CONNECTIONS, async () => {
    return await services.kernelService.getConnections()
  })

  ipcMain.handle(IPC_CHANNELS.MIHOMO_GET_GLOBE_LOCATIONS, () => services.kernelService.getGlobeLocations())

  ipcMain.handle(IPC_CHANNELS.MIHOMO_CLOSE_CONNECTION, async (_, id: string) => {
    await services.kernelService.closeConnection(id)
  })

  ipcMain.handle(IPC_CHANNELS.MIHOMO_CLOSE_ALL_CONNECTIONS, async () => {
    await services.kernelService.closeAllConnections()
  })

  // --- Profile Channels ---
  ipcMain.handle(IPC_CHANNELS.PROFILE_GET_LIST, () => {
    return services.profileService.getProfiles()
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_GET_ACTIVE, () => {
    return services.profileService.getActiveProfile()
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_SET_ACTIVE, async (_, id: string) => {
    const previousId = services.profileService.getActiveProfile()?.id
    await services.profileService.setActiveProfile(id)
    if (previousId !== id) await restartActiveProfile(id)
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_ADD, async (_, dto: AddProfileDto) => {
    const item = await services.profileService.addProfile(dto)
    await restartActiveProfile(item.id)
    return item
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_DELETE, async (_, id: string) => {
    const active = services.profileService.getActiveProfile()?.id === id
    await services.profileService.deleteProfile(id)
    // Removing the final active profile also requires a default kernel configuration.
    if (active && ['running', 'starting'].includes(services.kernelService.getStatus())) {
      await services.kernelService.restart()
    }
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_GET_CUSTOM_RULES, (_, id: string) => {
    return services.profileService.getCustomRules(id)
  })

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_SAVE_CUSTOM_RULES,
    async (_, id: string, rules: CustomRuleItem[]) => {
      if (await services.profileService.saveCustomRules(id, rules)) await restartActiveProfile(id)
    }
  )

  ipcMain.handle(IPC_CHANNELS.PROFILE_GET_RAW_CONFIG, (_, id: string) => {
    return services.profileService.getProfileContent(id)
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_SAVE_RAW_CONFIG, async (_, id: string, content: string) => {
    if (await services.profileService.saveProfileContent(id, content)) await restartActiveProfile(id)
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_UPDATE_INFO, async (_, id: string, patch: Record<string, unknown>) => {
    return services.profileService.updateProfileInfo(id, patch)
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_UPDATE, (_, id: string) => {
    const pending = profileUpdates.get(id)
    if (pending) return pending
    const update = (async () => {
      if (await services.profileService.updateProfile(id)) await restartActiveProfile(id)
    })().finally(() => profileUpdates.delete(id))
    profileUpdates.set(id, update)
    return update
  })

  // --- System Proxy Channels ---
  ipcMain.handle(IPC_CHANNELS.SYSPROXY_GET_STATUS, async () => {
    await services.sysProxyService.waitForUpdates()
    return services.sysProxyService.getStatus()
  })

  ipcMain.handle(IPC_CHANNELS.SYSPROXY_SET, async (_, enable: boolean) => {
    if (enable) {
      const current = services.settingService.getSettings()
      if (current.kernel.tun.enable) {
        await services.settingService.updateSettings({ kernel: { ...current.kernel, tun: { ...current.kernel.tun, enable: false } } })
        if (['running', 'starting'].includes(services.kernelService.getStatus())) {
          await services.kernelService.restart()
        }
      }
    }
    await services.sysProxyService.setSysProxy(enable)
    services.trayService.updateContextMenu()
  })

  // --- App & Window Channels ---
  ipcMain.handle(IPC_CHANNELS.APP_ENTER_CORE_ONLY, () => {
    // Let the IPC response finish before destroying its sender.
    setImmediate(() => services.windowService.setCoreOnlyMode(true))
  })
  ipcMain.handle(IPC_CHANNELS.APP_GET_SETTINGS, () => {
    return services.settingService.getSettings()
  })

  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_SETTINGS, async (_, patch: Partial<AppConfig>) => {
    finishShortcutRecording?.()
    const previous = services.settingService.getSettings()
    const nextKernel = { ...previous.kernel, ...patch.kernel }
    const candidate = { ...previous, ...patch, general: { ...previous.general, ...patch.general }, kernel: { ...nextKernel, tun: { ...previous.kernel.tun, ...patch.kernel?.tun } }, sysProxy: { ...previous.sysProxy, ...patch.sysProxy } }
    validateAppConfig(candidate)
    if (candidate.sysProxy.mode === 'pac') pacScript(candidate)

    if (patch.kernel?.tun?.enable && !isProcessElevated()) {
      throw new Error(nativeMessage(candidate.general.language, 'tunRequiresAdmin', candidate.general))
    }
    if (patch.kernel?.tun?.enable) {
      if (previous.sysProxy.enable || services.sysProxyService.getStatus().enabled) {
        await services.sysProxyService.setSysProxy(false)
      }
    }
    const kernelChanged = !isDeepStrictEqual(previous.kernel, nextKernel)
    const modeOnly = kernelChanged && isDeepStrictEqual({ ...previous.kernel, mode: nextKernel.mode }, nextKernel)
    // Routing mode is a live setting. Apply it before persisting so an API
    // rejection leaves the saved mode and the renderer's selection unchanged.
    if (modeOnly && services.kernelService.getStatus() === 'running') {
      await services.kernelService.patchConfigs({ mode: nextKernel.mode })
    }
    if (patch.general) await services.desktopService?.applySettings(candidate)
    let updated: AppConfig
    try { updated = await services.settingService.updateSettings(patch) }
    catch (err) {
      if (modeOnly && services.kernelService.getStatus() === 'running') {
        await services.kernelService.patchConfigs({ mode: previous.kernel.mode }).catch((error) => logger.error('Failed to restore routing mode', error))
      }
      if (patch.kernel?.tun?.enable && previous.sysProxy.enable) await services.sysProxyService.setSysProxy(true)
      if (patch.general) await services.desktopService?.applySettings(previous)
      throw err
    }
    if (kernelChanged && !modeOnly && ['running', 'starting'].includes(services.kernelService.getStatus())) {
      await services.kernelService.restart()
    }
    if (patch.sysProxy || (previous.kernel.mixedPort !== updated.kernel.mixedPort && updated.sysProxy.enable)) {
      // Reapply changed bypass rules/port to Windows as well as the saved config.
      await services.sysProxyService.setSysProxy(updated.sysProxy.enable)
    }
    if (patch.general) services.windowService.updateTheme()
    services.trayService.updateContextMenu()
    return updated
  })

  ipcMain.handle(IPC_CHANNELS.APP_MINIMIZE, () => {
    services.windowService.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.APP_MAXIMIZE, () => {
    services.windowService.maximize()
  })

  ipcMain.handle(IPC_CHANNELS.APP_CLOSE, () => {
    services.windowService.close()
  })

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_FOLDER, async (_, target: 'logs' | 'data' | 'profiles') => {
    await services.windowService.openFolder(target)
  })

  ipcMain.handle(IPC_CHANNELS.APP_IS_ELEVATED, () => {
    return isProcessElevated()
  })

  ipcMain.handle(IPC_CHANNELS.APP_RESTART_AS_ADMIN, async () => {
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

  const MAX_ICON_CACHE = 80
  const iconCache = new Map<string, string>()

  const setCachedIcon = (key: string, value: string) => {
    if (iconCache.size >= MAX_ICON_CACHE) {
      const oldest = iconCache.keys().next().value
      if (oldest) iconCache.delete(oldest)
    }
    iconCache.set(key, value)
  }

  ipcMain.handle(IPC_CHANNELS.APP_GET_PROCESS_ICON, async (_, processPath: string) => {
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

  ipcMain.handle(IPC_CHANNELS.APP_GET_APP_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC_CHANNELS.APP_CHECK_UPDATES, () => services.updateService.checkUpdates())
  ipcMain.handle(IPC_CHANNELS.APP_GET_UPDATER_STATUS, () => services.updateService.getStatus())
  ipcMain.handle(IPC_CHANNELS.APP_DOWNLOAD_UPDATE, () => services.updateService.downloadUpdate())
  ipcMain.handle(IPC_CHANNELS.APP_GET_WHATS_NEW, () => services.updateService.getWhatsNew())

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_URL, async (_, url: string) => {
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

  ipcMain.handle(IPC_CHANNELS.APP_COPY_TO_CLIPBOARD, async (_, text: string) => {
    if (typeof text === 'string') {
      clipboard.writeText(text)
      return true
    }
    return false
  })

  ipcMain.handle(IPC_CHANNELS.APP_GET_BOOT_SNAPSHOT, async () => {
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

  // --- Custom Themes & Config Files ---
  ipcMain.handle(IPC_CHANNELS.THEME_GET_CUSTOM_THEMES, (): CustomThemePack[] => {
    return services.themeStore.listThemes()
  })

  ipcMain.handle(IPC_CHANNELS.THEME_SAVE_CUSTOM_THEME, (_event, pack: CustomThemePack): CustomThemePack[] => {
    return services.themeStore.saveTheme(pack)
  })

  ipcMain.handle(IPC_CHANNELS.THEME_DELETE_CUSTOM_THEME, (_event, id: string): CustomThemePack[] => {
    return services.themeStore.deleteTheme(id)
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_TITLEBAR_OVERLAY, (_event, overlay: { color?: string; symbolColor?: string }): void => {
    services.windowService.setTitleBarOverlay(overlay)
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_OPEN_JSON_FILE, async (): Promise<{ fileName: string; content: string } | null> => {
    const win = services.windowService.getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: nativeMessage(services.settingService.getSettings().general.language, 'jsonConfig', services.settingService.getSettings().general), extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const content = await readFile(filePath, 'utf-8')
    return { fileName: basename(filePath), content }
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE_TEXT_FILE, async (_event, defaultFileName: string, content: string): Promise<boolean> => {
    const win = services.windowService.getMainWindow()
    if (!win) return false
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultFileName,
      filters: [{ name: nativeMessage(services.settingService.getSettings().general.language, 'jsonConfig', services.settingService.getSettings().general), extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, content, 'utf-8')
    return true
  })

  logger.info('IPC handlers registered successfully.')
}
