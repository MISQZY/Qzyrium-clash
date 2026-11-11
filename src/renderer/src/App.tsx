import { PageContent } from './pages/PageContent'
import { I18nProvider, useTranslations } from './i18n'
import { selectedLocalization } from '@shared/custom-localization'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { AlertTriangle, ChevronRight, FileText, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Alert } from './components/ui/alert'
import { Button } from './components/ui/button'
import { TitleBar } from './components/TitleBar'
import { WhatsNewDialog } from './components/WhatsNewDialog'
import { UpdaterProvider } from './providers/UpdaterProvider'
import { Sidebar } from './components/Sidebar'
import { AppStoreProvider, useNavigation, useKernel, useSettings, useProfiles } from './stores/useAppStore'

import { getNavigationGroup, getNavigationItem } from './lib/navigation'
import { EmojiText } from './components/EmojiText'
import { profileName } from './lib/profile-name'
import { ProfileLogo } from './components/ProfileLogo'
import { CustomThemesProvider, useCustomThemes } from './providers/CustomThemesProvider'
import { BUILTIN_THEMES, applyThemeToDocument, resolveTheme, type ThemeDefinition } from './lib/theme'

export default function App() {
  return (
    <AppStoreProvider>
      <AppContent />
    </AppStoreProvider>
  )
}

function AppContent() {
  const { settings } = useSettings()
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (e.message?.includes('ResizeObserver')) {
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('error', onError)
    return () => window.removeEventListener('error', onError)
  }, [])
  return (
    <I18nProvider locale={settings.general.language} custom={selectedLocalization(settings.general)}>
      <CustomThemesProvider>
        <UpdaterProvider><Workspace /></UpdaterProvider>
      </CustomThemesProvider>
    </I18nProvider>
  )
}

