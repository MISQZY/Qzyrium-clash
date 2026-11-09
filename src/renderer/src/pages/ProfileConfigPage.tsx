import { useEffect, useState } from 'react'
import { Save, ArrowLeft } from 'lucide-react'
import type { AppConfig } from '@shared/app-config'
import { dnsFields, resourceFields, snifferFields, type ConfigValues } from '@shared/settings-fields'
import type { NavTab } from '../lib/navigation'
import { useTranslations } from '../i18n'
import { Page, SettingRow } from '../components/Page'
import { SettingsFields } from '../components/SettingsFields'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'

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
  const [enabled, setEnabled] = useState(!!settings.kernel[section])
  const [value, setValue] = useState<ConfigValues>(settings.kernel[section] ?? {})
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!dirty) { setEnabled(!!settings.kernel[section]); setValue(settings.kernel[section] ?? {}) }
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
      <Button type="submit" form={`override-${section}`} disabled={busy || !dirty} size="sm">
        <Save className="size-3.5" />
        {busy ? t('saving') : t('saveChanges')}
      </Button>
    </div>
  }>
    <form id={`override-${section}`} className="relative flex flex-col gap-4" onSubmit={(event) => {
      event.preventDefault()
      setMessage('')
      void onSaveSettings({ kernel: { ...settings.kernel, [section]: enabled ? value : null } }).then(() => { setDirty(false); setMessage(t('changesSaved')) }).catch(() => setMessage(t('changesCouldNotBeAppliedCheckTheErrorAbove')))
    }}>
      <Card>
        <CardContent className="p-4 sm:p-5">
          <SettingRow title={t('overrideProfile')} description={t('overrideProfileHint')}>
            <Switch aria-label={t('overrideProfile')} checked={enabled} onCheckedChange={(next) => { setEnabled(next); setDirty(true); setMessage('') }} />
          </SettingRow>
          {enabled && <div className="mt-4"><SettingsFields prefix={section} fields={fields} value={value} onChange={(next) => { setValue(next); setDirty(true); setMessage('') }} /></div>}
        </CardContent>
      </Card>
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </form>
  </Page>
}
