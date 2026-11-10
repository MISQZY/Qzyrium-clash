import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { writeFileAtomic } from '../utils/atomicWrite'
import type { CustomThemePack } from '@shared/theme'

const RESERVED_DEVICE_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
])

export class ThemeStore {
  private readonly dir: string

  constructor(userDataDir: string) {
    this.dir = join(userDataDir, 'themes')
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
  }

  private pathFor(id: string): string {
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      throw new Error(`Invalid theme id: ${id}`)
    }
    if (RESERVED_DEVICE_NAMES.has(id.toLowerCase())) {
      throw new Error(`Reserved device name: ${id}`)
    }
    const boundary = this.dir.endsWith(sep) ? this.dir : this.dir + sep
    const filePath = resolve(join(this.dir, `${id}.json`))
    if (!filePath.startsWith(boundary)) {
      throw new Error(`Invalid theme id: ${id}`)
    }
    return filePath
  }

  listThemes(): CustomThemePack[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(this.dir, f), 'utf-8')) as CustomThemePack
        } catch {
          return null
        }
      })
      .filter((t): t is CustomThemePack => t !== null && typeof t.id === 'string')
  }

  saveTheme(theme: CustomThemePack): CustomThemePack[] {
    writeFileAtomic(this.pathFor(theme.id), JSON.stringify(theme, null, 2))
    return this.listThemes()
  }

  deleteTheme(id: string): CustomThemePack[] {
    const p = this.pathFor(id)
    if (existsSync(p)) rmSync(p)
    return this.listThemes()
  }
}
