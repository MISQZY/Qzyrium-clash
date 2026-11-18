import { session } from 'electron'
import type { ServiceCheckTarget } from '@shared/service-check'
import { DEFAULT_SERVICE_CHECK_TARGETS, canCheckProxyServices } from '@shared/service-check'
import { withServiceCheckProxy } from './ServiceCheckProxy'
import { createServiceRequest } from './service-request'
import { createElectronServiceFetch } from './service-fetch'
import { checkProxyServices } from './checkProxyServices'
import type { MihomoApiClient } from './MihomoApiClient'
import type { MihomoProcessManager } from './MihomoProcessManager'
import type { SettingService } from '../services/SettingService'
import { getAppPaths, resolveCoreBinaryPath } from '../utils/paths'
import { logger } from '../utils/logger'

export class CoreDiagnosticsService {
  private inProgress = false
  private abortController?: AbortController

  constructor(
    private apiClient: MihomoApiClient,
    private processManager: MihomoProcessManager,
    private settingService: SettingService,
    private ensureCoreRunning: () => Promise<void>
  ) {}

  abort(): void {
    this.abortController?.abort()
  }

  async check(name: string, customTargets?: ServiceCheckTarget[]) {
    await this.ensureCoreRunning()
    if (this.inProgress) throw new Error('A service check is already running')
    this.inProgress = true
    const abort = new AbortController()
    this.abortController = abort
    try {
      const proxies = await this.apiClient.getProxies()
      if (!Object.hasOwn(proxies, name) || !canCheckProxyServices(proxies[name])) {
        throw new Error('Select a proxy host to check services')
      }
      const targets = (customTargets && customTargets.length > 0)
        ? customTargets
        : structuredClone(this.settingService.getSettings().general.serviceCheckTargets ?? DEFAULT_SERVICE_CHECK_TARGETS)
      const paths = getAppPaths()
      try {
        return await withServiceCheckProxy({
          binary: this.processManager?.getBinaryPath?.() ?? resolveCoreBinaryPath(this.settingService.getSettings().kernel.channel),
          configPath: paths.activeConfigPath,
          mihomoDir: paths.mihomoDir,
          name,
          proxies,
          signal: abort.signal
        }, async (port) => {
          const transport = session.fromPartition('service-check', { cache: false })
          try {
            await transport.setProxy({
              mode: 'fixed_servers',
              proxyRules: `http=127.0.0.1:${port};https=127.0.0.1:${port}`,
              proxyBypassRules: '<-loopback>'
            })
            return await checkProxyServices(
              null,
              name,
              targets,
              createServiceRequest(createElectronServiceFetch(transport), abort.signal)
            )
          } finally {
            await transport.closeAllConnections()
            await transport.clearStorageData()
          }
        })
      } catch (proxyError) {
        logger.warn(`Isolated service check proxy failed, falling back to Mihomo delay ping: ${proxyError}`)
        return await this.apiClient.checkProxyServices(name, targets)
      }
    } finally {
      if (this.abortController === abort) this.abortController = undefined
      this.inProgress = false
    }
  }
}
