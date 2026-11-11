import { createApplicationServices, type ApplicationServices } from './createApplicationServices'
import { logger } from '../utils/logger'
import type { BaseService } from './BaseService'

export class ServiceManager {
  private readonly application: ApplicationServices
  private initialized: BaseService[] = []
  constructor(create: () => ApplicationServices = createApplicationServices) {
    this.application = create()
  }

  get settingService() { return this.application.settingService }
  get profileService() { return this.application.profileService }
  get sysProxyService() { return this.application.sysProxyService }
  get kernelService() { return this.application.kernelService }
  get windowService() { return this.application.windowService }
  get trayService() { return this.application.trayService }
  get desktopService() { return this.application.desktopService }
  get themeStore() { return this.application.themeStore }
  get updateService() { return this.application.updateService }
  get networkModeController() { return this.application.networkModeController }

  async initialize(): Promise<void> {
    logger.info('Initializing application service container...')
    const required = new Set<BaseService>([this.settingService, this.profileService, this.windowService, this.sysProxyService])
    const failures: string[] = []
    for (const service of this.application.services) {
      try {
        await service.initialize()
        this.initialized.push(service)
      } catch (err) {
        logger.error(`Error initializing service ${service.constructor.name}`, err)
        await service.dispose().catch(error => logger.error(`Error cleaning up service ${service.constructor.name}`, error))
        if (required.has(service)) {
          await this.dispose()
          throw new Error(`Required service failed: ${service.constructor.name}`, { cause: err })
        }
        failures.push(service.constructor.name)
      }
    }
    if (failures.length) logger.warn(`Application initialized with unavailable services: ${failures.join(', ')}`)
    else logger.info('All application services initialized successfully.')
  }

  async dispose(): Promise<void> {
    logger.info('Disposing application services...')
    const initialized = this.initialized
    this.initialized = []
    for (const service of initialized.reverse()) {
      try {
        await service.dispose()
      } catch (err) {
        logger.error(`Error disposing service ${service.constructor.name}`, err)
      }
    }
    logger.info('All services disposed.')
  }
}
