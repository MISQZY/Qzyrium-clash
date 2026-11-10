import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { AppConfig } from '@shared/app-config'
import type { CustomRuleItem } from '@shared/profile'
import { MihomoConfigFactory } from '../core/MihomoConfigFactory'
import { getAppPaths } from './paths'

const runFile = promisify(execFile)

export async function validateProfileContent(content: string, settings: AppConfig, rules?: CustomRuleItem[]): Promise<void> {
  const config = MihomoConfigFactory.synthesize(content, settings, rules)
  const paths = getAppPaths()
  const filename = path.join(paths.mihomoDir, `.validate-${randomUUID()}.yaml`)
  try {
    await fs.writeFile(filename, config, { encoding: 'utf8', flag: 'wx' })
    await runFile(paths.coreBinaryPath, ['-t', '-d', paths.mihomoDir, '-f', filename], {
      windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024
    })
  } catch (error) {
    const detail = error as Error & { stdout?: string; stderr?: string }
    throw new Error(`Profile validation failed: ${detail.stderr?.trim() || detail.stdout?.trim() || detail.message}`, { cause: error })
  } finally {
    await fs.unlink(filename).catch(() => {})
  }
}
