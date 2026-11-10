import { GlobalModeIcon, RulesIcon } from '../lib/icons'
import { PanelLeft } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import { memo, type ReactElement } from 'react'
import type { CoreState, TunnelMode } from '@shared/types'
import { sidebarNavigation, type NavTab } from '../lib/navigation'
import { useTranslations } from '../i18n'
import { getVpnStatus } from '@shared/vpn-status'
import { UpdateIndicator } from './UpdateIndicator'

interface SidebarProps {
  activeTab: NavTab
  onSelectTab: (tab: NavTab) => void
  coreStatus: CoreState
  open: boolean
  onToggle: () => void
  mode: TunnelMode
  captureEnabled: boolean
  busy: boolean
  onUpdateMode: (mode: TunnelMode) => void
}

function SidebarHint({ label, open, children }: { label: string; open: boolean; children: ReactElement }) {
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger>{!open && <Tooltip.Portal><Tooltip.Content side="right" sideOffset={12} className="sidebar-tooltip">{label}<Tooltip.Arrow className="fill-popover" /></Tooltip.Content></Tooltip.Portal>}</Tooltip.Root>
}

export const Sidebar = memo(function Sidebar({ activeTab, onSelectTab, coreStatus, open, onToggle, mode, busy, onUpdateMode }: SidebarProps) {
  const t = useTranslations('common')
  const vpnStatus = getVpnStatus(coreStatus)
  const vpnEnabled = vpnStatus === 'on'
  const statusKey = coreStatus === 'starting' ? 'vpnStarting' : coreStatus === 'error' ? 'vpnError' : vpnEnabled ? 'vpnOn' : 'vpnOff'
  return <Tooltip.Provider delayDuration={200}><aside id="app-sidebar" className="app-sidebar" data-state={open ? 'expanded' : 'collapsed'}>
    <div className="sidebar-header">
      <SidebarHint label={t(open ? 'collapse' : 'expand')} open={open}>
        <button
          type="button"
          className="sidebar-trigger sidebar-link w-full"
          onClick={onToggle}
          aria-label={t(open ? 'collapse' : 'expand')}
          aria-expanded={open}
          aria-controls="app-sidebar"
        >
          <PanelLeft className="size-4 shrink-0" />
          <span className="sidebar-label truncate">{t(open ? 'collapse' : 'expand')}</span>
        </button>
      </SidebarHint>
    </div>
    <nav aria-label={t('navigation')} className="sidebar-nav">
      {sidebarNavigation.map((group) => <div key={group.id} className={`sidebar-group ${group.id === 'application' ? 'mt-auto' : ''}`}>
        {group.id === 'application' && <UpdateIndicator />}
        <div className="flex flex-col gap-1">{group.items.map(({ id, icon: Icon }) => <SidebarHint key={id} label={t(id)} open={open}><button type="button" onClick={() => onSelectTab(id)} aria-label={t(id)} aria-current={activeTab === id ? 'page' : undefined} className={`sidebar-link w-full ${activeTab === id ? 'sidebar-link-active' : ''}`}>
          <Icon className="size-4 shrink-0" /><span className="sidebar-label truncate">{t(id)}</span>
        </button></SidebarHint>)}</div>
      </div>)}
    </nav>
    <div className="sidebar-footer">
      <SidebarHint label={t(statusKey)} open={open}><span role="status" className="sidebar-vpn-badge" data-state={vpnEnabled ? 'on' : coreStatus === 'starting' ? 'starting' : coreStatus === 'error' ? 'error' : 'off'} aria-label={t(statusKey)}>
        <span className="sidebar-vpn-dot-wrapper"><span className="sidebar-vpn-dot" /></span><span className="sidebar-label truncate">{t(statusKey)}</span>
      </span></SidebarHint>
      <div className="sidebar-routing" role="group" aria-label={t('routingMode')}>
        {([{ id: 'rule', label: 'rulesMode', icon: RulesIcon }, { id: 'global', label: 'globalMode', icon: GlobalModeIcon }] as const).map(({ id, label, icon: Icon }) => <SidebarHint key={id} label={t(label)} open={false}><button type="button" className="sidebar-mode" aria-label={t(label)} aria-pressed={mode === id} disabled={busy || coreStatus === 'starting'} onClick={() => onUpdateMode(id)}><Icon className="size-4 shrink-0" /></button></SidebarHint>)}
      </div>
    </div>
    <button type="button" className="sidebar-rail" onClick={onToggle} aria-label={t(open ? 'collapse' : 'expand')} tabIndex={-1} />
  </aside></Tooltip.Provider>
})
