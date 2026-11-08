import { BaseService } from './BaseService'
import { KernelService } from './KernelService'
import { ProfileService } from './ProfileService'
import { SettingService } from './SettingService'
import { SysProxyService } from './SysProxyService'
import { TrayService } from './TrayService'
import { WindowService } from './WindowService'
import { logger } from '../utils/logger'

export class ServiceManager {
  public settingService: SettingService
  public profileService: ProfileService
  public sysProxyService: SysProxyService
  public kernelService: KernelService
  public windowService: WindowService
  public trayService: TrayService

  private services: BaseService[] = []

  constructor() {
    this.settingService = new SettingService()
    this.profileService = new ProfileService()
    this.sysProxyService = new SysProxyService(this.settingService)
    this.kernelService = new KernelService(this.settingService, this.profileService)
    this.windowService = new WindowService(this.settingService)
    this.trayService = new TrayService(
      this.windowService,
      this.kernelService,
      this.sysProxyService
    )

    // Route kernel broadcasts to renderer via WindowService
    this.kernelService.setBroadcaster((channel, data) => {
      this.windowService.broadcast(channel, data)
      if (channel === 'event:core-status') {
        this.trayService.updateContextMenu()
      }
    })

    // Ordered lifecycle array
    this.services = [
      this.settingService,
      this.profileService,
      this.sysProxyService,
      this.kernelService,
      this.windowService,
      this.trayService
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
