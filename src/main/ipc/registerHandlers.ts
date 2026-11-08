import { ipcMain } from 'electron'
import { AddProfileDto, IPC_CHANNELS } from '@shared/ipc'
import { AppConfig } from '@shared/app-config'
import { ServiceManager } from '../services/ServiceManager'
import { logger } from '../utils/logger'

export function registerIpcHandlers(services: ServiceManager): void {
  logger.info('Registering type-safe IPC handlers...')

  // --- Kernel Channels ---
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
    await services.profileService.setActiveProfile(id)
    await services.kernelService.restart()
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_ADD, async (_, dto: AddProfileDto) => {
    const item = await services.profileService.addProfile(dto)
    await services.kernelService.restart()
    return item
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_DELETE, async (_, id: string) => {
    await services.profileService.deleteProfile(id)
    await services.kernelService.restart()
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_UPDATE, async (_, id: string) => {
    await services.profileService.updateProfile(id)
    await services.kernelService.restart()
  })

  // --- System Proxy Channels ---
  ipcMain.handle(IPC_CHANNELS.SYSPROXY_GET_STATUS, () => {
    return services.sysProxyService.getStatus()
  })

  ipcMain.handle(IPC_CHANNELS.SYSPROXY_SET, async (_, enable: boolean) => {
    await services.sysProxyService.setSysProxy(enable)
  })

  // --- App & Window Channels ---
  ipcMain.handle(IPC_CHANNELS.APP_GET_SETTINGS, () => {
    return services.settingService.getSettings()
  })

  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_SETTINGS, async (_, patch: Partial<AppConfig>) => {
    const updated = await services.settingService.updateSettings(patch)
    // If ports or tun changed, restart kernel
    if (patch.kernel) {
      await services.kernelService.restart()
    }
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

  logger.info('IPC handlers registered successfully.')
}
