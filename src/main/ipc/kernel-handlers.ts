import { IPC_CHANNELS } from '@shared/ipc'
import type { ServiceManager } from '../services/ServiceManager'
import type { TrustedRegistrar } from './trusted-handler'

export function registerKernelHandlers(
  handle: TrustedRegistrar,
  services: Pick<ServiceManager, 'kernelService' | 'trayService'>
): void {
  handle(IPC_CHANNELS.KERNEL_GET_SESSION_STARTED_AT, () => services.kernelService.getSessionStartedAt())

  handle(IPC_CHANNELS.KERNEL_GET_RULE_WARNING, () => services.kernelService.getRuleWarning())

  handle(IPC_CHANNELS.KERNEL_GET_STATUS, () => {
    return services.kernelService.getStatus()
  })

  handle(IPC_CHANNELS.KERNEL_START, async () => {
    await services.kernelService.start()
  })

  handle(IPC_CHANNELS.KERNEL_STOP, async () => {
    await services.kernelService.stop()
  })

  handle(IPC_CHANNELS.KERNEL_RESTART, async () => {
    await services.kernelService.restart()
  })

  handle(IPC_CHANNELS.KERNEL_GET_VERSION, async () => {
    return await services.kernelService.getVersion()
  })

  handle(IPC_CHANNELS.MIHOMO_GET_CONFIGS, async () => {
    return await services.kernelService.getConfigs()
  })

  handle(IPC_CHANNELS.MIHOMO_PATCH_CONFIGS, async (_, patch: Record<string, unknown>) => {
    await services.kernelService.patchConfigs(patch)
  })

  handle(IPC_CHANNELS.MIHOMO_GET_PROXIES, async () => {
    return await services.kernelService.getProxies()
  })

  handle(IPC_CHANNELS.MIHOMO_SELECT_PROXY, async (_, group: string, proxy: string) => {
    await services.kernelService.selectProxy(group, proxy)
    services.trayService.setProxySelection(group, proxy)
  })

  handle(
    IPC_CHANNELS.MIHOMO_TEST_DELAY,
    async (_, name: string, url?: string, timeout?: number) => {
      return await services.kernelService.testDelay(name, url, timeout)
    }
  )

  handle(IPC_CHANNELS.MIHOMO_GET_RULES, async (_, scope?: 'summary') => {
    if (scope !== undefined && scope !== 'summary') throw new Error('Invalid rules scope')
    return await services.kernelService.getRules(scope)
  })

  handle(IPC_CHANNELS.MIHOMO_GET_CONNECTIONS, async () => {
    return await services.kernelService.getConnections()
  })

  handle(IPC_CHANNELS.MIHOMO_GET_GLOBE_LOCATIONS, () => services.kernelService.getGlobeLocations())

  handle(IPC_CHANNELS.MIHOMO_CLOSE_CONNECTION, async (_, id: string) => {
    await services.kernelService.closeConnection(id)
  })

  handle(IPC_CHANNELS.MIHOMO_CLOSE_ALL_CONNECTIONS, async () => {
    await services.kernelService.closeAllConnections()
  })
}
