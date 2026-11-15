import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { writeFileAtomic } from '../utils/atomicWrite'
import type { CustomThemePack } from '@shared/theme'
import { isCustomThemeId, MAX_THEME_BYTES, validateThemePack } from '@shared/theme-validation'

export class ThemeStore {
  private readonly dir: string
  private skippedFiles: string[] = []

  getSkippedFiles(): string[] { return [...this.skippedFiles] }

  constructor(userDataDir: string) {
    this.dir = join(userDataDir, 'themes')
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
  }

  private pathFor(id: string): string {
    if (!isCustomThemeId(id)) {
      throw new Error(`Invalid theme id: ${id}`)
    }
    const boundary = this.dir.endsWith(sep) ? this.dir : this.dir + sep
    const filePath = resolve(join(this.dir, `${id}.json`))
    if (!filePath.startsWith(boundary)) {
      throw new Error(`Invalid theme id: ${id}`)
    }
    return filePath
  }

  listThemes(): CustomThemePack[] {
    this.skippedFiles = []
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const path = join(this.dir, f)
          if (statSync(path).size > MAX_THEME_BYTES) throw new Error('Theme is too large')
          const pack: unknown = JSON.parse(readFileSync(path, 'utf-8'))
          validateThemePack(pack)
          if (f !== `${pack.id}.json`) throw new Error('Theme id does not match filename')
          return pack
        } catch {
          this.skippedFiles.push(f)
          console.warn(`Skipped invalid custom theme: ${f}`)
          return null
        }
      })
      .filter((t): t is CustomThemePack => t !== null && typeof t.id === 'string')
  }

  saveTheme(theme: CustomThemePack): CustomThemePack[] {
    validateThemePack(theme)
    const collision = this.listThemes().find(pack => pack.id.toLowerCase() === theme.id.toLowerCase() && pack.id !== theme.id)
    if (collision) throw new Error('Theme id already exists with different casing')
    writeFileAtomic(this.pathFor(theme.id), JSON.stringify(theme, null, 2))
    return this.listThemes()
  }

  deleteTheme(id: string): CustomThemePack[] {
    const p = this.pathFor(id)
    if (existsSync(p)) rmSync(p)
    return this.listThemes()
  }
}
