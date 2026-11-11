import fs from 'fs'
import { AppConfig } from '@shared/app-config'
import { mergeSettings } from '@shared/settings-config'
import { createInitialSettings, restoreSettings } from '../core/SettingsFactory'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { writeFileAtomicAsync } from '../utils/atomicWrite'

export class SettingService implements BaseService {
  private config: AppConfig = createInitialSettings()
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
      this.config = restoreSettings(parsed, this.config)
      logger.info('Loaded application settings from disk')
    } catch (err) {
      try {
        const bak = await fs.promises.readFile(`${this.settingsPath}.bak`, 'utf-8')
        const parsedBak = JSON.parse(bak)
        this.config = restoreSettings(parsedBak, createInitialSettings())
        await writeFileAtomicAsync(this.settingsPath, JSON.stringify(this.config, null, 2)).catch((error) => logger.error('Failed to restore primary settings file', error))
        logger.warn('Recovered application settings from backup file (.bak)')
      } catch {
        this.config = createInitialSettings()
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
    const next = mergeSettings(this.config, patch)
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
