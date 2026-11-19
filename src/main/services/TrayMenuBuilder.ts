import type { MenuItemConstructorOptions } from 'electron'
import type { AppConfig } from '@shared/app-config'
import type { SysProxyStatus } from '@shared/ipc'
import { createProxyGroupComparator, isProxyGroup, type ProxyNode } from '@shared/mihomo'
import type { ProfileItem } from '@shared/profile'
import type { CoreState, TunnelMode } from '@shared/types'

export interface TrayMenuActions {
  onOpen: () => void
  onToggleCore: () => Promise<void> | void
  onSelectProfile: (id: string) => Promise<void> | void
  onSetRoutingType: (type: 'off' | 'sysproxy' | 'tun') => Promise<void> | void
  onSetRoutingMode: (mode: TunnelMode) => Promise<void> | void
  onSelectProxy: (group: string, node: string) => Promise<void> | void
  onToggleCoreOnly: () => void
  onRestart: () => Promise<void> | void
  onQuit: () => void
}

export interface TrayMenuContext {
  coreStatus: CoreState
  sysProxyStatus: SysProxyStatus
  settings: AppConfig
  messages: Record<string, string>
  cachedProxies: Record<string, ProxyNode>
  profiles: ProfileItem[]
  activeProfileId?: string
  isCoreOnly: boolean
  actions: TrayMenuActions
}

function truncateLabel(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
}

function createRadioOptions<T extends string>(
  options: { label: string; value: T }[],
  selectedValue: T | undefined,
  onSelect: (value: T) => void
): MenuItemConstructorOptions[] {
  return options.map(option => ({
    label: option.label,
    type: 'radio',
    checked: option.value === selectedValue,
    click: () => onSelect(option.value)
  }))
}

export function buildProfileMenu(
  profiles: ProfileItem[],
  activeId: string | undefined,
  messages: Record<string, string>,
  onSelectProfile: (id: string) => void
): MenuItemConstructorOptions | null {
  if (!profiles || profiles.length === 0) return null

  const activeName = profiles.find((p) => p.id === activeId)?.name || ''

  return {
    label: `${messages.profiles || 'Profiles'} (${activeName || '—'})`,
    submenu: createRadioOptions(
      profiles.map((p) => ({
        label: truncateLabel(p.name, 40),
        value: p.id
      })),
      activeId,
      onSelectProfile
    )
  }
}

export function buildModeMenu(
  currentMode: TunnelMode,
  messages: Record<string, string>,
  onSetRoutingMode: (mode: TunnelMode) => void
): MenuItemConstructorOptions {
  const modes: { value: TunnelMode; label: string }[] = [
    { value: 'rule', label: messages.modeRule || 'Rule' },
    { value: 'global', label: messages.modeGlobal || 'Global' },
    { value: 'direct', label: messages.modeDirect || 'Direct' }
  ]
  const currentName = modes.find(m => m.value === currentMode)?.label || messages.modeRule || 'Rule'

  return {
    label: `${messages.routingMode || 'Routing mode'} (${currentName})`,
    submenu: createRadioOptions(modes, currentMode, onSetRoutingMode)
  }
}

export function buildRoutingTypeMenu(
  settings: AppConfig,
  sysProxyStatus: SysProxyStatus,
  messages: Record<string, string>,
  onSetRoutingType: (type: 'off' | 'sysproxy' | 'tun') => void
): MenuItemConstructorOptions {
  const tunEnabled = Boolean(settings.kernel?.tun?.enable)
  const sysProxyEnabled = Boolean(sysProxyStatus.enabled || settings.sysProxy?.enable)
  const currentRoutingType: 'off' | 'sysproxy' | 'tun' = tunEnabled
    ? 'tun'
    : sysProxyEnabled
      ? 'sysproxy'
      : 'off'

  const types: { value: 'off' | 'sysproxy' | 'tun'; label: string }[] = [
    { value: 'off', label: messages.routingTypeDisabled || 'Disabled' },
    { value: 'sysproxy', label: messages.routingTypeProxy || messages.proxy || 'System proxy' },
    { value: 'tun', label: messages.routingTypeTun || 'TUN' }
  ]
  const currentName = types.find(t => t.value === currentRoutingType)?.label || messages.routingTypeDisabled || 'Disabled'

  return {
    label: `${messages.routingType || 'Routing type'} (${currentName})`,
    submenu: createRadioOptions(types, currentRoutingType, onSetRoutingType)
  }
}

