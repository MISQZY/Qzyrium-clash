import { BUILTIN_THEMES, type CustomThemePack, type ThemeDefinition, type ThemePreference } from './theme'
import { cssColorToHex } from './color'

export interface BootAppearance {
  preference: ThemePreference
  language: 'ru' | 'en'
  theme: ThemeDefinition
  backgroundColor: string
}

export function bootAppearance(preference: ThemePreference, language: 'ru' | 'en', customThemes: CustomThemePack[], systemDark: boolean): BootAppearance {
  const id = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
  const selected = BUILTIN_THEMES.find(theme => theme.id === id) ?? customThemes.find(theme => theme.id === id)
  const base = BUILTIN_THEMES.find(theme => theme.mode === selected?.mode) ?? BUILTIN_THEMES[0]
  const colors = { ...base.colors, ...selected?.colors }
  const theme: ThemeDefinition = { ...base, ...selected, colors, titleBarOverlay: selected?.titleBarOverlay ?? base.titleBarOverlay }
  return { preference, language, theme, backgroundColor: cssColorToHex(colors['--background']) ?? (theme.mode === 'dark' ? '#121615' : '#f7f9f8') }
}
