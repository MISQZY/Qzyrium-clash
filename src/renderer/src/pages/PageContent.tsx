import { lazy, Suspense } from 'react'
import { LoaderCircle } from 'lucide-react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useTranslations } from '../i18n'
import { useNavigation, useKernel, useSettings, useProfiles, useProxies,
  useConnections, useRules, useLogs, useRefreshAll } from '../stores/useAppStore'
import type { SettingsSection } from '@shared/settings-config'
import { DashboardPage } from './DashboardPage'

const ProxiesPage = lazy(() => import('./ProxiesPage').then(module => ({ default: module.ProxiesPage })))
const ProfilesPage = lazy(() => import('./ProfilesPage').then(module => ({ default: module.ProfilesPage })))
const ConnectionsPage = lazy(() => import('./ConnectionsPage').then(module => ({ default: module.ConnectionsPage })))
const LogsPage = lazy(() => import('./LogsPage').then(module => ({ default: module.LogsPage })))
const RulesPage = lazy(() => import('./RulesPage').then(module => ({ default: module.RulesPage })))
const NetworkSettingsPage = lazy(() => import('./NetworkSettingsPage').then(module => ({ default: module.NetworkSettingsPage })))
const ProfileConfigPage = lazy(() => import('./ProfileConfigPage').then(module => ({ default: module.ProfileConfigPage })))

interface ImportProps { importRequest: { url: string; name?: string } | null; onClearImportRequest: () => void }

function DashboardContent() {
  const { visible, busy, setActiveTab } = useNavigation()
  const { coreStatus, sessionStartedAt, toggleKernel } = useKernel()
  const { settings, sysProxy, toggleSysProxy } = useSettings()
  const { activeProfile } = useProfiles()
  return <DashboardPage visible={visible} coreStatus={coreStatus} sessionStartedAt={sessionStartedAt}
    activeProfile={activeProfile} settings={settings} sysProxy={sysProxy} busy={busy}
    onToggleKernel={() => {
      if (coreStatus !== 'running' && !settings.kernel.tun.enable && !settings.sysProxy.enable) {
        void toggleSysProxy().catch(() => {})
        return
      }
      void toggleKernel().catch(() => {})
    }}
    onToggleSysProxy={toggleSysProxy}
    onNavigate={setActiveTab} />
}

function ProxiesContent() {
  const refreshAll = useRefreshAll()
  const { activeProfile } = useProfiles()
  const { coreStatus } = useKernel()
  const { settings } = useSettings()
  const { proxies, delays, updateDelays, selectProxyNode } = useProxies()
  const { rules } = useRules()
  return <ProxiesPage running={coreStatus === 'running'} proxies={proxies} rules={rules} mode={settings.kernel.mode}
    delays={delays} onUpdateDelays={updateDelays} onSelectNode={selectProxyNode} testConcurrency={settings.general.delayTestConcurrency ?? 6}
    onRefresh={refreshAll} profileId={activeProfile?.id} serviceCheckTargets={settings.general.serviceCheckTargets}
    displayMode={activeProfile?.displayMode ?? activeProfile?.serverDisplayMode ?? 'full'} />
}

function ProfilesContent(props: ImportProps) {
  const { profiles, activeProfile, switchActiveProfile } = useProfiles()
  const refreshAll = useRefreshAll()
  return <ProfilesPage profiles={profiles} activeProfile={activeProfile} onSwitchProfile={switchActiveProfile}
    onRefreshAll={refreshAll} {...props} />
}

function ConnectionsContent() {
  const connections = useConnections((state) => state.connections)
  const refreshConnections = useConnections((state) => state.refreshConnections)
  return <ConnectionsPage connections={connections} onRefresh={refreshConnections} />
}

function RulesContent() {
  const { activeProfile } = useProfiles()
  const { rules } = useRules()
  const { coreStatus } = useKernel()
  const { busy } = useNavigation()
  const refreshAll = useRefreshAll()
  return <RulesPage rules={rules} running={coreStatus === 'running'} busy={busy} onRefresh={refreshAll} profileId={activeProfile?.id} />
}

function LogsContent() {
  const logs = useLogs((state) => state.logs)
  const clearLogs = useLogs((state) => state.clearLogs)
  return <LogsPage logs={logs} onClear={clearLogs} />
}

function SettingsContent({ section }: { section: SettingsSection }) {
  const { settings, sysProxy, saveSettings, toggleSysProxy } = useSettings()
  const { busy, setActiveTab } = useNavigation()
  return <NetworkSettingsPage section={section} settings={settings} sysProxy={sysProxy} busy={busy}
    onSaveSettings={saveSettings} onToggleSysProxy={toggleSysProxy} onNavigate={setActiveTab} />
}

function ConfigContent({ section }: { section: 'dns' | 'sniffer' | 'resources' }) {
  const { settings, saveSettings } = useSettings()
  const { busy, setActiveTab } = useNavigation()
  return <ProfileConfigPage section={section} settings={settings} busy={busy} onSaveSettings={saveSettings} onNavigate={setActiveTab} />
}

/** Only the active page subscribes to its datasets; the shell never reads streams. */
export function PageContent(props: ImportProps) {
  const { activeTab, loading } = useNavigation()
  const t = useTranslations('app')
  const placeholder = <div className="empty-state h-full"><LoaderCircle className="size-5 animate-spin" /><p>{t('loadingWorkspace')}</p></div>
  if (loading) return placeholder
  let page
  switch (activeTab) {
    case 'dashboard': page = <DashboardContent />; break
    case 'proxies': page = <ProxiesContent />; break
    case 'profiles': page = <ProfilesContent {...props} />; break
    case 'connections': page = <ConnectionsContent />; break
    case 'rules': page = <RulesContent />; break
    case 'logs': page = <LogsContent />; break
    case 'settings': case 'tun': case 'sysproxy': case 'mihomo': page = <SettingsContent section={activeTab} />; break
    case 'dns': case 'sniffer': case 'resources': page = <ConfigContent section={activeTab} />; break
  }
  return <ErrorBoundary key={activeTab} name={`PageContent:${activeTab}`}><Suspense fallback={placeholder}>{page}</Suspense></ErrorBoundary>
}
