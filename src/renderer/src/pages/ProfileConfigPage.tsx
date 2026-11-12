import { useEffect, useState } from 'react'
import { Save, ArrowLeft } from 'lucide-react'
import type { AppConfig } from '@shared/app-config'
import { dnsFields, resourceFields, snifferFields, type ConfigValues } from '@shared/settings-fields'
import type { NavTab } from '../lib/navigation'
import { useTranslations } from '../i18n'
import { Page } from '../components/Page'
import { SettingsFields } from '../components/SettingsFields'
import { Button } from '../components/ui/button'

export function ProfileConfigPage({
  section,
  settings,
  busy,
  onSaveSettings,
  onNavigate
}: {
  section: 'dns' | 'sniffer' | 'resources'
  settings: AppConfig
  busy: boolean
  onSaveSettings: (patch: Partial<AppConfig>) => Promise<void>
  onNavigate?: (tab: NavTab) => void
}) {
  const common = useTranslations('common')
  const t = useTranslations('networksettings')
  const enabled = settings.kernel[section] != null
  const [value, setValue] = useState<ConfigValues>(settings.kernel[section] ?? {})
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!dirty) setValue(settings.kernel[section] ?? {})
  }, [settings, section, dirty])
  const fields = section === 'dns' ? dnsFields : section === 'sniffer' ? snifferFields : resourceFields
  return <Page title={common(section)} actions={
    <div className="flex items-center gap-2">
      {onNavigate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onNavigate('settings')}
          className="gap-1.5"
        >
          <ArrowLeft className="size-3.5" />
          <span>{t('backToSettings')}</span>
        </Button>
      )}
      <Button type="submit" form={`override-${section}`} disabled={busy || !dirty || !enabled} size="sm">
        <Save className="size-3.5" />
        {busy ? t('saving') : t('saveChanges')}
      </Button>
    </div>
  }>
    <form id={`override-${section}`} className="relative flex flex-col gap-4" onSubmit={(event) => {
      event.preventDefault()
      if (busy || !enabled) return
      setMessage('')
      void onSaveSettings({ kernel: { ...settings.kernel, [section]: value } }).then(() => { setDirty(false); setMessage(t('changesSaved')) }).catch(() => setMessage(t('changesCouldNotBeAppliedCheckTheErrorAbove')))
    }}>
      {enabled ? <SettingsFields prefix={section} fields={fields} value={value} onChange={(next) => { setValue(next); setDirty(true); setMessage('') }} />
        : <p className="text-xs text-muted-foreground">{t('subscriptionSettingsHint')}</p>}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </form>
  </Page>
}
