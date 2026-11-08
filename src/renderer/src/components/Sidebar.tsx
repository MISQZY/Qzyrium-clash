import React from 'react'
import {
  LayoutDashboard,
  Layers,
  FileText,
  Activity,
  Terminal,
  Sliders,
  Globe
} from 'lucide-react'
import { NavTab } from '../stores/useAppStore'
import { SysProxyStatus } from '@shared/ipc'
import { Switch } from './ui/switch'

interface SidebarProps {
  activeTab: NavTab
  onSelectTab: (tab: NavTab) => void
  sysProxy: SysProxyStatus
  onToggleSysProxy: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  sysProxy,
  onToggleSysProxy
}) => {
  const navItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'proxies' as NavTab, label: 'Proxies', icon: Layers },
    { id: 'profiles' as NavTab, label: 'Profiles', icon: FileText },
    { id: 'connections' as NavTab, label: 'Connections', icon: Activity },
    { id: 'logs' as NavTab, label: 'Core Logs', icon: Terminal },
    { id: 'settings' as NavTab, label: 'Settings', icon: Sliders }
  ]

  return (
    <aside className="w-56 shrink-0 h-full flex flex-col justify-between p-3 bg-sidebar border-r border-sidebar-border select-none">
      {/* Navigation List */}
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-foreground border border-sidebar-border shadow-xs'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60'
              }`}
            >
              <Icon
                className={`size-4 shrink-0 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* System Proxy Card in Sidebar Footer */}
      <div className="pt-3 border-t border-sidebar-border">
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-card/70 border border-border text-xs">
          <div className="flex items-center gap-2.5">
            <div
              className={`size-7 rounded-md flex items-center justify-center transition-colors ${
                sysProxy.enabled
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Globe className="size-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-foreground">System Proxy</span>
              <span className="text-[9px] text-muted-foreground font-mono">Port {sysProxy.port}</span>
            </div>
          </div>

          <Switch
            checked={sysProxy.enabled}
            onCheckedChange={onToggleSysProxy}
            aria-label="Toggle system proxy"
          />
        </div>
      </div>
    </aside>
  )
}
