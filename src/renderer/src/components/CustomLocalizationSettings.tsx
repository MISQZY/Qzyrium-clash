import { useState } from 'react'
import { Download, Upload, Trash2 } from 'lucide-react'
import type { AppConfig } from '@shared/app-config'
import { useTranslations } from '../i18n'
import { localizationExample, parseLocalizationPack } from '../i18n/catalogs'
import { Button } from './ui/button'
import { SettingsDisclosure } from './SettingsDisclosure'

export function CustomLocalizationSettings({ general, onChange }: {
  general: AppConfig['general']
  onChange: (patch: Partial<AppConfig['general']>) => void
}) {
  const t = useTranslations('networksettings')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const packs = general.customLocalizations ?? []

  const upload = async () => {
    setBusy(true)
    setError('')
    try {
      const file = await window.api?.theme?.openConfigFile()
      if (!file) return
      try {
        const pack = parseLocalizationPack(file.content)
        onChange({ customLocalizations: [...packs.filter(item => item.id !== pack.id), pack],
          ...(general.customLocalization === pack.id ? { language: pack.baseLanguage } : {}) })
      } catch { setError(t('invalidLocalizationFile')) }
    } catch { setError(t('localizationFileError')) }
    finally { setBusy(false) }
  }

  const download = async () => {
    setBusy(true)
    setError('')
    try {
      await window.api?.theme?.saveConfigFile('example-localization.json', JSON.stringify(localizationExample(general.language), null, 2))
    } catch { setError(t('localizationFileError')) }
    finally { setBusy(false) }
  }

  return (
    <SettingsDisclosure title={t('customLocalizationTitle')}>
      <p className="text-xs leading-relaxed text-muted-foreground">{t('customLocalizationHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void download()} disabled={busy}>
          <Download className="size-3.5" />{t('downloadExample')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void upload()} disabled={busy}>
          <Upload className="size-3.5" />{t('uploadLocalization')}
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {packs.length > 0 && <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
        {packs.map(pack => <li key={pack.id} className="flex items-center justify-between gap-2 rounded-md border border-border/80 bg-card px-3 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate font-medium">{pack.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{pack.locale}</span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('deleteCustom')} onClick={() => onChange({
            customLocalizations: packs.filter(item => item.id !== pack.id),
            ...(general.customLocalization === pack.id ? { customLocalization: null } : {})
          })}><Trash2 className="size-3.5" /></Button>
        </li>)}
      </ul>}
    </SettingsDisclosure>
  )
}
