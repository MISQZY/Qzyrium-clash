import { PageContent } from './pages/PageContent'
import { I18nProvider, useTranslations } from './i18n'
import { selectedLocalization } from '@shared/custom-localization'
import type { TunnelMode } from '@shared/types'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ChevronRight, FileText, LoaderCircle, RefreshCw } from 'lucide-react'
import { createPortal } from 'react-dom'
import { ToastNotification } from './components/ToastNotification'
import { Button } from './components/ui/button'
import { TitleBar } from './components/TitleBar'
import { WhatsNewDialog } from './components/WhatsNewDialog'
import { TourProvider } from './providers/TourProvider'
import { TourOverlay } from './components/TourOverlay'
import { UpdaterProvider } from './providers/UpdaterProvider'
import { Sidebar } from './components/Sidebar'
import { SmartClipboardBanner } from './components/SmartClipboardBanner'
import { AppStoreProvider, useNavigation, useKernel, useSettings, useProfiles } from './stores/useAppStore'

import { getNavigationGroup, getNavigationItem } from './lib/navigation'
import { EmojiText } from './components/EmojiText'
import { profileName } from './lib/profile-name'
import { ProfileLogo } from './components/ProfileLogo'
import { CustomThemesProvider, useCustomThemes } from './providers/CustomThemesProvider'
import { BUILTIN_THEMES, applyThemeToDocument, resolveTheme, type ThemeDefinition } from './lib/theme'
import { cn } from './lib/utils'

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
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection in renderer:', e.reason)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])
  return (
    <I18nProvider locale={settings.general.language} custom={selectedLocalization(settings.general)}>
      <CustomThemesProvider>
        <UpdaterProvider><TourProvider><Workspace /><TourOverlay /></TourProvider></UpdaterProvider>
      </CustomThemesProvider>
    </I18nProvider>
  )
}

