import { GlobalModeIcon, RulesIcon } from '../lib/icons'
import { PanelLeft } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import { memo, useState, type ReactElement } from 'react'
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
  tunEnabled?: boolean
}

function SidebarHint({ label, open, children }: { label: string; open: boolean; children: ReactElement }) {
  const [isOpen, setIsOpen] = useState(false)
  if (open) return children
  return (
    <Tooltip.Root open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip.Trigger asChild onClick={() => setIsOpen(false)}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={12} className="sidebar-tooltip">
          {label}
          <Tooltip.Arrow className="fill-popover" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export const Sidebar = memo(function Sidebar({ activeTab, onSelectTab, coreStatus, open, onToggle, mode, busy, onUpdateMode, tunEnabled }: SidebarProps) {
  const t = useTranslations('common')
  const vpnStatus = getVpnStatus(coreStatus)
  const vpnEnabled = vpnStatus === 'on'
  const connectionMode = tunEnabled ? 'tun' : 'sysproxy'
  const statusText = coreStatus === 'starting'
    ? t('vpnStarting')
    : coreStatus === 'error'
      ? t('vpnError')
      : vpnEnabled
        ? (tunEnabled ? t('tunMode') : t('systemProxy'))
        : t('disconnected')
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
    <nav data-tour="navigation" aria-label={t('navigation')} className="sidebar-nav">
      {sidebarNavigation.map((group) => <div key={group.id} className={`sidebar-group ${group.id === 'application' ? 'mt-auto' : ''}`}>
        {group.id === 'application' && <UpdateIndicator />}
        <div className="flex flex-col gap-1">{group.items.map(({ id, icon: Icon }) => <SidebarHint key={id} label={t(id)} open={open}><button type="button" onClick={() => onSelectTab(id)} aria-label={t(id)} aria-current={activeTab === id ? 'page' : undefined} className={`sidebar-link w-full ${activeTab === id ? 'sidebar-link-active' : ''}`}>
          <Icon className="size-4 shrink-0" /><span className="sidebar-label truncate">{t(id)}</span>
        </button></SidebarHint>)}</div>
      </div>)}
    </nav>
    <div className="sidebar-footer">
      <SidebarHint label={statusText} open={open}><span role="status" className="sidebar-vpn-badge" data-state={vpnEnabled ? 'on' : coreStatus === 'starting' ? 'starting' : coreStatus === 'error' ? 'error' : 'off'} data-mode={connectionMode} aria-label={statusText}>
        <span className="sidebar-vpn-dot-wrapper"><span className="sidebar-vpn-dot" /></span><span className="sidebar-label sidebar-vpn-label">{statusText}</span>
      </span></SidebarHint>
      <div data-tour="routing" className="sidebar-routing" role="group" aria-label={t('routingMode')}>
        {([{ id: 'rule', label: 'rulesMode', icon: RulesIcon }, { id: 'global', label: 'globalMode', icon: GlobalModeIcon }] as const).map(({ id, label, icon: Icon }) => <SidebarHint key={id} label={t(label)} open={false}><button type="button" className="sidebar-mode" aria-label={t(label)} aria-pressed={mode === id} disabled={busy || coreStatus === 'starting'} onClick={() => onUpdateMode(id)}><Icon className="size-4 shrink-0" /></button></SidebarHint>)}
      </div>
    </div>
    <button type="button" className="sidebar-rail" onClick={onToggle} aria-label={t(open ? 'collapse' : 'expand')} tabIndex={-1} />
  </aside></Tooltip.Provider>
})
