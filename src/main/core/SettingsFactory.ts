import { randomBytes } from 'node:crypto'
import { DEFAULT_APP_CONFIG, type AppConfig } from '@shared/app-config'
import { normalizeSettings } from '@shared/settings-config'

export function createInitialSettings(createSecret = () => `qz_${randomBytes(32).toString('hex')}`): AppConfig {
  const config = structuredClone(DEFAULT_APP_CONFIG)
  config.kernel.controllerSecret = createSecret()
  return config
}

export function restoreSettings(raw: unknown, base: AppConfig): AppConfig {
  const config = normalizeSettings(raw, base)
  if (!config.kernel.controllerSecret || config.kernel.controllerSecret === DEFAULT_APP_CONFIG.kernel.controllerSecret) {
    config.kernel.controllerSecret = base.kernel.controllerSecret
  }
  return config
}
