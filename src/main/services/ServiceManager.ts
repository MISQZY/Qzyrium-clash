import { createApplicationServices, type ApplicationServices } from './createApplicationServices'
import { logger } from '../utils/logger'

export class ServiceManager {
  private readonly application: ApplicationServices
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
    for (const service of this.application.services) {
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
    for (const service of [...this.application.services].reverse()) {
      try {
        await service.dispose()
      } catch (err) {
        logger.error(`Error disposing service ${service.constructor.name}`, err)
      }
    }
    logger.info('All services disposed.')
  }
}
