import { I18nProvider, useTranslations } from './i18n'
import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { ChevronRight, FileText, LoaderCircle, X } from 'lucide-react'
import { TitleBar } from './components/TitleBar'
import { WhatsNewDialog } from './components/WhatsNewDialog'
import { UpdaterProvider } from './providers/UpdaterProvider'
import { Sidebar } from './components/Sidebar'
import { useAppStore } from './stores/useAppStore'
import { DashboardPage } from './pages/DashboardPage'
import { ProxiesPage } from './pages/ProxiesPage'
import { ProfilesPage } from './pages/ProfilesPage'
import { ConnectionsPage } from './pages/ConnectionsPage'
import { LogsPage } from './pages/LogsPage'
import { RulesPage } from './pages/RulesPage'
import { getNavigationGroup, getNavigationItem } from './lib/navigation'
import { EmojiText } from './components/EmojiText'
import { profileName } from './lib/profile-name'
import { ProfileLogo } from './components/ProfileLogo'
import { CustomThemesProvider, useCustomThemes } from './providers/CustomThemesProvider'
import { BUILTIN_THEMES, applyThemeToDocument, resolveTheme, type ThemeDefinition } from './lib/theme'

const NetworkSettingsPage = lazy(() => import('./pages/NetworkSettingsPage').then((module) => ({ default: module.NetworkSettingsPage })))
const ProfileConfigPage = lazy(() => import('./pages/ProfileConfigPage').then((module) => ({ default: module.ProfileConfigPage })))

export default function App() {
  const store = useAppStore()
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
    <I18nProvider locale={store.settings.general.language}>
      <CustomThemesProvider>
        <UpdaterProvider><Workspace store={store} /></UpdaterProvider>
      </CustomThemesProvider>
    </I18nProvider>
  )
}

