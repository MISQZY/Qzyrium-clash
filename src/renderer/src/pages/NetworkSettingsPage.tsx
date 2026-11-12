import { GeneralPreferencesPanel } from '../components/settings/GeneralPreferencesPanel'
import { BackupSettings } from '../components/settings/BackupSettings'
import { SettingsOverview, SettingsNetworkLinks } from '../components/settings/SettingsOverview'
import { NetworkSettingsPanel } from '../components/settings/NetworkSettingsPanel'
import { useSettingsDraft } from '../hooks/useSettingsDraft'
import { type SettingsSection } from '@shared/settings-config'
import { SETTINGS_SECTIONS } from '../lib/settings-sections'
import { useTranslations } from '../i18n'
import { useState, useEffect } from 'react'
import { Save, ArrowLeft } from 'lucide-react'
import { SystemProxyIcon, TunIcon } from '../lib/icons'
import type { AppConfig } from '@shared/app-config'
import type { SysProxyStatus } from '@shared/ipc'

import type { NavTab } from '../lib/navigation'
import { Page } from '../components/Page'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'

type Section = SettingsSection

interface Props {
  section: Section; settings: AppConfig; sysProxy: SysProxyStatus; busy: boolean
  onSaveSettings: (patch: Partial<AppConfig>) => Promise<void>
  onToggleSysProxy: () => void
  onNavigate?: (tab: NavTab) => void
}

