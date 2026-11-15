import { useTranslations } from '../i18n'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BUILTIN_THEMES,
  packToThemeDefinition,
  normalizeThemePack,
  deepMerge,
  type ThemeDefinition,
  type CustomThemePack
} from '../lib/theme'
import { deriveTitleBarOverlay } from '../lib/color'
import { MAX_THEME_BYTES, uniqueThemeId, validateThemeInput, validateThemePack } from '@shared/theme-validation'

const THEME_CACHE_KEY = 'qzyrium:customThemeCache'

function readCache(): CustomThemePack[] {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY)
    return raw ? validPacks(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function validPacks(value: unknown): CustomThemePack[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.filter((pack): pack is CustomThemePack => {
    try {
      validateThemePack(pack)
      if (Object.entries(pack.colors).some(([key, value]) => !CSS.supports(key === '--radius' ? 'border-radius' : 'color', value))) return false
      const id = pack.id.toLowerCase()
      if (seen.has(id)) return false
      seen.add(id)
      return true
    } catch { return false }
  })
}

function writeCache(value: CustomThemePack[]): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(value))
  } catch {
    // Cache write failed
  }
}

export type UploadOutcome = 'ok' | 'invalid' | 'cancelled'

interface CustomThemesContextValue {
  customThemes: ThemeDefinition[]
  uploadTheme: () => Promise<UploadOutcome>
  deleteCustomTheme: (id: string) => Promise<void>
  downloadExampleTheme: () => Promise<boolean>
  loadFailed: boolean
  skippedThemes: boolean
}

const CustomThemesContext = createContext<CustomThemesContextValue | null>(null)

export function CustomThemesProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('networksettings')
  const [loadFailed, setLoadFailed] = useState(false)
  const [skippedThemes, setSkippedThemes] = useState(false)
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>(() => {
    const cached = readCache().map(packToThemeDefinition)
    const boot = window.api?.bootAppearance?.theme
    return boot && !BUILTIN_THEMES.some(theme => theme.id === boot.id)
      ? [...cached.filter(theme => theme.id !== boot.id), boot] : cached
  })

  const cacheThemePacks = useCallback((packs: CustomThemePack[]): CustomThemePack[] => {
    const normalized = validPacks(packs).map(normalizeThemePack)
    writeCache(normalized)
    return normalized
  }, [])

  useEffect(() => {
    let cancelled = false
    if (window.api?.theme?.getCustomThemes) {
      window.api.theme
        .getCustomThemes()
        .then((result) => {
          if (cancelled) return
          const packs = result.themes
          const valid = cacheThemePacks(packs)
          setSkippedThemes(valid.length !== packs.length || result.skippedFiles.length > 0)
          setCustomThemes(valid.map(packToThemeDefinition))
        })
        .catch(() => { if (!cancelled) setLoadFailed(true) })
    }
    return () => {
      cancelled = true
    }
  }, [cacheThemePacks])

  const deleteCustomTheme = useCallback(
    async (id: string): Promise<void> => {
      if (!window.api?.theme?.deleteCustomTheme) {
        setCustomThemes((prev) => {
          const updated = prev.filter((t) => t.id !== id)
          writeCache(updated.map((t) => ({ id: t.id, name: t.name ?? t.id, mode: t.mode, colors: t.colors, titleBarOverlay: t.titleBarOverlay })))
          return updated
        })
        return
      }
      const packs = await window.api.theme.deleteCustomTheme(id)
      setCustomThemes(cacheThemePacks(packs).map(packToThemeDefinition))
    },
    [cacheThemePacks]
  )

  const uploadTheme = useCallback(async (): Promise<UploadOutcome> => {
    if (!window.api?.theme?.openConfigFile) return 'cancelled'
    const file = await window.api.theme.openConfigFile()
    if (!file) return 'cancelled'

    let parsed: unknown
    try {
      if (new TextEncoder().encode(file.content).length > MAX_THEME_BYTES) return 'invalid'
      parsed = JSON.parse(file.content)
      validateThemeInput(parsed)
      for (const [key, value] of Object.entries(parsed.colors ?? {})) {
        if (!CSS.supports(key === '--radius' ? 'border-radius' : 'color', value)) return 'invalid'
      }
    } catch {
      return 'invalid'
    }
    if (!parsed || typeof parsed !== 'object') return 'invalid'
    const payload = parsed as Partial<CustomThemePack>
    if (payload.mode === undefined && payload.colors === undefined) return 'invalid'

    const mode = payload.mode === 'light' ? 'light' : 'dark'
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : t('customThemeDefaultName')
    const existingIds = [...BUILTIN_THEMES.map((t) => t.id), ...customThemes.map((t) => t.id)]
    const id = uniqueThemeId(payload.id || name, existingIds)
    const base = BUILTIN_THEMES.find((t) => t.mode === mode) ?? BUILTIN_THEMES[0]
    const colors = deepMerge(base.colors, (payload.colors as Record<string, string>) ?? {})
    const pack: CustomThemePack = {
      id,
      name,
      mode,
      colors,
      titleBarOverlay: deriveTitleBarOverlay(colors, payload.titleBarOverlay ?? base.titleBarOverlay)
    }
    const packs = await window.api.theme.saveCustomTheme(pack)
    setCustomThemes(cacheThemePacks(packs).map(packToThemeDefinition))
    return 'ok'
  }, [customThemes, cacheThemePacks, t])

  const downloadExampleTheme = useCallback(async (): Promise<boolean> => {
    if (!window.api?.theme?.saveConfigFile) return false
    const darkTheme = BUILTIN_THEMES.find((t) => t.id === 'dark') ?? BUILTIN_THEMES[0]
    const payload: CustomThemePack = {
      id: 'example-theme',
      name: t('exampleThemeName'),
      mode: darkTheme.mode,
      colors: darkTheme.colors
    }
    return window.api.theme.saveConfigFile('example-theme.json', JSON.stringify(payload, null, 2))
  }, [t])

  const value = useMemo<CustomThemesContextValue>(
    () => ({
      customThemes,
      uploadTheme,
      deleteCustomTheme,
      downloadExampleTheme,
      loadFailed,
      skippedThemes
    }),
    [customThemes, uploadTheme, deleteCustomTheme, downloadExampleTheme, loadFailed, skippedThemes]
  )

  return <CustomThemesContext.Provider value={value}>{children}</CustomThemesContext.Provider>
}

export function useCustomThemes(): CustomThemesContextValue {
  const ctx = useContext(CustomThemesContext)
  if (!ctx) throw new Error('useCustomThemes must be used within a CustomThemesProvider')
  return ctx
}
