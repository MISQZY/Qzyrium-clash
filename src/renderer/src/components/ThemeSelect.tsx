import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui'
import { BUILTIN_THEMES } from '../lib/theme'
import { useCustomThemes } from '../providers/CustomThemesProvider'
import { useTranslations } from '../i18n'

interface ThemeSelectProps {
  value: string
  onValueChange: (value: string) => void
  ariaLabel?: string
  className?: string
}

export function ThemeSelect({ value, onValueChange, ariaLabel, className }: ThemeSelectProps) {
  const t = useTranslations('networksettings')
  const { customThemes } = useCustomThemes()

  const label = ariaLabel ?? t('appearance')

  return (
    <div className="relative inline-flex items-center">
      {/* Synchronized accessible select for testing & forms */}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        tabIndex={-1}
        className="sr-only pointer-events-none absolute opacity-0"
      >
        <option value="system">{t('system')}</option>
        <option value="dark">{t('dark')}</option>
        <option value="light">{t('light')}</option>
        {customThemes.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.name ?? theme.id}
          </option>
        ))}
      </select>

      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-label={label} className={className ?? 'w-52'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">{t('system')}</SelectItem>
          {BUILTIN_THEMES.map((theme) => (
            <SelectItem key={theme.id} value={theme.id}>
              {theme.id === 'dark' ? t('dark') : theme.id === 'light' ? t('light') : theme.name}
            </SelectItem>
          ))}
          {customThemes.map((theme) => (
            <SelectItem key={theme.id} value={theme.id}>
              {theme.name ?? theme.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