function Workspace() {
  const { activeTab, setActiveTab, busy, error, dismissError } = useNavigation()
  const { coreStatus } = useKernel()
  const { settings, sysProxy, saveSettings } = useSettings()
  const { activeProfile, updateActiveProfile: fetchActiveProfileUpdate } = useProfiles()
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
  const [updatingProfile, setUpdatingProfile] = useState(false)
  const profileUpdatePending = useRef(false)
  const updateActiveProfile = async () => {
    if (profileUpdatePending.current || busy || !activeProfile?.url || !window.api) return
    profileUpdatePending.current = true
    setUpdatingProfile(true)
    try { await fetchActiveProfileUpdate() } finally {
      profileUpdatePending.current = false
      setUpdatingProfile(false)
    }
  }
  const [pendingImport, setPendingImport] = useState<{ id?: string; url: string; name?: string } | null>(null)
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
  const requiresAdmin = !!errorMessage && /администратор|admin|tunrequiresadmin/i.test(errorMessage) && window.api?.platform === 'win32'

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

  const handleClipboardImport = useCallback((req: { url: string; name?: string }) => {
    setPendingImport(req)
    setActiveTab('profiles')
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

  const saveSettingsRef = useRef(saveSettings)
  saveSettingsRef.current = saveSettings
  // A deleted custom theme shouldn't leave the app pointed at a preference that no longer resolves
  useEffect(() => {
    if (settings.general.theme === 'system' || settings.general.theme === 'dark' || settings.general.theme === 'light') return
    if (!themes.some((theme) => theme.id === settings.general.theme)) {
      void saveSettingsRef.current({ general: { ...settings.general, theme: 'dark' } }).catch(() => {})
    }
  }, [settings.general, themes])

  const handleUpdateMode = useCallback((mode: TunnelMode) => {
    void saveSettingsRef.current({ kernel: { ...settings.kernel, mode } }).catch(() => {})
  }, [settings.kernel])

  const sidebarPosition = settings.general.sidebarPosition ?? 'left'

  return <div className="app-shell">
    <TitleBar />
    <WhatsNewDialog />
    <div className={cn(
      'app-workspace',
      sidebarPosition === 'right' && 'flex-row-reverse',
      sidebarPosition === 'top' && 'flex-col',
      sidebarPosition === 'bottom' && 'flex-col-reverse'
    )}>
      <Sidebar position={sidebarPosition} activeTab={activeTab} onSelectTab={setActiveTab} coreStatus={coreStatus} open={sidebarOpen} onToggle={toggleSidebar} mode={settings.kernel.mode} captureEnabled={sysProxy.enabled || settings.kernel.tun.enable} tunEnabled={settings.kernel.tun.enable} busy={busy} onUpdateMode={handleUpdateMode} />
      <main className="app-main relative">
        <header className="workspace-header">
          <nav aria-label={common('breadcrumb')} className="min-w-0"><ol className="flex min-w-0 items-center gap-2 text-xs"><li className="min-w-0 text-muted-foreground"><span className="truncate">{common(group.id)}</span></li><li aria-hidden="true"><ChevronRight className="size-3 shrink-0 text-muted-foreground/60" /></li><li aria-current="page" className="flex min-w-0 items-center gap-2 font-medium"><Icon className="size-3.5 shrink-0" /><span className="truncate">{common(activeTab)}</span></li></ol></nav>
          <div className="flex min-w-0 max-w-[45%] items-center gap-2 text-[11px] text-muted-foreground">{updatingProfile ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" /> : <ProfileLogo url={activeProfile?.profileLogo} className="size-3.5 shrink-0 rounded-xs object-contain" fallback={<FileText className="size-3.5 shrink-0" />} />}<span className="truncate"><EmojiText text={updatingProfile ? t('applyingChanges') : activeProfile ? profileName(activeProfile, settings.general.language, selectedLocalization(settings.general)) : t('noActiveProfile')} /></span><Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label={profileT('updateSubscription')} title={profileT('updateSubscription')} disabled={!activeProfile?.url || busy || updatingProfile || !window.api} aria-busy={updatingProfile} onClick={() => void updateActiveProfile()}><RefreshCw className={`size-3.5 ${updatingProfile ? 'animate-spin' : ''}`} /></Button></div>
        </header>
        {warning && !error && createPortal(
          <ToastNotification
            variant="warning"
            message={warning}
            onClose={() => setWarning(null)}
          />,
          document.body
        )}
        {error && createPortal(
          <ToastNotification
            variant="destructive"
            message={errorMessage ?? ''}
            closeLabel={t('dismissError')}
            onClose={dismissError}
          >
            {requiresAdmin && (
              <button
                type="button"
                onClick={() => void handleRestartAsAdmin()}
                disabled={restartingAdmin}
                aria-busy={restartingAdmin}
                className="flex max-w-full items-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-left text-[11px] font-semibold text-white shadow-sm transition-transform hover:opacity-90 active:scale-95 cursor-pointer disabled:cursor-wait disabled:opacity-60 mt-1"
              >
                {restartingAdmin && <LoaderCircle className="size-3.5 shrink-0 animate-spin" />}
                {restartingAdmin ? common('restarting') : common('restartAsAdministrator')}
              </button>
            )}
            {adminRestartFailed && (
              <p className="w-full [overflow-wrap:anywhere] leading-relaxed text-destructive text-[11px] font-medium mt-1">
                {t('adminRestartFailed')}
              </p>
            )}
          </ToastNotification>,
          document.body
        )}
        {!window.api && <div className="shrink-0 border-b border-border bg-muted/40 px-5 py-2 text-xs text-muted-foreground">{t('interfacePreviewOpenQzyriumInElectronToConnectToMihomo')}</div>}
        <SmartClipboardBanner onImport={handleClipboardImport} />
        <div className="page-viewport" key={activeTab}>
          <PageContent importRequest={pendingImport} onClearImportRequest={() => {
            setPendingImport(null)
            if (pendingImport?.id) void window.api?.app.completeProfileImport?.(pendingImport.id).catch(() => {})
          }} />
        </div>
      </main>
    </div>
  </div>
}
