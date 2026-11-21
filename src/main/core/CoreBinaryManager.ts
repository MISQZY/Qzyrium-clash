import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CoreChannel } from '@shared/core-version'
import type { AppConfig } from '@shared/app-config'
import type { SettingService } from '../services/SettingService'
import type { ProfileService } from '../services/ProfileService'
import type { ActiveConfigBuilder } from './ActiveConfigBuilder'
import type { MihomoProcessManager } from './MihomoProcessManager'
import { getAppPaths, resolveCoreBinaryPath } from '../utils/paths'
import { logger } from '../utils/logger'
import { assertTrustedExecutable } from '../utils/executable-security'

const runFile = promisify(execFile)

export interface BinaryInstallationActions {
  promote: () => Promise<string>
  rollback: () => Promise<void>
  commit?: () => Promise<void>
}

export interface CoreLifecycleActions {
  stopCore: () => Promise<void>
  startCore: (settings?: AppConfig, binary?: string, persistRules?: boolean) => Promise<void>
  isRunning: () => boolean
}

export class CoreBinaryManager {
  constructor(
    private settingService: SettingService,
    private profileService: ProfileService,
    private configBuilder: ActiveConfigBuilder,
    private processManager: MihomoProcessManager,
    private lifecycle: CoreLifecycleActions
  ) {}

  async testCandidate(candidateBinaryPath: string, targetChannel: CoreChannel): Promise<void> {
    const paths = getAppPaths()
    const settings = this.settingService.getSettings()
    const testSettings = { ...settings, kernel: { ...settings.kernel, channel: targetChannel } }
    const testConfigFile = path.join(paths.mihomoDir, `.test-core-${randomUUID()}.yaml`)
    try {
      const activeProfile = this.profileService.getActiveProfile()
      const content = activeProfile ? await this.profileService.getProfileContent(activeProfile.id) : null
      if (activeProfile && content === null) throw new Error('Active profile file is missing')
      const configYaml = await this.configBuilder.prepare(content, testSettings, activeProfile?.id, candidateBinaryPath, false)
      await fs.writeFile(testConfigFile, configYaml, 'utf8')
      assertTrustedExecutable(candidateBinaryPath)
      await runFile(candidateBinaryPath, ['-t', '-d', paths.mihomoDir, '-f', testConfigFile], {
        windowsHide: true,
        timeout: 15_000,
        maxBuffer: 1024 * 1024
      })
    } catch (testError) {
      const err = testError as Error & { stdout?: string; stderr?: string }
      const output = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n')
      throw new Error(`Core configuration test failed (-t): ${output}`, { cause: testError })
    } finally {
      await fs.unlink(testConfigFile).catch(() => {})
    }
  }

  async switchBinary(
    targetChannel: CoreChannel,
    candidateBinaryPath: string,
    installation?: BinaryInstallationActions
  ): Promise<void> {
    const settings = this.settingService.getSettings()
    const previousBinary = this.processManager?.getBinaryPath?.() || resolveCoreBinaryPath(settings.kernel?.channel ?? 'stable')
    const wasRunning = this.lifecycle.isRunning()
    const testSettings = { ...settings, kernel: { ...settings.kernel, channel: targetChannel } }

    await this.testCandidate(candidateBinaryPath, targetChannel)

    let settingsSaved = false
    try {
      // An idle diagnostics core reports stopped to the UI, but its executable
      // must still be released before replacing or selecting another binary.
      if (wasRunning || this.processManager.getState?.() === 'running') await this.lifecycle.stopCore()
      const binary = installation ? await installation.promote() : candidateBinaryPath
      this.processManager.setBinaryPath(binary)
      if (wasRunning) await this.lifecycle.startCore(testSettings, binary, false)
      await this.settingService.updateSettings({ kernel: { ...this.settingService.getSettings().kernel, channel: targetChannel } })
      settingsSaved = true
      await installation?.commit?.()
    } catch (error) {
      let rolledBack = false
      try {
        if (wasRunning) await this.lifecycle.stopCore()
        if (installation) await installation.rollback()
        if (settingsSaved) {
          await this.settingService.updateSettings({ kernel: { ...this.settingService.getSettings().kernel, channel: settings.kernel.channel } })
        }
        this.processManager.setBinaryPath(previousBinary)
        if (wasRunning) await this.lifecycle.startCore(settings, previousBinary, false)
        rolledBack = true
      } catch (rollbackError) {
        logger.error('Failed to restore previous core', rollbackError)
      }
      throw Object.assign(
        new Error(
          `Core switch failed: ${error instanceof Error ? error.message : String(error)}. ${rolledBack ? 'Rolled back to previous core.' : 'Rollback failed.'}`,
          { cause: error }
        ),
        { rolledBack }
      )
    }
  }
}