function Workspace() {
  const store = { ...useNavigation(), ...useKernel(), ...useSettings(), ...useProfiles() }
  const t = useTranslations('app')
  const common = useTranslations('common')
  const profileT = useTranslations('profiles')
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('sidebar_state') !== 'collapsed')
  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), [])
  useEffect(() => { localStorage.setItem('sidebar_state', sidebarOpen ? 'expanded' : 'collapsed') }, [sidebarOpen])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'b' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.repeat) {
        if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  useEffect(() => {
    const handleFocus = () => { document.documentElement.dataset.windowFocused = 'true' }
    const handleBlur = () => { document.documentElement.dataset.windowFocused = 'false' }
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    document.documentElement.dataset.windowFocused = document.hasFocus() ? 'true' : 'false'
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])
  const { activeTab, setActiveTab, coreStatus, sysProxy, activeProfile, settings, busy, error } = store
  const [updatingProfile, setUpdatingProfile] = useState(false)
  const profileUpdatePending = useRef(false)
  const updateActiveProfile = async () => {
    if (profileUpdatePending.current || busy || !activeProfile?.url || !window.api) return
    profileUpdatePending.current = true
    setUpdatingProfile(true)
    try { await store.updateActiveProfile() } finally {
      profileUpdatePending.current = false
      setUpdatingProfile(false)
    }
  }
  const [pendingImport, setPendingImport] = useState<{ url: string; name?: string } | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let received = false
    const unsubscribe = window.api?.events.onWarning?.((message) => {
      received = true
      setWarning(message)
    })
    void window.api?.kernel.getRuleWarning?.().then((message) => {
      if (active && !received) setWarning(message)
    }).catch(() => {})
    return () => { active = false; unsubscribe?.() }
  }, [])
  const [restartingAdmin, setRestartingAdmin] = useState(false)
  const [adminRestartFailed, setAdminRestartFailed] = useState(false)
  const adminRestartPending = useRef(false)
  const errorMessage = error?.replace(/^Error invoking remote method '[^']+':\s*/i, '').replace(/^Error:\s*/i, '')
  const requiresAdmin = !!errorMessage && /администратор|admin|tunrequiresadmin/i.test(errorMessage)

  useEffect(() => { setAdminRestartFailed(false) }, [error])

  const handleRestartAsAdmin = async () => {
    if (adminRestartPending.current) return
    adminRestartPending.current = true
    setRestartingAdmin(true)
    setAdminRestartFailed(false)
    try {
      if (!await window.api?.app?.restartAsAdmin?.()) setAdminRestartFailed(true)
    } catch {
      setAdminRestartFailed(true)
    } finally {
      adminRestartPending.current = false
      setRestartingAdmin(false)
    }
  }

  useEffect(() => {
    if (!window.api?.events?.onImportProfile) return
    return window.api.events.onImportProfile((data) => {
      setPendingImport(data)
      setActiveTab('profiles')
    })
  }, [setActiveTab])
  const item = getNavigationItem(activeTab)
  const group = getNavigationGroup(activeTab)
  const Icon = item.icon
  const { customThemes } = useCustomThemes()
  const themes = useMemo<ThemeDefinition[]>(() => [...BUILTIN_THEMES, ...customThemes], [customThemes])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = resolveTheme(settings.general.theme, themes)
      applyThemeToDocument(resolved)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.general.theme, themes])

  const saveSettingsRef = useRef(store.saveSettings)
  saveSettingsRef.current = store.saveSettings
  // A deleted custom theme shouldn't leave the app pointed at a preference that no longer resolves
  useEffect(() => {
    if (settings.general.theme === 'system' || settings.general.theme === 'dark' || settings.general.theme === 'light') return
    if (!themes.some((theme) => theme.id === settings.general.theme)) {
      void saveSettingsRef.current({ general: { ...settings.general, theme: 'dark' } }).catch(() => {})
    }
  }, [settings.general, themes])

  return <div className="app-shell">
    <TitleBar />
    <WhatsNewDialog />
    <div className="app-workspace">
      <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} coreStatus={coreStatus} open={sidebarOpen} onToggle={toggleSidebar} mode={settings.kernel.mode} captureEnabled={sysProxy.enabled || settings.kernel.tun.enable} tunEnabled={settings.kernel.tun.enable} busy={busy} onUpdateMode={(mode) => { void store.saveSettings({ kernel: { ...settings.kernel, mode } }).catch(() => {}) }} />
      <main className="app-main relative">
        <header className="workspace-header">
          <nav aria-label={common('breadcrumb')} className="min-w-0"><ol className="flex min-w-0 items-center gap-2 text-xs"><li className="min-w-0 text-muted-foreground"><span className="truncate">{common(group.id)}</span></li><li aria-hidden="true"><ChevronRight className="size-3 shrink-0 text-muted-foreground/60" /></li><li aria-current="page" className="flex min-w-0 items-center gap-2 font-medium"><Icon className="size-3.5 shrink-0" /><span className="truncate">{common(activeTab)}</span></li></ol></nav>
          <div className="flex min-w-0 max-w-[45%] items-center gap-2 text-[11px] text-muted-foreground">{busy ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" /> : <ProfileLogo url={activeProfile?.profileLogo} className="size-3.5 shrink-0 rounded-xs object-contain" fallback={<FileText className="size-3.5 shrink-0" />} />}<span className="truncate"><EmojiText text={busy ? t('applyingChanges') : activeProfile ? profileName(activeProfile, settings.general.language, selectedLocalization(settings.general)) : t('noActiveProfile')} /></span><Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label={profileT('updateSubscription')} title={profileT('updateSubscription')} disabled={!activeProfile?.url || busy || updatingProfile || !window.api} aria-busy={updatingProfile} onClick={() => void updateActiveProfile()}><RefreshCw className={`size-3.5 ${updatingProfile ? 'animate-spin' : ''}`} /></Button></div>
        </header>
        {warning && !error && createPortal(
          <Alert variant="warning" className="fixed right-4 bottom-4 z-[100] flex max-h-[calc(100dvh-96px)] w-[calc(100%-32px)] max-w-md items-start gap-3 overflow-y-auto text-xs shadow-xl">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed font-medium text-foreground">{warning}</p>
            <button type="button" aria-label={common('close')} onClick={() => setWarning(null)} className="shrink-0 rounded-md p-1 hover:bg-warning/10 transition-colors cursor-pointer"><X className="size-4" /></button>
          </Alert>, document.body
        )}
        {error && createPortal(
          <Alert
            variant="destructive"
            className="fixed right-4 bottom-4 z-[100] flex max-h-[calc(100dvh-96px)] w-[calc(100%-32px)] max-w-md items-start gap-3 overflow-y-auto text-xs shadow-xl"
          >
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
              <p className="w-full whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed font-medium text-foreground">{errorMessage}</p>
              {requiresAdmin && (
                <button
                  type="button"
                  onClick={() => void handleRestartAsAdmin()}
                  disabled={restartingAdmin}
                  aria-busy={restartingAdmin}
                  className="flex max-w-full items-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-left text-[11px] font-semibold text-white shadow-sm transition-transform hover:opacity-90 active:scale-95 cursor-pointer disabled:cursor-wait disabled:opacity-60"
                >
                  {restartingAdmin && <LoaderCircle className="size-3.5 shrink-0 animate-spin" />}
                  {restartingAdmin ? common('restarting') : common('restartAsAdministrator')}
                </button>
              )}
              {adminRestartFailed && <p className="w-full [overflow-wrap:anywhere] leading-relaxed text-destructive">{t('adminRestartFailed')}</p>}
            </div>
            <button
              type="button"
              aria-label={t('dismissError')}
              onClick={store.dismissError}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </Alert>, document.body
        )}
        {!window.api && <div className="shrink-0 border-b border-border bg-muted/40 px-5 py-2 text-xs text-muted-foreground">{t('interfacePreviewOpenQzyriumInElectronToConnectToMihomo')}</div>}
        <div className="page-viewport" key={activeTab}>
          <PageContent importRequest={pendingImport} onClearImportRequest={() => setPendingImport(null)} />
        </div>
      </main>
    </div>
  </div>
}
