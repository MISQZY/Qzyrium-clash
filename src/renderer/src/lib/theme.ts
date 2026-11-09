import {
  BUILTIN_THEMES,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  type CustomThemePack,
  type ThemeDefinition,
  type ThemePreference
} from '@shared/theme'
import { deriveTitleBarOverlay } from './color'

export {
  BUILTIN_THEMES,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  type CustomThemePack,
  type ThemeDefinition,
  type ThemePreference
}

/** Recursively overlays `patch` onto `base`, keeping any key `patch` doesn't set */
export function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const baseValue = result[key]
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      result[key] = deepMerge(baseValue as Record<string, unknown>, value as Record<string, unknown>)
    } else if (value !== undefined) {
      result[key] = value
    }
  }
  return result as T
}

/**
 * Fills in `colors` against the current base palette and recomputes titleBarOverlay
 * from that merged result.
 */
export function normalizeThemePack(pack: CustomThemePack): CustomThemePack {
  const base = BUILTIN_THEMES.find((theme) => theme.mode === pack.mode) ?? BUILTIN_THEMES[0]
  const colors = deepMerge(base.colors, pack.colors ?? {})
  return {
    ...pack,
    colors,
    titleBarOverlay: deriveTitleBarOverlay(colors, pack.titleBarOverlay ?? base.titleBarOverlay)
  }
}

export function packToThemeDefinition(pack: CustomThemePack): ThemeDefinition {
  const base = BUILTIN_THEMES.find((theme) => theme.mode === pack.mode) ?? BUILTIN_THEMES[0]
  const normalized = normalizeThemePack(pack)
  return {
    id: normalized.id,
    name: normalized.name,
    mode: normalized.mode,
    titleBarOverlay: normalized.titleBarOverlay ?? base.titleBarOverlay,
    colors: normalized.colors
  }
}

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true
}

export function resolveTheme(preference: ThemePreference, themes: ThemeDefinition[]): ThemeDefinition {
  if (preference === 'system') {
    const fallbackId = prefersDark() ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID
    return themes.find((theme) => theme.id === fallbackId) ?? themes[0]
  }
  return (
    themes.find((theme) => theme.id === preference) ??
    themes.find((theme) => theme.id === DEFAULT_DARK_THEME_ID) ??
    themes[0]
  )
}

const appliedThemeKeys = new Set<string>()

export function applyThemeToDocument(theme: ThemeDefinition): void {
  document.documentElement.dataset.theme = theme.id
  document.documentElement.classList.toggle('dark', theme.mode === 'dark')

  // Clean up any stale custom properties from previously applied themes
  for (const oldKey of appliedThemeKeys) {
    if (!(oldKey in theme.colors)) {
      document.documentElement.style.removeProperty(oldKey)
      appliedThemeKeys.delete(oldKey)
    }
  }

  for (const [key, value] of Object.entries(theme.colors)) {
    document.documentElement.style.setProperty(key, value)
    appliedThemeKeys.add(key)
  }
  if (window.api?.window?.setTitleBarOverlay) {
    void window.api.window.setTitleBarOverlay(theme.titleBarOverlay).catch(() => {})
  }
}
