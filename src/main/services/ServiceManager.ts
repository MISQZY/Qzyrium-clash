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

export class ServiceManager {
  public settingService: SettingService
  public profileService: ProfileService
  public sysProxyService: SysProxyService
  public kernelService: KernelService
  public windowService: WindowService
  public trayService: TrayService
  public desktopService: DesktopService
  public themeStore: ThemeStore
  public updateService: UpdateService

  private services: BaseService[] = []

  constructor() {
    this.settingService = new SettingService()
    this.profileService = new ProfileService(this.settingService)
    this.sysProxyService = new SysProxyService(this.settingService)
    this.kernelService = new KernelService(this.settingService, this.profileService)
    this.windowService = new WindowService(this.settingService)
    this.trayService = new TrayService(
      this.windowService,
      this.kernelService,
      this.sysProxyService,
      this.settingService
    )
    this.desktopService = new DesktopService(this.settingService, this.profileService, this.kernelService, this.sysProxyService, this.windowService, () => {
      this.windowService.broadcast('event:settings-changed', null)
      this.trayService.updateContextMenu()
    })
    this.themeStore = new ThemeStore(getAppPaths().userData)
    this.updateService = new UpdateService((channel, payload) => this.windowService.broadcast(channel, payload), async () => {
      await this.desktopService.dispose()
      await this.kernelService.stop()
      await this.sysProxyService.setSysProxy(false)
    })

    // Route kernel broadcasts to renderer via WindowService
    this.kernelService.setBroadcaster((channel, data) => {
      this.windowService.broadcast(channel, data)
      if (channel === 'event:core-status') {
        if (data === 'running') {
          void this.trayService.refreshProxies().then(() => {
            this.trayService.updateContextMenu()
          })
        } else if (data === 'error' || data === 'stopped') {
          this.trayService.clearProxies()
        }
        this.trayService.updateContextMenu()
        // If core crashed or stopped, ensure OS system proxy is disabled so internet is not blocked
        if (data === 'error' || data === 'stopped') {
          if (this.sysProxyService.getStatus().enabled) {
            void this.sysProxyService.setSysProxy(false).then(() => {
              this.windowService.broadcast('event:settings-changed', null)
              this.trayService.updateContextMenu()
            }).catch((error) => logger.error('Failed to disable system proxy after the core stopped', error))
          }
        }
      }
    })

    // Ordered lifecycle array: window is created early for instant UI presentation
    this.services = [
      this.settingService,
      this.profileService,
      this.updateService,
      this.windowService,
      this.sysProxyService,
      this.trayService,
      this.kernelService,
      this.desktopService
    ]
  }

  async initialize(): Promise<void> {
    logger.info('Initializing application service container...')
    for (const service of this.services) {
      try {
        await service.initialize()
      } catch (err) {
        logger.error(`Error initializing service ${service.constructor.name}`, err)
      }
    }
    logger.info('All application services initialized successfully.')
  }

  async dispose(): Promise<void> {
    logger.info('Disposing application services...')
    // Dispose in reverse order
    for (const service of [...this.services].reverse()) {
      try {
        await service.dispose()
      } catch (err) {
        logger.error(`Error disposing service ${service.constructor.name}`, err)
      }
    }
    logger.info('All services disposed.')
  }
}
