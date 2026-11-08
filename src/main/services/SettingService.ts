import fs from 'fs'
import { AppConfig, DEFAULT_APP_CONFIG } from '@shared/app-config'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'

export class SettingService implements BaseService {
  private config: AppConfig = { ...DEFAULT_APP_CONFIG }
  private settingsPath: string

  constructor() {
    const paths = getAppPaths()
    this.settingsPath = paths.settingsFilePath
  }

  async initialize(): Promise<void> {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf-8')
        const parsed = JSON.parse(raw)
        this.config = {
          ...DEFAULT_APP_CONFIG,
          ...parsed,
          general: { ...DEFAULT_APP_CONFIG.general, ...(parsed.general || {}) },
          kernel: { ...DEFAULT_APP_CONFIG.kernel, ...(parsed.kernel || {}) },
          sysProxy: { ...DEFAULT_APP_CONFIG.sysProxy, ...(parsed.sysProxy || {}) }
        }
        logger.info('Loaded application settings from disk')
      } else {
        await this.save()
        logger.info('Created initial application settings')
      }
    } catch (err) {
      logger.error('Failed to load settings file, using defaults', err)
      this.config = { ...DEFAULT_APP_CONFIG }
    }
  }

  async dispose(): Promise<void> {
    await this.save()
  }

  getSettings(): AppConfig {
    return { ...this.config }
  }

  async updateSettings(patch: Partial<AppConfig>): Promise<AppConfig> {
    this.config = {
      ...this.config,
      ...patch,
      general: patch.general ? { ...this.config.general, ...patch.general } : this.config.general,
      kernel: patch.kernel ? { ...this.config.kernel, ...patch.kernel } : this.config.kernel,
      sysProxy: patch.sysProxy ? { ...this.config.sysProxy, ...patch.sysProxy } : this.config.sysProxy
    }
    await this.save()
    return this.getSettings()
  }

  private async save(): Promise<void> {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (err) {
      logger.error('Failed to save settings file', err)
    }
  }
}