export function buildProxyGroupMenus(
  cachedProxies: Record<string, ProxyNode>,
  currentMode: TunnelMode,
  isRunning: boolean,
  onSelectProxy: (group: string, node: string) => void
): MenuItemConstructorOptions[] {
  if (!isRunning) return []

  const eligibleGroupNames: string[] = []
  for (const [name, node] of Object.entries(cachedProxies)) {
    if (!isProxyGroup(node) || node.all.length === 0) continue
    if (node.hidden) continue
    const rawType = (node.type || '').toLowerCase()
    if (rawType !== 'selector' && rawType !== 'select') continue
    if (name === 'GLOBAL' && currentMode !== 'global') continue
    eligibleGroupNames.push(name)
  }

  if (eligibleGroupNames.length === 0 && cachedProxies['GLOBAL']) {
    const g = cachedProxies['GLOBAL']
    if (isProxyGroup(g)) {
      const rawType = (g.type || '').toLowerCase()
      if ((rawType === 'selector' || rawType === 'select') && g.all.length > 0) {
        eligibleGroupNames.push('GLOBAL')
      }
    }
  }

  if (eligibleGroupNames.length === 0) return []

  eligibleGroupNames.sort(createProxyGroupComparator(cachedProxies, currentMode))

  return eligibleGroupNames.map((groupName) => {
    const group = cachedProxies[groupName]
    const groupAll = isProxyGroup(group) ? group.all : []
    const groupNow = isProxyGroup(group) ? group.now : ''
    const activeNode = groupNow ? truncateLabel(groupNow, 30) : ''
    const groupLabel = activeNode ? `${groupName}: ${activeNode}` : groupName

    const nodeItems = createRadioOptions(
      groupAll.map((nodeName: string) => ({
        label: truncateLabel(nodeName, 50),
        value: nodeName
      })),
      groupNow,
      (selectedNode) => onSelectProxy(groupName, selectedNode)
    )

    return {
      label: groupLabel,
      submenu: nodeItems
    }
  })
}

export function buildTrayContextMenu(context: TrayMenuContext): MenuItemConstructorOptions[] {
  const {
    coreStatus,
    sysProxyStatus,
    settings,
    messages,
    cachedProxies,
    profiles,
    activeProfileId,
    isCoreOnly,
    actions
  } = context

  const currentMode: TunnelMode = (settings.kernel?.mode as TunnelMode) || 'rule'
  const isRunning = coreStatus === 'running'
  const proxyGroupMenus = buildProxyGroupMenus(
    cachedProxies,
    currentMode,
    isRunning,
    actions.onSelectProxy
  )
  const profileMenu = buildProfileMenu(
    profiles,
    activeProfileId,
    messages,
    actions.onSelectProfile
  )

  const template: MenuItemConstructorOptions[] = [
    {
      label: messages.open,
      click: actions.onOpen
    },
    {
      label: coreStatus === 'running' ? messages.disconnect : messages.connect,
      click: () => void actions.onToggleCore()
    }
  ]

  if (profileMenu) {
    template.push({ type: 'separator' })
    template.push(profileMenu)
  }

  template.push({ type: 'separator' })
  template.push(
    buildRoutingTypeMenu(settings, sysProxyStatus, messages, actions.onSetRoutingType)
  )

  template.push({ type: 'separator' })
  template.push(buildModeMenu(currentMode, messages, actions.onSetRoutingMode))

  if (proxyGroupMenus.length > 0) {
    template.push({ type: 'separator' })
    template.push(...proxyGroupMenus)
  }

  template.push({ type: 'separator' })
  template.push(
    {
      label: messages.coreOnlyMode,
      type: 'checkbox',
      checked: isCoreOnly,
      click: actions.onToggleCoreOnly
    },
    {
      label: messages.restart,
      click: () => void actions.onRestart()
    }
  )

  template.push({ type: 'separator' })
  template.push({
    label: messages.quit,
    click: actions.onQuit
  })

  return template
}
