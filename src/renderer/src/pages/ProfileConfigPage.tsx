import { useEffect, useState } from 'react'
import { Save, ArrowLeft, Globe } from 'lucide-react'
import type { AppConfig } from '@shared/app-config'
import { dnsFields, resourceFields, snifferFields, type ConfigValues } from '@shared/settings-fields'
import type { NavTab } from '../lib/navigation'
import { useTranslations } from '../i18n'
import { Page } from '../components/Page'
import { SettingsFields } from '../components/SettingsFields'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Switch } from '../components/ui/switch'
import { Textarea } from '../components/ui/textarea'
import { cn } from '../lib/utils'

interface DohPreset {
  id: string
  name: string
  url: string
  bootstrap: string
}

const DOH_PRESETS: DohPreset[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    url: 'https://dns.cloudflare.com/dns-query',
    bootstrap: '1.1.1.1'
  },
  {
    id: 'google',
    name: 'Google',
    url: 'https://dns.google/dns-query',
    bootstrap: '8.8.8.8'
  },
  {
    id: 'adguard',
    name: 'AdGuard',
    url: 'https://dns.adguard-dns.com/dns-query',
    bootstrap: '94.140.14.14'
  },
  {
    id: 'quad9',
    name: 'Quad9',
    url: 'https://dns.quad9.net/dns-query',
    bootstrap: '9.9.9.9'
  }
]

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
  const [fallbackEnabled, setFallbackEnabled] = useState(settings.kernel.tun.resilientDns ?? false)
  const [fallbackText, setFallbackText] = useState((settings.kernel.tun.fallbackDns ?? ['77.88.8.8']).join('\n'))

  useEffect(() => {
    if (!dirty) {
      setValue(settings.kernel[section] ?? {})
      if (section === 'dns') {
        setFallbackEnabled(settings.kernel.tun.resilientDns ?? false)
        setFallbackText((settings.kernel.tun.fallbackDns ?? ['77.88.8.8']).join('\n'))
      }
    }
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
      <Button type="submit" form={`override-${section}`} disabled={busy || !dirty || (!enabled && section !== 'dns')} size="sm">
        <Save className="size-3.5" />
        {busy ? t('saving') : t('saveChanges')}
      </Button>
    </div>
  }>
    <form data-unsaved-changes={dirty} id={`override-${section}`} className="relative flex flex-col gap-4" onSubmit={async (event) => {
      event.preventDefault()
      if (busy || (!enabled && section !== 'dns')) return
      setMessage('')
      const patch: Partial<AppConfig> = { kernel: { ...settings.kernel } }
      if (enabled) {
        patch.kernel![section] = value
      }
      if (section === 'dns') {
        const list = fallbackText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        patch.kernel!.tun = {
          ...settings.kernel.tun,
          resilientDns: fallbackEnabled,
          fallbackDns: list
        }
      }
      try {
        await onSaveSettings(patch)
        setDirty(false)
        setMessage(t('changesSaved'))
      } catch {
        setMessage(t('changesCouldNotBeAppliedCheckTheErrorAbove'))
      }
    }}>
      {enabled && section === 'dns' && (
        <Card className="border border-border/70 bg-card/60 p-4 rounded-xl">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-semibold text-foreground">
                {t('dohPresets')}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t('dohPresetsHint')}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {DOH_PRESETS.map((preset) => {
                const nameservers = Array.isArray(value.nameserver)
                  ? (value.nameserver as string[])
                  : []
                const isSelected = nameservers.includes(preset.url)

                return (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={isSelected ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const nextNameservers = isSelected
                        ? nameservers.filter((u) => u !== preset.url)
                        : [...nameservers, preset.url]

                      const defaultNameservers = Array.isArray(value['default-nameserver'])
                        ? (value['default-nameserver'] as string[])
                        : []
                      const nextDefaultNameservers =
                        !isSelected && !defaultNameservers.includes(preset.bootstrap)
                          ? [...defaultNameservers, preset.bootstrap]
                          : defaultNameservers

                      setValue({
                        ...value,
                        enable: true,
                        nameserver: nextNameservers,
                        ...(nextDefaultNameservers.length > defaultNameservers.length
                          ? { 'default-nameserver': nextDefaultNameservers }
                          : {})
                      })
                      setDirty(true)
                      setMessage('')
                    }}
                    className={cn(
                      'text-xs h-7 gap-1.5 transition-colors cursor-pointer',
                      isSelected &&
                        'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                    )}
                  >
                    <Globe className="size-3" />
                    <span>{preset.name}</span>
                  </Button>
                )
              })}
            </div>
          </div>
        </Card>
      )}
      {section === 'dns' && (
        <Card className="border border-border/70 bg-card/60 p-4 rounded-xl">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-foreground">
                  {t('resilientDnsFallback')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t('resilientDnsFallbackDescription')}
                </span>
              </div>
              <Switch
                aria-label={t('resilientDnsFallback')}
                checked={fallbackEnabled}
                onCheckedChange={(checked) => {
                  setFallbackEnabled(checked)
                  setDirty(true)
                  setMessage('')
                }}
              />
            </div>
            {fallbackEnabled && (
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="text-xs font-medium">{t('fallbackDnsServers')}</span>
                <Textarea
                  value={fallbackText}
                  placeholder={t('fallbackDnsPlaceholder')}
                  onChange={(e) => {
                    setFallbackText(e.target.value)
                    setDirty(true)
                    setMessage('')
                  }}
                  rows={2}
                  className="font-mono text-xs"
                />
                <span className="text-[11px] text-muted-foreground">
                  {t('oneEntryPerLineForExample778888')}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}
      {enabled ? <SettingsFields prefix={section} fields={fields} value={value} onChange={(next) => { setValue(next); setDirty(true); setMessage('') }} />
        : <p className="text-xs text-muted-foreground">{t('subscriptionSettingsHint')}</p>}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </form>
  </Page>
}
