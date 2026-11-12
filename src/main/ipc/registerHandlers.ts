import { ipcMain } from 'electron'
import type { ServiceManager } from '../services/ServiceManager'
import { logger } from '../utils/logger'
import { createTrustedRegistrar } from './trusted-handler'
import { registerKernelHandlers } from './kernel-handlers'
import { registerProfileHandlers } from './profile-handlers'
import { registerSettingsHandlers } from './settings-handlers'
import { registerApplicationHandlers } from './application-handlers'
import { registerThemeHandlers } from './theme-handlers'
import { registerMaintenanceHandlers } from './maintenance-handlers'

export function registerIpcHandlers(services: ServiceManager): void {
  const handle = createTrustedRegistrar(ipcMain, services.windowService)
  logger.info('Registering trusted IPC handlers...')
  registerKernelHandlers(handle, services)
  registerProfileHandlers(handle, services)
  registerSettingsHandlers(handle, services)
  registerApplicationHandlers(handle, services)
  registerThemeHandlers(handle, services)
  registerMaintenanceHandlers(handle, services)
  logger.info('IPC handlers registered successfully.')
}
