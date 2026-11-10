import fs from 'fs'
import { randomBytes } from 'node:crypto'
import { AppConfig, DEFAULT_APP_CONFIG, subscriptionUserAgent } from '@shared/app-config'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { validateAppConfig } from '@shared/settings-validation'
import { writeFileAtomicAsync } from '../utils/atomicWrite'

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
        await writeFileAtomicAsync(this.settingsPath, JSON.stringify(this.config, null, 2)).catch((error) => logger.error('Failed to restore primary settings file', error))
        logger.warn('Recovered application settings from backup file (.bak)')
      } catch {
        this.config = structuredClone(DEFAULT_APP_CONFIG)
        this.config.kernel.controllerSecret = `qz_${randomBytes(32).toString('hex')}`
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          await this.save()
          logger.info('Created initial application settings')
        } else {
          logger.error('Failed to load settings file, using defaults', err)
        }
      }
    }
  }

  async dispose(): Promise<void> {
    await this.save()
  }

  getSettings(): AppConfig {
    return structuredClone(this.config)
  }

  updateSettings(patch: Partial<AppConfig>): Promise<AppConfig> {
    const snapshot = structuredClone(patch)
    const update = this.pendingSave.then(() => this.applyUpdate(snapshot))
    this.pendingSave = update.then(() => {}, (err) => logger.error('Failed to save settings file', err))
    return update
  }

  private async applyUpdate(patch: Partial<AppConfig>): Promise<AppConfig> {
    const next = {
      ...this.config,
      ...patch,
      general: patch.general ? { ...this.config.general, ...patch.general } : this.config.general,
      kernel: patch.kernel ? { ...this.config.kernel, ...patch.kernel, tun: { ...this.config.kernel.tun, ...patch.kernel.tun } } : this.config.kernel,
      sysProxy: patch.sysProxy ? { ...this.config.sysProxy, ...patch.sysProxy } : this.config.sysProxy
    }
    next.general = { ...next.general, userAgent: subscriptionUserAgent(next.general.userAgent) }
    validateAppConfig(next)
    await writeFileAtomicAsync(this.settingsPath, JSON.stringify(next, null, 2), 'utf-8', true)
    this.config = next
    return this.getSettings()
  }

  private save(): Promise<void> {
    const save = this.pendingSave.then(() => writeFileAtomicAsync(this.settingsPath, JSON.stringify(this.config, null, 2), 'utf-8', true))
    this.pendingSave = save.catch((err) => logger.error('Failed to save settings file', err))
    return save
  }
}
