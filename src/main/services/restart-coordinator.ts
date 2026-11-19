import { logger } from '../utils/logger'
import { clearRestartState } from '../utils/restart-state'

export interface RestartCoordinatorServices {
  sysProxyService: { setCoreRunning(running: boolean): Promise<void> }
  kernelService: { stop(): Promise<void>; start(): Promise<void>; getStatus(): string }
  desktopService: { dispose(): Promise<void>; initialize(): Promise<void> }
}

export function createRestartCoordinator(services: RestartCoordinatorServices) {
  return {
    async teardown(): Promise<void> {
      try {
        await services.sysProxyService.setCoreRunning(false)
      } catch (err) {
        logger.warn(`Failed to disable system proxy before restart: ${String(err)}`)
      }
      try {
        await services.kernelService.stop()
      } catch (err) {
        logger.warn(`Failed to stop kernel before restart: ${String(err)}`)
      }
      try {
        await services.desktopService.dispose()
      } catch (err) {
        logger.warn(`Failed to dispose desktop service before restart: ${String(err)}`)
      }
    },

    async rollback(wasRunning: boolean): Promise<void> {
      clearRestartState()
      try {
        await services.desktopService.initialize()
      } catch (err) {
        logger.warn(`Failed to initialize desktop service after restart: ${String(err)}`)
      }
      if (wasRunning) {
        try {
          await services.kernelService.start()
        } catch (err) {
          logger.warn(`Failed to restart kernel after restart: ${String(err)}`)
        }
      }
      try {
        await services.sysProxyService.setCoreRunning(services.kernelService.getStatus() === 'running')
      } catch (err) {
        logger.warn(`Failed to sync proxy state after restart: ${String(err)}`)
      }
    }
  }
}
