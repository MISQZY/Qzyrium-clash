import { useTranslations } from '../i18n'
import { useState, useEffect, type FormEvent } from 'react'
import { Save, Folder, ArrowLeft, ChevronRight, Download, Upload, Trash2, RefreshCw } from 'lucide-react'
import druseSvg from '../assets/brand/druse.svg'
import { SystemProxyIcon, TunIcon, CoreIcon, SettingsIcon, DnsIcon, SnifferIcon, ResourcesIcon } from '../lib/icons'
import type { AppConfig } from '@shared/app-config'
import type { SysProxyStatus } from '@shared/ipc'
import type { LogLevel } from '@shared/types'
import type { NavTab } from '../lib/navigation'
import { Page, SettingRow } from '../components/Page'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Switch } from '../components/ui/switch'
import { SettingsFields } from '../components/SettingsFields'
import { ThemeSelect } from '../components/ThemeSelect'
import { useCustomThemes } from '../providers/CustomThemesProvider'
import { ScrollArea } from '../components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger
} from '../components/ui/alert-dialog'
import { coreFields, generalFields, tunFields } from '@shared/settings-fields'
import { DEFAULT_APP_CONFIG } from '@shared/app-config'

type Section = 'tun' | 'sysproxy' | 'mihomo' | 'settings'

interface Props {
  section: Section; settings: AppConfig; sysProxy: SysProxyStatus; busy: boolean
  onSaveSettings: (patch: Partial<AppConfig>) => Promise<void>
  onToggleSysProxy: () => void
  onNavigate?: (tab: NavTab) => void
}

