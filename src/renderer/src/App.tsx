import React from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { useAppStore } from './stores/useAppStore'
import { DashboardPage } from './pages/DashboardPage'
import { ProxiesPage } from './pages/ProxiesPage'
import { ProfilesPage } from './pages/ProfilesPage'
import { ConnectionsPage } from './pages/ConnectionsPage'
import { LogsPage } from './pages/LogsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AppConfig } from '@shared/app-config'
import { TunnelMode } from '@shared/types'

export const App: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    coreStatus,
    traffic,
    sysProxy,
    profiles,
    activeProfile,
    settings,
    logs,
    proxies,
    connections,
    refreshAll,
    toggleSysProxy,
    restartKernel,
    selectProxyNode,
    switchActiveProfile,
    clearLogs,
    setSettings
  } = useAppStore()

  const handleUpdateMode = async (mode: TunnelMode) => {
    if (!window.api) return
    const updated = await window.api.settings.update({
      kernel: { ...settings.kernel, mode }
    })
    setSettings(updated)
    await window.api.mihomo.patchConfigs({ mode })
  }

  const handleSaveSettings = async (patch: Partial<AppConfig>) => {
    if (!window.api) return
    const updated = await window.api.settings.update(patch)
    setSettings(updated)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground select-none">
      {/* TitleBar with native Windows overlay integration */}
      <TitleBar coreStatus={coreStatus} traffic={traffic} />

      {/* Main Workspace Frame */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          sysProxy={sysProxy}
          onToggleSysProxy={toggleSysProxy}
        />

        {/* Viewport Content */}
        <main className="flex-1 min-h-0 h-full overflow-hidden flex flex-col bg-background">
          {activeTab === 'dashboard' && (
            <DashboardPage
              coreStatus={coreStatus}
              traffic={traffic}
              activeProfile={activeProfile}
              settings={settings}
              connections={connections}
              onRestart={restartKernel}
              onUpdateMode={handleUpdateMode}
            />
          )}

          {activeTab === 'proxies' && (
            <ProxiesPage proxies={proxies} onSelectNode={selectProxyNode} />
          )}

          {activeTab === 'profiles' && (
            <ProfilesPage
              profiles={profiles}
              activeProfile={activeProfile}
              onSwitchProfile={switchActiveProfile}
              onRefreshAll={refreshAll}
            />
          )}

          {activeTab === 'connections' && (
            <ConnectionsPage connections={connections} onRefresh={refreshAll} />
          )}

          {activeTab === 'logs' && <LogsPage logs={logs} onClear={clearLogs} />}

          {activeTab === 'settings' && (
            <SettingsPage settings={settings} onSaveSettings={handleSaveSettings} />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
