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
    <aside className="w-56 h-[calc(100vh-2.5rem)] flex flex-col justify-between p-3 bg-slate-900/60 border-r border-slate-800/80 backdrop-blur select-none">
      {/* Navigation Links */}
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Quick System Proxy Toggle Footer */}
      <div className="pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs">
          <div className="flex items-center gap-2">
            <Globe className={`w-3.5 h-3.5 ${sysProxy.enabled ? 'text-indigo-400' : 'text-slate-500'}`} />
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-slate-300">System Proxy</span>
              <span className="text-[9px] text-slate-500 font-mono">Port {sysProxy.port}</span>
            </div>
          </div>
          <button
            onClick={onToggleSysProxy}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none ${
              sysProxy.enabled ? 'bg-indigo-600' : 'bg-slate-800'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                sysProxy.enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </aside>
  )
}
