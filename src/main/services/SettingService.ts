import fs from 'fs'
import { AppConfig, DEFAULT_APP_CONFIG, subscriptionUserAgent } from '@shared/app-config'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { validateAppConfig } from '@shared/settings-validation'

export class SettingService implements BaseService {
  private config: AppConfig = structuredClone(DEFAULT_APP_CONFIG)
  private settingsPath: string
  private pendingSave: Promise<void> = Promise.resolve()

  constructor() {
    const paths = getAppPaths()
    this.settingsPath = paths.settingsFilePath
  }

  async initialize(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.settingsPath, 'utf-8')
      const parsed = JSON.parse(raw)
      this.config = {
        ...DEFAULT_APP_CONFIG,
        ...parsed,
        general: { ...DEFAULT_APP_CONFIG.general, ...(parsed.general || {}) },
        kernel: { ...DEFAULT_APP_CONFIG.kernel, ...(parsed.kernel || {}), tun: { ...DEFAULT_APP_CONFIG.kernel.tun, ...parsed.kernel?.tun } },
        sysProxy: { ...DEFAULT_APP_CONFIG.sysProxy, ...(parsed.sysProxy || {}) }
      }
      this.config.general.userAgent = subscriptionUserAgent(this.config.general.userAgent)
      validateAppConfig(this.config)
      logger.info('Loaded application settings from disk')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        if (!this.config.kernel.controllerSecret || this.config.kernel.controllerSecret === 'qzyrium_secret_token') {
          const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
          this.config.kernel.controllerSecret = `qz_${Date.now().toString(36)}_${rand}`
        }
        await this.save()
        logger.info('Created initial application settings')
        return
      }
      try {
        const bak = await fs.promises.readFile(`${this.settingsPath}.bak`, 'utf-8')
        const parsedBak = JSON.parse(bak)
        this.config = {
          ...DEFAULT_APP_CONFIG,
          ...parsedBak,
          general: { ...DEFAULT_APP_CONFIG.general, ...(parsedBak.general || {}) },
          kernel: { ...DEFAULT_APP_CONFIG.kernel, ...(parsedBak.kernel || {}), tun: { ...DEFAULT_APP_CONFIG.kernel.tun, ...parsedBak.kernel?.tun } },
          sysProxy: { ...DEFAULT_APP_CONFIG.sysProxy, ...(parsedBak.sysProxy || {}) }
        }
        this.config.general.userAgent = subscriptionUserAgent(this.config.general.userAgent)
        validateAppConfig(this.config)
        logger.warn('Recovered application settings from backup file (.bak)')
      } catch {
        logger.error('Failed to load settings file, using defaults', err)
        this.config = structuredClone(DEFAULT_APP_CONFIG)
      }
    }
  }

  async dispose(): Promise<void> {
    await this.save()
  }

  getSettings(): AppConfig {
    return structuredClone(this.config)
  }

  async updateSettings(patch: Partial<AppConfig>): Promise<AppConfig> {
    const next = {
      ...this.config,
      ...patch,
      general: patch.general ? { ...this.config.general, ...patch.general } : this.config.general,
      kernel: patch.kernel ? { ...this.config.kernel, ...patch.kernel, tun: { ...this.config.kernel.tun, ...patch.kernel.tun } } : this.config.kernel,
      sysProxy: patch.sysProxy ? { ...this.config.sysProxy, ...patch.sysProxy } : this.config.sysProxy
    }
    next.general = { ...next.general, userAgent: subscriptionUserAgent(next.general.userAgent) }
    validateAppConfig(next)
    this.config = next
    await this.save()
    return this.getSettings()
  }

  private save(): Promise<void> {
    const content = JSON.stringify(this.config, null, 2)
    const save = this.pendingSave.then(() => fs.promises.writeFile(this.settingsPath, content, 'utf-8'))
    this.pendingSave = save.catch((err) => logger.error('Failed to save settings file', err))
    return save
  }
}
