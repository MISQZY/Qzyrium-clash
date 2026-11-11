import { lazy, Suspense } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useTranslations } from '../i18n'
import { useNavigation, useKernel, useSettings, useProfiles, useProxies, useTraffic,
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
  const { coreStatus, sessionStartedAt, restartKernel, toggleKernel } = useKernel()
  const { settings, sysProxy, saveSettings, toggleSysProxy } = useSettings()
  const { activeProfile, profiles, switchActiveProfile } = useProfiles()
  const { proxies, delays, updateDelays } = useProxies()
  const { traffic } = useTraffic()
  const { connections } = useConnections()
  const { rules } = useRules()
  return <DashboardPage visible={visible} coreStatus={coreStatus} sessionStartedAt={sessionStartedAt} traffic={traffic}
    activeProfile={activeProfile} profiles={profiles} proxies={proxies} delays={delays} onSwitchProfile={switchActiveProfile}
    onUpdateDelays={updateDelays} settings={settings} connections={connections} sysProxy={sysProxy} busy={busy} rules={rules}
    onRestart={restartKernel} onToggleKernel={toggleKernel} onToggleSysProxy={toggleSysProxy}
    onToggleTun={() => { void saveSettings({ kernel: { ...settings.kernel, tun: { ...settings.kernel.tun, enable: !settings.kernel.tun.enable } } }).catch(() => {}) }}
    onUpdateMode={mode => { void saveSettings({ kernel: { ...settings.kernel, mode } }).catch(() => {}) }}
    onToggleOnlyVpn={() => { void saveSettings({ general: { ...settings.general, onlyVpnTraffic: settings.general.onlyVpnTraffic === false } }).catch(() => {}) }}
    onNavigate={setActiveTab} />
}

function ProxiesContent() {
  const { coreStatus } = useKernel()
  const { settings } = useSettings()
  const { proxies, delays, updateDelays, selectProxyNode } = useProxies()
  const { rules } = useRules()
  return <ProxiesPage running={coreStatus === 'running'} proxies={proxies} rules={rules} mode={settings.kernel.mode}
    delays={delays} onUpdateDelays={updateDelays} onSelectNode={selectProxyNode} testConcurrency={settings.general.delayTestConcurrency ?? 6} />
}

function ProfilesContent(props: ImportProps) {
  const { profiles, activeProfile, switchActiveProfile } = useProfiles()
  const refreshAll = useRefreshAll()
  return <ProfilesPage profiles={profiles} activeProfile={activeProfile} onSwitchProfile={switchActiveProfile}
    onRefreshAll={refreshAll} {...props} />
}

function ConnectionsContent() {
  const { connections } = useConnections()
  const refreshAll = useRefreshAll()
  return <ConnectionsPage connections={connections} onRefresh={refreshAll} />
}

function RulesContent() {
  const { rules } = useRules()
  const { coreStatus } = useKernel()
  const { busy } = useNavigation()
  const refreshAll = useRefreshAll()
  return <RulesPage rules={rules} running={coreStatus === 'running'} busy={busy} onRefresh={refreshAll} />
}

function LogsContent() {
  const { logs, clearLogs } = useLogs()
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
  return <Suspense fallback={placeholder}>{page}</Suspense>
}
