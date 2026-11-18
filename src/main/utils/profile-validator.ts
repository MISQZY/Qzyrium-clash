import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { AppConfig } from '@shared/app-config'
import type { CustomRuleItem } from '@shared/profile'
import { installGeoResources } from '../core/installGeoResources'
import { MihomoConfigFactory } from '../core/MihomoConfigFactory'
import { getAppPaths, resolveCoreBinaryPath } from './paths'

const runFile = promisify(execFile)

export interface PreparedProfileConfig {
  config: string
  rules: CustomRuleItem[]
}

/** Ask the installed core to validate; only quarantine errors attributed to a user rule. */
export async function prepareProfileContent(
  content: string | null,
  settings: AppConfig,
  rules: CustomRuleItem[] = [],
  customBinaryPath?: string
): Promise<PreparedProfileConfig> {
  const checkedRules: CustomRuleItem[] = rules.map((rule) => ({ ...rule, validationError: undefined }))
  const paths = getAppPaths()
  await installGeoResources(paths).catch(() => {})
  const binary = customBinaryPath || (typeof resolveCoreBinaryPath === 'function' ? resolveCoreBinaryPath(settings.kernel?.channel) : paths.coreBinaryPath)
  const filename = path.join(paths.mihomoDir, `.validate-${randomUUID()}.yaml`)
  try {
    for (;;) {
      const ruleIds: (string | undefined)[] = []
      const config = MihomoConfigFactory.synthesize(content, settings, checkedRules, ruleIds)
      await fs.writeFile(filename, config, { encoding: 'utf8' })
      try {
        await runFile(binary, ['-t', '-d', paths.mihomoDir, '-f', filename], {
          windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024
        })
        return { config, rules: checkedRules }
      } catch (error) {
        const detail = error as Error & { stdout?: string; stderr?: string }
        const output = [detail.stdout, detail.stderr].filter(Boolean).join('\n')
        const match = /rules\[(\d+)\][^\r\n]*/i.exec(output)
        const id = match ? ruleIds[Number(match[1])] : undefined
        const rule = id ? checkedRules.find((item) => item.id === id && !item.validationError) : undefined
        // Timeout, provider, subscription and other unrelated failures must remain fatal.
        if (!rule || !match) throw error
        rule.validationError = match[0].replace(/"\s*$/, '')
      }
    }
  } catch (error) {
    const detail = error as Error & { stdout?: string; stderr?: string }
    throw new Error(`Profile validation failed: ${detail.stderr?.trim() || detail.stdout?.trim() || detail.message}`, { cause: error })
  } finally {
    await fs.unlink(filename).catch(() => {})
  }
}

export async function validateProfileContent(content: string, settings: AppConfig, rules?: CustomRuleItem[], customBinaryPath?: string): Promise<void> {
  await prepareProfileContent(content, settings, rules, customBinaryPath)
}
