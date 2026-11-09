export interface CustomThemePack {
  id: string
  name: string
  mode: 'light' | 'dark'
  colors: Record<string, string>
  titleBarOverlay?: { color: string; symbolColor: string }
}

export type ThemePreference = 'system' | 'dark' | 'light' | (string & {})

export interface ThemeDefinition {
  id: string
  name?: string
  labelKey?: 'system' | 'dark' | 'light'
  mode: 'light' | 'dark'
  titleBarOverlay: { color: string; symbolColor: string }
  colors: Record<string, string>
}

export const LIGHT_THEME_COLORS: Record<string, string> = {
  '--background': 'oklch(0.975 0.002 160)',
  '--foreground': 'oklch(0.17 0.004 160)',
  '--card': 'oklch(0.995 0.001 160)',
  '--card-foreground': 'oklch(0.17 0.004 160)',
  '--popover': 'oklch(0.995 0.001 160)',
  '--popover-foreground': 'oklch(0.17 0.004 160)',
  '--primary': 'oklch(0.6 0.19 149)',
  '--glow': 'color-mix(in oklch, var(--primary) 35%, transparent)',
  '--glow-bg': 'color-mix(in oklch, var(--primary) 7%, transparent)',
  '--glow-secondary': 'color-mix(in oklch, var(--primary) 7%, transparent)',
  '--primary-foreground': 'oklch(0.99 0.01 149)',
  '--secondary': 'oklch(0.95 0.003 160)',
  '--secondary-foreground': 'oklch(0.22 0.004 160)',
  '--muted': 'oklch(0.95 0.003 160)',
  '--muted-foreground': 'oklch(0.40 0.005 160)',
  '--accent': 'oklch(0.95 0.03 149)',
  '--accent-foreground': 'oklch(0.36 0.1 149)',
  '--destructive': 'oklch(0.577 0.215 27)',
  '--success': 'oklch(0.58 0.11 178)',
  '--warning': 'oklch(0.68 0.15 62)',
  '--border': 'oklch(0.91 0.003 160)',
  '--input': 'oklch(0.91 0.003 160)',
  '--ring': 'oklch(0.6 0.19 149)',
  '--radius': '0.625rem',
  '--sidebar': 'oklch(0.985 0.0015 160)',
  '--sidebar-foreground': 'oklch(0.17 0.004 160)',
  '--sidebar-primary': 'oklch(0.6 0.19 149)',
  '--sidebar-primary-foreground': 'oklch(0.99 0.01 149)',
  '--sidebar-accent': 'oklch(0.935 0.003 160)',
  '--sidebar-accent-foreground': 'oklch(0.17 0.004 160)',
  '--sidebar-border': 'oklch(0.91 0.003 160)',
  '--sidebar-ring': 'oklch(0.6 0.19 149)'
}

export const DARK_THEME_COLORS: Record<string, string> = {
  '--background': 'oklch(0.115 0.002 165)',
  '--foreground': 'oklch(0.965 0.003 160)',
  '--card': 'oklch(0.16 0.0035 165)',
  '--card-foreground': 'oklch(0.965 0.003 160)',
  '--popover': 'oklch(0.17 0.0035 165)',
  '--popover-foreground': 'oklch(0.965 0.003 160)',
  '--primary': 'oklch(0.76 0.19 149)',
  '--glow': 'color-mix(in oklch, var(--primary) 45%, transparent)',
  '--glow-bg': 'color-mix(in oklch, var(--primary) 12%, transparent)',
  '--glow-secondary': 'color-mix(in oklch, var(--primary) 14%, transparent)',
  '--primary-foreground': 'oklch(0.18 0.04 149)',
  '--secondary': 'oklch(0.20 0.004 165)',
  '--secondary-foreground': 'oklch(0.965 0.003 160)',
  '--muted': 'oklch(0.18 0.003 165)',
  '--muted-foreground': 'oklch(0.7 0.005 160)',
  '--accent': 'oklch(0.29 0.06 149)',
  '--accent-foreground': 'oklch(0.88 0.13 149)',
  '--destructive': 'oklch(0.7 0.18 22)',
  '--success': 'oklch(0.76 0.11 178)',
  '--warning': 'oklch(0.8 0.15 75)',
  '--border': 'oklch(1 0 0 / 8%)',
  '--input': 'oklch(1 0 0 / 12%)',
  '--ring': 'oklch(0.76 0.19 149)',
  '--radius': '0.625rem',
  '--sidebar': 'oklch(0.13 0.0025 165)',
  '--sidebar-foreground': 'oklch(0.965 0.003 160)',
  '--sidebar-primary': 'oklch(0.76 0.19 149)',
  '--sidebar-primary-foreground': 'oklch(0.18 0.04 149)',
  '--sidebar-accent': 'oklch(0.19 0.003 165)',
  '--sidebar-accent-foreground': 'oklch(0.965 0.003 160)',
  '--sidebar-border': 'oklch(1 0 0 / 8%)',
  '--sidebar-ring': 'oklch(0.76 0.19 149)'
}

export const BUILTIN_THEMES: ThemeDefinition[] = [
  {
    id: 'dark',
    labelKey: 'dark',
    name: 'Dark',
    mode: 'dark',
    titleBarOverlay: { color: '#00000000', symbolColor: '#b4b9b7' },
    colors: DARK_THEME_COLORS
  },
  {
    id: 'light',
    labelKey: 'light',
    name: 'Light',
    mode: 'light',
    titleBarOverlay: { color: '#00000000', symbolColor: '#636a67' },
    colors: LIGHT_THEME_COLORS
  }
]

export const DEFAULT_LIGHT_THEME_ID = 'light'
export const DEFAULT_DARK_THEME_ID = 'dark'