export function NetworkSettingsPage({ section, settings, sysProxy, busy, onSaveSettings, onToggleSysProxy, onNavigate }: Props) {
  const t = useTranslations('networksettings')
  const common = useTranslations('common')

  const draft = useSettingsDraft(section, settings, onSaveSettings)
  const { form, dirty, message, setMessage, updateTun, discard, resetToDefaults, save } = draft

  const [isElevated, setIsElevated] = useState<boolean | null>(null)
  const [tunAdminPrompt, setTunAdminPrompt] = useState(false)
  const [restartingAdmin, setRestartingAdmin] = useState(false)

  const handleRestartAsAdmin = async (): Promise<void> => {
    if (restartingAdmin) return
    setRestartingAdmin(true)
    try {
      const result = await window.api?.app?.restartAsAdmin?.()
      if (!result) {
        setRestartingAdmin(false)
      }
    } catch {
      setRestartingAdmin(false)
    }
  }

  useEffect(() => {
    let active = true
    void window.api?.app?.isElevated?.().then(value => { if (active) setIsElevated(value) }).catch(() => { if (active) setIsElevated(false) })
    if (!window.api?.app?.isElevated) setIsElevated(false)
    return () => { active = false }
  }, [])

  const { title: titleKey } = SETTINGS_SECTIONS[section]
  const title = t(titleKey)

  const activeCaptureMode: 'off' | 'tun' | 'sysproxy' = form.kernel.tun.enable
    ? 'tun'
    : sysProxy.enabled
    ? 'sysproxy'
    : 'off'

  const handleSelectCaptureMode = async (mode: 'off' | 'tun' | 'sysproxy') => {
    if (busy) return
    setMessage('')
    if (mode === 'tun') {
      const elevated = isElevated ?? (await window.api?.app?.isElevated?.().catch(() => false))
      if (!elevated) {
        setIsElevated(false)
        setTunAdminPrompt(true)
        setMessage('tunRequiresAdmin')
        return
      }
      setTunAdminPrompt(false)
      if (sysProxy.enabled) {
        await onToggleSysProxy()
      }
      updateTun({ enable: true })
      try {
        await onSaveSettings({ kernel: { ...settings.kernel, tun: { ...form.kernel.tun, enable: true } } })
      } catch {
        setMessage('changesCouldNotBeAppliedCheckTheErrorAbove')
      }
    } else if (mode === 'sysproxy') {
      if (form.kernel.tun.enable) {
        updateTun({ enable: false })
        try {
          await onSaveSettings({ kernel: { ...settings.kernel, tun: { ...form.kernel.tun, enable: false } } })
        } catch {
          setMessage('changesCouldNotBeAppliedCheckTheErrorAbove')
        }
      }
      if (!sysProxy.enabled) {
        onToggleSysProxy()
      }
    } else {
      if (form.kernel.tun.enable) {
        updateTun({ enable: false })
        try {
          await onSaveSettings({ kernel: { ...settings.kernel, tun: { ...form.kernel.tun, enable: false } } })
        } catch {
          setMessage('changesCouldNotBeAppliedCheckTheErrorAbove')
        }
      }
      setTunAdminPrompt(false)
      if (sysProxy.enabled) {
        onToggleSysProxy()
      }
    }
  }

  return <Page title={title} actions={
    <div className="flex items-center gap-2">
      {dirty && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={discard}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t('discard')}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={resetToDefaults}
        className="text-xs"
        title={t('resetSectionHint')}
      >
        {t('resetSection')}
      </Button>
      {section !== 'settings' && onNavigate && (
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
      <Button type="submit" form={`settings-${section}`} size="sm" disabled={busy || !dirty}>
        <Save className="size-3.5" />
        {busy ? t('saving') : t('saveChanges')}
      </Button>
    </div>
  }>
    {section === 'settings' && (
      <Card data-tour="capture">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <SystemProxyIcon className="size-4 text-primary" />
                {t('connectionModes')}
              </h2>
            </div>
            <div role="group" aria-label={t('connectionModes')} className="flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs shrink-0 self-start sm:self-auto">
              <button
                type="button"
                disabled={busy}
                aria-pressed={activeCaptureMode === 'off'}
                onClick={() => void handleSelectCaptureMode('off')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                  activeCaptureMode === 'off'
                    ? 'bg-background text-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('captureModeDisabled')}
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={activeCaptureMode === 'sysproxy'}
                onClick={() => void handleSelectCaptureMode('sysproxy')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                  activeCaptureMode === 'sysproxy'
                    ? 'bg-background text-foreground shadow-sm text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <SystemProxyIcon className="size-3" />
                <span>{t('systemProxy')}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                aria-pressed={activeCaptureMode === 'tun'}
                onClick={() => void handleSelectCaptureMode('tun')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                  activeCaptureMode === 'tun'
                    ? 'bg-background text-foreground shadow-sm text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <TunIcon className="size-3" />
                <span>TUN</span>
              </button>
            </div>
          </div>

          {isElevated === false && (form.kernel.tun.enable || tunAdminPrompt) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <span className="min-w-0 flex-1 leading-relaxed">
                {t('tunAdminExplanation')}
              </span>
              <button
                type="button"
                disabled={restartingAdmin}
                onClick={() => void handleRestartAsAdmin()}
                className="shrink-0 rounded bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-black transition-transform hover:opacity-90 active:scale-95 cursor-pointer"
              >
                {restartingAdmin ? common('restarting') || 'Restarting...' : common('restartAsAdministrator')}
              </button>
            </div>
          )}

        </CardContent>
      </Card>
    )}
    {section === 'settings' && <SettingsNetworkLinks draft={draft} settings={settings} sysProxy={sysProxy} busy={busy} onSaveSettings={onSaveSettings} onNavigate={onNavigate} />}
    <form onInvalidCapture={(event) => {
      // Reveal invalid fields before the browser attempts to focus them.
      let disclosure = (event.target as HTMLElement).closest('details')
      while (disclosure) {
        disclosure.open = true
        disclosure = disclosure.parentElement?.closest('details') ?? null
      }
    }} id={`settings-${section}`} onSubmit={save} className="relative flex flex-col gap-4">
      {section !== 'settings' && <NetworkSettingsPanel section={section} draft={draft} settings={settings} sysProxy={sysProxy}
        busy={busy} onToggleSysProxy={onToggleSysProxy} isElevated={isElevated} restartingAdmin={restartingAdmin}
        handleRestartAsAdmin={handleRestartAsAdmin} setTunAdminPrompt={setTunAdminPrompt} />}
      {section === 'settings' && <GeneralPreferencesPanel draft={draft} busy={busy} />}
      {message && <p role="status" className="text-xs text-muted-foreground">{t(message)}</p>}
    </form>
    {section === 'settings' && <SettingsOverview draft={draft} onNavigate={onNavigate} />}
    {section === 'settings' && <BackupSettings disabled={busy || dirty} />}

  </Page>
}