export function NetworkSettingsPage({ section, settings, sysProxy, busy, onSaveSettings, onToggleSysProxy, onNavigate }: Props) {
  const t = useTranslations('networksettings')
  const common = useTranslations('common')

  const meta = {
    tun: { title: t('tUNInterface'), icon: TunIcon },
    sysproxy: { title: t('systemProxy'), icon: SystemProxyIcon },
    mihomo: { title: t('mihomoCore'), icon: CoreIcon },
    settings: { title: t('settings'), icon: SettingsIcon }
  }
  const [form, setForm] = useState(settings)
  const [bypass, setBypass] = useState(settings.sysProxy.bypass.join('\n'))
  const [dnsHijack, setDnsHijack] = useState(settings.kernel.tun.dnsHijack.join('\n'))
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<Parameters<typeof t>[0] | ''>('')
  const [coreVersion, setCoreVersion] = useState<string>('v1.19.33')
  const [appVersion, setAppVersion] = useState<string>('0.1.0')
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<{ type: 'latest' | 'available' | 'error' | 'unsupported' | 'downloading' | 'downloaded'; version?: string } | null>(null)
  const [isElevated, setIsElevated] = useState<boolean | null>(null)
  const { customThemes, uploadTheme, deleteCustomTheme, downloadExampleTheme } = useCustomThemes()
  const [uploadingTheme, setUploadingTheme] = useState(false)
  const [invalidFileNotice, setInvalidFileNotice] = useState<'theme' | null>(null)

  const handleUploadTheme = async (): Promise<void> => {
    setUploadingTheme(true)
    try {
      const result = await uploadTheme()
      if (result === 'invalid') setInvalidFileNotice('theme')
    } finally {
      setUploadingTheme(false)
    }
  }

  const handleDeleteTheme = async (id: string): Promise<void> => {
    await deleteCustomTheme(id)
    if (form.general.theme === id) {
      updateGeneral({ theme: 'dark' })
    }
  }

  useEffect(() => {
    if (window.api?.kernel?.getVersion) {
      window.api.kernel.getVersion().then((v) => {
        if (v?.version) setCoreVersion(v.version)
      }).catch(() => {})
    }
    if (window.api?.app?.isElevated) {
      window.api.app.isElevated().then(setIsElevated).catch(() => {})
    }
    if (window.api?.app?.getVersion) {
      window.api.app.getVersion().then((v) => {
        if (v) setAppVersion(v)
      }).catch(() => {})
    }
  }, [])

  const handleCheckUpdates = async () => {
    if (checkingUpdates) return
    setCheckingUpdates(true)
    setUpdateStatus(null)
    try {
      if (window.api?.app?.checkUpdates) {
        const result = await window.api.app.checkUpdates()
        if (result.state === 'available') {
          setUpdateStatus({
            type: 'available',
            version: result.version
          })
        } else if (result.state === 'unsupported' || result.state === 'downloading' || result.state === 'downloaded' || result.state === 'error') {
          setUpdateStatus({ type: result.state })
        } else if (result.state === 'not-available') {
          setUpdateStatus({
            type: 'latest'
          })
        }
      } else {
        setUpdateStatus({
          type: 'unsupported'
        })
      }
    } catch {
      setUpdateStatus({
        type: 'error'
      })
    } finally {
      setCheckingUpdates(false)
    }
  }

  useEffect(() => {
    setForm((prev) => ({ ...prev, general: { ...prev.general, language: settings.general.language, theme: settings.general.theme } }))
  }, [settings.general.language, settings.general.theme])
  useEffect(() => { if (!dirty) setForm(settings) }, [settings, dirty])
  const { title, icon: Icon } = meta[section]
  const updateKernel = (patch: Partial<AppConfig['kernel']>) => { setDirty(true); setMessage(''); setForm((prev) => ({ ...prev, kernel: { ...prev.kernel, ...patch } })) }
  const updateTun = (patch: Partial<AppConfig['kernel']['tun']>) => updateKernel({ tun: { ...form.kernel.tun, ...patch } })
  const updateGeneral = (patch: Partial<AppConfig['general']>) => { setDirty(true); setMessage(''); setForm((prev) => ({ ...prev, general: { ...prev.general, ...patch } })) }
  const updateSysProxy = (patch: Partial<AppConfig['sysProxy']>) => { setDirty(true); setMessage(''); setForm((prev) => ({ ...prev, sysProxy: { ...prev.sysProxy, ...patch } })) }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    try {
      if (section === 'mihomo' && form.kernel.mixedPort === form.kernel.controllerPort) {
        setMessage('mixedAndControllerPortsMustBeDifferent')
        return
      }
      if (section === 'settings') await onSaveSettings({ general: Object.fromEntries(Object.entries({ ...DEFAULT_APP_CONFIG.general, ...form.general }).map(([key, value]) => [key, value === undefined ? DEFAULT_APP_CONFIG.general[key as keyof AppConfig['general']] : value])) as AppConfig['general'] })
      else if (section === 'sysproxy') await onSaveSettings({ sysProxy: { ...form.sysProxy, host: form.sysProxy.host?.trim() || '127.0.0.1', enable: settings.sysProxy.enable, bypass: bypass.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) } })
      else await onSaveSettings({ kernel: section === 'tun' ? { ...settings.kernel, tun: { ...form.kernel.tun, dnsHijack: dnsHijack.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) } } : { ...form.kernel, tun: settings.kernel.tun } })
      setDirty(false)
      setMessage('changesSaved')
    } catch { setMessage('changesCouldNotBeAppliedCheckTheErrorAbove') }
  }

  const resetToDefaults = () => {
    if (section === 'settings') {
      setForm((prev) => ({ ...prev, general: { ...DEFAULT_APP_CONFIG.general, language: settings.general.language, theme: settings.general.theme } }))
    } else if (section === 'sysproxy') {
      setForm((prev) => ({ ...prev, sysProxy: { ...DEFAULT_APP_CONFIG.sysProxy } }))
      setBypass(DEFAULT_APP_CONFIG.sysProxy.bypass.join('\n'))
    } else if (section === 'tun') {
      setForm((prev) => ({ ...prev, kernel: { ...prev.kernel, tun: { ...DEFAULT_APP_CONFIG.kernel.tun } } }))
      setDnsHijack(DEFAULT_APP_CONFIG.kernel.tun.dnsHijack.join('\n'))
    } else if (section === 'mihomo') {
      setForm((prev) => ({ ...prev, kernel: { ...DEFAULT_APP_CONFIG.kernel, tun: prev.kernel.tun } }))
    }
    setDirty(true)
  }


  const activeCaptureMode: 'off' | 'tun' | 'sysproxy' = form.kernel.tun.enable
    ? 'tun'
    : sysProxy.enabled
    ? 'sysproxy'
    : 'off'

  const handleSelectCaptureMode = async (mode: 'off' | 'tun' | 'sysproxy') => {
    if (busy) return
    setMessage('')
    if (mode === 'tun') {
      if (isElevated === false) {
        setMessage('tunRequiresAdmin')
        return
      }
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
          onClick={() => {
            setForm(settings)
            setBypass(settings.sysProxy.bypass.join('\n'))
            setDnsHijack(settings.kernel.tun.dnsHijack.join('\n'))
            setDirty(false)
            setMessage('')
          }}
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
      <Card>
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

          {isElevated === false && form.kernel.tun.enable && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <span className="min-w-0 flex-1 leading-relaxed">
                {t('tunAdminExplanation')}
              </span>
              <button
                type="button"
                onClick={() => void window.api?.app?.restartAsAdmin?.()}
                className="shrink-0 rounded bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-black transition-transform hover:opacity-90 active:scale-95 cursor-pointer"
              >
                {common('restartAsAdministrator')}
              </button>
            </div>
          )}

        </CardContent>
      </Card>
    )}
    <form id={`settings-${section}`} onSubmit={save} className="relative flex flex-col gap-4">
      <Card><CardContent className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-primary" />{title}</h2>
        {section === 'tun' && <>
          {isElevated === false && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-600 dark:text-amber-400">
              <span className="min-w-0 flex-1 leading-relaxed">
                {t('tunAdminExplanation')}
              </span>
              <button
                type="button"
                onClick={() => void window.api?.app?.restartAsAdmin?.()}
                className="shrink-0 rounded bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-black transition-transform hover:opacity-90 active:scale-95"
              >
                {common('restartAsAdministrator')}
              </button>
            </div>
          )}
          <SettingRow
            title={t('enableTUN')}
            description={
              sysProxy.enabled
                ? t('tunDisabledDueToSysProxy')
                : t('capturesTrafficFromApplicationsThatDoNotUseTheSystemProxy')
            }
          >
            <Switch
              aria-label={t('enableTUN')}
              checked={form.kernel.tun.enable}
              disabled={busy || sysProxy.enabled}
              onCheckedChange={(enable) => updateTun({ enable })}
            />
          </SettingRow>
          <SettingRow title={t('networkStack')} description={t('chooseHowTheVirtualInterfaceHandlesPackets')}><select aria-label={t('networkStack')} value={form.kernel.tun.stack} onChange={(event) => updateTun({ stack: event.target.value as AppConfig['kernel']['tun']['stack'] })}><option value="system">{t('system')}</option><option value="gvisor">gVisor</option><option value="mixed">{t('mixed')}</option></select></SettingRow>
          <SettingRow title={t('automaticRouting')} description={t('createRoutesForTheVirtualInterface')}><Switch aria-label={t('automaticRouting')} checked={form.kernel.tun.autoRoute} onCheckedChange={(autoRoute) => updateTun({ autoRoute })} /></SettingRow>
          <SettingRow title={t('strictRouting')} description={t('restrictTrafficThatCouldBypassTheVirtualInterface')}><Switch aria-label={t('strictRouting')} checked={form.kernel.tun.strictRoute} onCheckedChange={(strictRoute) => updateTun({ strictRoute })} /></SettingRow>
          <label className="mt-4 flex flex-col gap-2 text-xs font-medium">{t('dNSHijackDestinations')}<span className="font-normal text-muted-foreground">{t('oneEntryPerLineForExampleAny53')}</span><Textarea value={dnsHijack} onChange={(event) => { setDnsHijack(event.target.value); setDirty(true) }} rows={3} /></label>
          <div className="mt-5"><SettingsFields prefix="tun-options" fields={tunFields} value={form.kernel.tun.options ?? {}} onChange={(options) => updateTun({ options })} /></div>
        </>}
        {section === 'sysproxy' && <>
          <SettingRow
            title={t('systemProxy')}
            description={
              form.kernel.tun.enable || settings.kernel.tun.enable
                ? t('sysProxyDisabledDueToTun')
                : t('endpoint', { host: sysProxy.host ?? '127.0.0.1', port: sysProxy.port })
            }
          >
            <Switch
              aria-label={t('systemProxyEnabled')}
              checked={sysProxy.enabled}
              disabled={busy || form.kernel.tun.enable || settings.kernel.tun.enable}
              onCheckedChange={onToggleSysProxy}
            />
          </SettingRow>
          <SettingRow title={t('proxyMode')}><select aria-label={t('proxyMode')} value={form.sysProxy.mode ?? 'manual'} onChange={(event) => updateSysProxy({ mode: event.target.value as 'manual' | 'pac' })}><option value="manual">{t('manualProxy')}</option><option value="pac">PAC</option></select></SettingRow>
          <label className="mt-4 flex flex-col gap-2 text-xs font-medium">{t('proxyHost')}<Input aria-label={t('proxyHost')} value={form.sysProxy.host ?? '127.0.0.1'} onChange={(event) => updateSysProxy({ host: event.target.value })} /></label>
          {form.sysProxy.mode === 'pac' && <label className="mt-4 flex flex-col gap-2 text-xs font-medium">{t('pacScript')}<Textarea aria-label={t('pacScript')} rows={7} className="font-mono text-xs" value={form.sysProxy.pacScript ?? ''} placeholder={t('pacScriptHint')} onChange={(event) => updateSysProxy({ pacScript: event.target.value })} /></label>}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t('applicationsThatHonorWindowsProxySettingsWillUseThisEndpointTUNCanCaptureTrafficFromOtherApplications')}</p>
          <label className="mt-5 flex flex-col gap-2 text-xs font-medium">{t('bypassList')}<span className="font-normal text-muted-foreground">{t('oneHostOrWildcardPerLineLocalDestinationsAreExcludedByDefault')}</span><Textarea value={bypass} onChange={(event) => { setBypass(event.target.value); setDirty(true) }} rows={9} className="font-mono" /></label>
        </>}
        {section === 'mihomo' && <>
          <div className="adaptive-grid mb-3">
            <label className="flex flex-col gap-2 text-xs font-medium">{t('mixedPortHTTPSOCKS5')}<Input type="number" min={1} max={65535} required value={form.kernel.mixedPort || ''} onChange={(event) => updateKernel({ mixedPort: Number(event.target.value) })} /></label>
            <label className="flex flex-col gap-2 text-xs font-medium">{t('controllerPort')}<Input type="number" min={1} max={65535} required value={form.kernel.controllerPort || ''} onChange={(event) => updateKernel({ controllerPort: Number(event.target.value) })} /></label>
          </div>
          <label className="mb-4 flex flex-col gap-2 text-xs font-medium">{t('controllerSecret')}<Input type="password" autoComplete="off" value={form.kernel.controllerSecret} onChange={(event) => updateKernel({ controllerSecret: event.target.value })} /></label>
          <SettingRow title={t('allowLANAccess')} description={t('letOtherDevicesConnectToTheLocalProxy')}><Switch aria-label={t('allowLANAccess')} checked={form.kernel.allowLan} onCheckedChange={(allowLan) => updateKernel({ allowLan })} /></SettingRow>
          <SettingRow title={t('logLevel')} description={t('controlsTheVerbosityOfTheCoreLogStream')}><select aria-label={t('logLevel')} value={form.kernel.logLevel} onChange={(event) => updateKernel({ logLevel: event.target.value as LogLevel })}>{['debug', 'info', 'warning', 'error', 'silent'].map((level) => <option key={level} value={level}>{common(level as 'debug' | 'info' | 'warning' | 'error' | 'silent')}</option>)}</select></SettingRow>
          <p className="mt-4 text-xs text-muted-foreground">{t('savingCoreSettingsRestartsMihomoExistingSessionsWillReconnect')}</p>
          <div className="mt-5"><SettingsFields prefix="core-options" fields={coreFields} value={form.kernel.options ?? {}} onChange={(options) => updateKernel({ options })} /></div>
        </>}
        {section === 'settings' && <>
          <SettingRow title={t('language')} description={t('languageHint')}><select aria-label={t('language')} value={form.general.language} onChange={(event) => updateGeneral({ language: event.target.value as AppConfig['general']['language'] })}><option value="ru">{common('languageRussian')}</option><option value="en">{common('languageEnglish')}</option></select></SettingRow>
          <SettingRow title={t('startCoreOnLaunch')} description={t('automaticallyStartMihomoWhenQzyriumOpens')}><Switch aria-label={t('startCoreOnLaunch')} checked={form.general.autoConnect} onCheckedChange={(autoConnect) => updateGeneral({ autoConnect })} /></SettingRow>
          <SettingRow title={t('minimizeToTray')} description={t('keepTheApplicationRunningWhenTheWindowIsClosed')}><Switch aria-label={t('minimizeToTray')} checked={form.general.minimizeToTray} onCheckedChange={(minimizeToTray) => updateGeneral({ minimizeToTray })} /></SettingRow>
          <div className="setting-row">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('appearance')}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('followYourSystemThemeOrChooseOneExplicitly')}</p>
            </div>
            <div className="shrink-0 flex flex-wrap items-center gap-2">
              <ThemeSelect
                value={form.general.theme}
                onValueChange={(theme) => updateGeneral({ theme })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void downloadExampleTheme()}
              >
                <Download className="size-3.5" />
                {t('downloadExample')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUploadTheme}
                disabled={uploadingTheme}
              >
                <Upload className="size-3.5" />
                {uploadingTheme ? t('uploading') : t('upload')}
              </Button>
            </div>
          </div>

          {customThemes.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t('customThemesTitle')}</p>
              <ScrollArea className="max-h-48">
                <ul className="flex flex-col gap-1.5 pr-2">
                  {customThemes.map((theme) => (
                    <li
                      key={theme.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/80 bg-card px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{theme.name ?? theme.id}</span>
                        <span className="text-[10px] text-muted-foreground uppercase px-1.5 py-0.5 rounded bg-muted/80">
                          {theme.mode}
                        </span>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('deleteCustom')}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogTitle>
                            {t('deleteConfirm', { name: theme.name ?? theme.id })}
                          </AlertDialogTitle>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => void handleDeleteTheme(theme.id)}
                            >
                              {t('deleteCustom')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}
          <div className="mt-5"><SettingsFields prefix="general" inherit={false} fields={generalFields} value={{ ...DEFAULT_APP_CONFIG.general, ...form.general }} onChange={(values) => updateGeneral(values as Partial<AppConfig['general']>)} /></div>
        </>}
      </CardContent></Card>
      {message && <p role="status" className="text-xs text-muted-foreground">{t(message)}</p>}
    </form>
    {section === 'settings' && (
      <>
        {/* Versions Grid */}
        <div className="settings-versions grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Qzyrium App Version Card */}
          <Card>
            <CardContent className="p-5 flex flex-col gap-4 h-full">
              <div className="flex flex-col items-start justify-between gap-4 h-full">
                <div className="flex items-start gap-3 min-w-0 w-full">
                  <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                    <img src={druseSvg} alt="Qzyrium" className="size-5 shrink-0 object-contain" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-foreground break-words">{t('appVersionTitle')}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground font-mono truncate">v{appVersion}</span>
                      {updateStatus && (
                        <span className={`text-[11px] font-medium ${updateStatus.type === 'latest' ? 'text-emerald-500' : updateStatus.type === 'available' ? 'text-primary font-semibold' : 'text-destructive'}`}>
                          • {updateStatus.type === 'available' ? t('updateAvailable', { version: updateStatus.version ?? '' }) : updateStatus.type === 'latest' ? t('latestVersionInstalled') : updateStatus.type === 'unsupported' ? t('updateUnsupported') : updateStatus.type === 'downloading' ? t('updateDownloading') : updateStatus.type === 'downloaded' ? t('updateInstalling') : t('updateCheckFailed')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={checkingUpdates}
                  onClick={handleCheckUpdates}
                  className="gap-1.5 self-start max-w-full h-auto min-h-7.5 py-1.5 whitespace-normal text-left text-xs cursor-pointer"
                >
                  <RefreshCw className={`size-3.5 shrink-0 text-muted-foreground ${checkingUpdates ? 'animate-spin' : ''}`} />
                  <span>{checkingUpdates ? t('checkingForUpdates') : t('checkForUpdates')}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Mihomo Core Version Card */}
          <Card>
            <CardContent className="p-5 flex flex-col gap-4 h-full">
              <div className="flex flex-col items-start justify-between gap-4 h-full">
                <div className="flex items-start gap-3 min-w-0 w-full">
                  <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                    <CoreIcon className="size-4.5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-foreground break-words">{t('mihomoCoreVersion')}</span>
                    <span className="text-xs text-muted-foreground font-mono truncate">{coreVersion}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-nav-target="mihomo"
                  onClick={() => onNavigate?.('mihomo')}
                  className="gap-1.5 self-start max-w-full h-auto min-h-7.5 py-1.5 whitespace-normal text-left text-xs cursor-pointer"
                >
                  <CoreIcon className="size-3.5 shrink-0" />
                  <span>{t('coreSettings')}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Network Section Card */}
        <Card>
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <SystemProxyIcon className="size-4 text-primary" />
                  {t('networkSection')}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('networkSectionDescription')}
                </p>
              </div>
            </div>

            <div className="divide-y divide-border/50 flex flex-col">
              {/* System Proxy */}
              <div className="py-3 flex items-center justify-between gap-3 first:pt-1 last:pb-1">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-md bg-muted/60 text-muted-foreground flex items-center justify-center shrink-0">
                    <SystemProxyIcon className="size-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-foreground">{t('systemProxy')}</span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {sysProxy.enabled ? t('enabledValue') : t('disabledValue')} • {sysProxy.host ?? '127.0.0.1'}:{sysProxy.port ?? 7895}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-nav-target="sysproxy"
                  onClick={() => onNavigate?.('sysproxy')}
                  className="gap-1 h-7 text-xs shrink-0"
                >
                  <span>{t('configure')}</span>
                  <ChevronRight className="size-3 text-muted-foreground" />
                </Button>
              </div>

              {/* TUN Interface */}
              <div className="py-3 flex items-center justify-between gap-3 first:pt-1 last:pb-1">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-md bg-muted/60 text-muted-foreground flex items-center justify-center shrink-0">
                    <TunIcon className="size-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-foreground">{t('tUNInterface')}</span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {form.kernel.tun.enable ? t('enabledValue') : t('disabledValue')} • {form.kernel.tun.stack}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-nav-target="tun"
                  onClick={() => onNavigate?.('tun')}
                  className="gap-1 h-7 text-xs shrink-0"
                >
                  <span>{t('configure')}</span>
                  <ChevronRight className="size-3 text-muted-foreground" />
                </Button>
              </div>

              {/* DNS */}
              <div className="py-3 flex items-center justify-between gap-3 first:pt-1 last:pb-1">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-md bg-muted/60 text-muted-foreground flex items-center justify-center shrink-0">
                    <DnsIcon className="size-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-foreground">{common('dns')}</span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {settings.kernel.dns ? t('overridden') : t('fromSubscription')}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-nav-target="dns"
                  onClick={() => onNavigate?.('dns')}
                  className="gap-1 h-7 text-xs shrink-0"
                >
                  <span>{t('configure')}</span>
                  <ChevronRight className="size-3 text-muted-foreground" />
                </Button>
              </div>

              {/* Sniffer */}
              <div className="py-3 flex items-center justify-between gap-3 first:pt-1 last:pb-1">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-md bg-muted/60 text-muted-foreground flex items-center justify-center shrink-0">
                    <SnifferIcon className="size-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-foreground">{common('sniffer')}</span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {settings.kernel.sniffer ? t('overridden') : t('fromSubscription')}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-nav-target="sniffer"
                  onClick={() => onNavigate?.('sniffer')}
                  className="gap-1 h-7 text-xs shrink-0"
                >
                  <span>{t('configure')}</span>
                  <ChevronRight className="size-3 text-muted-foreground" />
                </Button>
              </div>

              {/* Resources */}
              <div className="py-3 flex items-center justify-between gap-3 first:pt-1 last:pb-1">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-md bg-muted/60 text-muted-foreground flex items-center justify-center shrink-0">
                    <ResourcesIcon className="size-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-foreground">{common('resources')}</span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {settings.kernel.resources ? t('overridden') : t('fromSubscription')}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-nav-target="resources"
                  onClick={() => onNavigate?.('resources')}
                  className="gap-1 h-7 text-xs shrink-0"
                >
                  <span>{t('configure')}</span>
                  <ChevronRight className="size-3 text-muted-foreground" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Application Files */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 text-sm font-semibold">{t('applicationFiles')}</h2>
            <div className="flex flex-wrap gap-2">
              {(['data', 'profiles', 'logs'] as const).map((target) => (
                <Button
                  key={target}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void window.api?.window.openFolder(target).catch(() => setMessage('couldNotOpenTheFolder'))
                  }}
                >
                  <Folder className="size-3.5" />
                  {t(`${target}Folder`)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </>
    )}
    <AlertDialog open={invalidFileNotice !== null} onOpenChange={(open) => !open && setInvalidFileNotice(null)}>
      <AlertDialogContent>
        <AlertDialogTitle>
          {t('invalidThemeFile')}
        </AlertDialogTitle>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setInvalidFileNotice(null)}>
            {common('close')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Page>
}