function Workspace({ store }: { store: ReturnType<typeof useAppStore> }) {
  const t = useTranslations('app')
  const common = useTranslations('common')
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
  const { activeTab, setActiveTab, coreStatus, traffic, sysProxy, activeProfile, profiles, settings, proxies, delays, updateDelays, connections, logs, rules, busy, loading, error } = store
  const [pendingImport, setPendingImport] = useState<{ url: string; name?: string } | null>(null)

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
  }, [settings.general.theme, themes])

  const toggleTun = () => {
    const nextEnable = !settings.kernel.tun.enable
    void store.saveSettings({ kernel: { ...settings.kernel, tun: { ...settings.kernel.tun, enable: nextEnable } } }).catch(() => {})
  }
  return <div className="app-shell">
    <TitleBar />
    <WhatsNewDialog />
    <div className="app-workspace">
      <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} coreStatus={coreStatus} open={sidebarOpen} onToggle={toggleSidebar} mode={settings.kernel.mode} captureEnabled={sysProxy.enabled || settings.kernel.tun.enable} busy={busy} onUpdateMode={(mode) => { void store.saveSettings({ kernel: { ...settings.kernel, mode } }).catch(() => {}) }} />
      <main className="app-main relative">
        <header className="workspace-header">
          <nav aria-label={common('breadcrumb')} className="min-w-0"><ol className="flex min-w-0 items-center gap-2 text-xs"><li className="flex min-w-0 items-center gap-2 text-muted-foreground"><Icon className="size-3.5 shrink-0" /><span className="truncate">{common(group.id)}</span></li><li aria-hidden="true"><ChevronRight className="size-3 shrink-0 text-muted-foreground/60" /></li><li aria-current="page" className="truncate font-medium">{common(activeTab)}</li></ol></nav>
          <div className="flex min-w-0 max-w-[45%] items-center gap-2 text-[11px] text-muted-foreground">{busy ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" /> : <ProfileLogo url={activeProfile?.profileLogo} className="size-3.5 shrink-0 rounded-xs object-contain" fallback={<FileText className="size-3.5 shrink-0" />} />}<span className="truncate"><EmojiText text={busy ? t('applyingChanges') : activeProfile ? profileName(activeProfile, settings.general.language) : t('noActiveProfile')} /></span></div>
        </header>
        {error && (
          <div
            role="alert"
            className="absolute top-13 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-2xl z-50 flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-card/95 backdrop-blur-xl px-4 py-2.5 text-xs shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <p className="min-w-0 break-words font-medium text-foreground">{error}</p>
              {(error.toLowerCase().includes('администратор') || error.toLowerCase().includes('admin')) && (
                <button
                  type="button"
                  onClick={() => void window.api?.app?.restartAsAdmin?.()}
                  className="shrink-0 rounded-md bg-destructive px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-transform hover:opacity-90 active:scale-95 cursor-pointer"
                >
                  {common('restartAsAdministrator')}
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label={t('dismissError')}
              onClick={store.dismissError}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {!window.api && <div className="shrink-0 border-b border-border bg-muted/40 px-5 py-2 text-xs text-muted-foreground">{t('interfacePreviewOpenQzyriumInElectronToConnectToMihomo')}</div>}
        <div className="page-viewport" key={activeTab}>
          {loading ? <div className="empty-state h-full"><LoaderCircle className="size-5 animate-spin" /><p>{t('loadingWorkspace')}</p></div> : <Suspense fallback={<div className="empty-state h-full"><LoaderCircle className="size-5 animate-spin" /><p>{t('loadingWorkspace')}</p></div>}>
            {activeTab === 'dashboard' && <DashboardPage coreStatus={coreStatus} sessionStartedAt={store.sessionStartedAt} traffic={traffic} activeProfile={activeProfile} profiles={profiles} proxies={proxies} delays={delays} onSwitchProfile={store.switchActiveProfile} onUpdateDelays={updateDelays} settings={settings} connections={connections} sysProxy={sysProxy} busy={busy} rules={rules} onRestart={store.restartKernel} onToggleKernel={store.toggleKernel} onToggleSysProxy={store.toggleSysProxy} onToggleTun={toggleTun} onUpdateMode={(mode) => { void store.saveSettings({ kernel: { ...settings.kernel, mode } }).catch(() => {}) }} onNavigate={setActiveTab} />}
            {activeTab === 'proxies' && <ProxiesPage proxies={proxies} rules={rules} mode={settings.kernel.mode} delays={delays} onUpdateDelays={updateDelays} onSelectNode={store.selectProxyNode} testConcurrency={settings.general.delayTestConcurrency ?? 6} />}
            {activeTab === 'profiles' && <ProfilesPage profiles={profiles} activeProfile={activeProfile} onSwitchProfile={store.switchActiveProfile} onRefreshAll={store.refreshAll} importRequest={pendingImport} onClearImportRequest={() => setPendingImport(null)} />}
            {activeTab === 'connections' && <ConnectionsPage connections={connections} onRefresh={store.refreshAll} />}
            {activeTab === 'rules' && <RulesPage rules={rules} running={coreStatus === 'running'} busy={busy} onRefresh={store.refreshAll} />}
            {activeTab === 'logs' && <LogsPage logs={logs} onClear={store.clearLogs} />}
            {(activeTab === 'tun' || activeTab === 'sysproxy' || activeTab === 'mihomo' || activeTab === 'settings') && <NetworkSettingsPage section={activeTab} settings={settings} sysProxy={sysProxy} busy={busy} onSaveSettings={store.saveSettings} onToggleSysProxy={store.toggleSysProxy} onNavigate={setActiveTab} />}
            {(activeTab === 'dns' || activeTab === 'sniffer' || activeTab === 'resources') && <ProfileConfigPage section={activeTab} settings={settings} busy={busy} onSaveSettings={store.saveSettings} onNavigate={setActiveTab} />}
          </Suspense>}
        </div>
      </main>
    </div>
  </div>
}
