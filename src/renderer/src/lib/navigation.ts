import { HomeIcon, ProxiesIcon, ProfilesIcon, ConnectionsIcon, RulesIcon, LogsIcon, SystemProxyIcon, TunIcon, DnsIcon, SnifferIcon, ResourcesIcon, CoreIcon, SettingsIcon } from './icons'

export const navigation = [
  { id: 'workspace', items: [
    { id: 'dashboard', icon: HomeIcon },
    { id: 'proxies', icon: ProxiesIcon },
    { id: 'profiles', icon: ProfilesIcon },
    { id: 'connections', icon: ConnectionsIcon },
    { id: 'rules', icon: RulesIcon },
    { id: 'logs', icon: LogsIcon }
  ] },
  { id: 'network', items: [
    { id: 'sysproxy', icon: SystemProxyIcon },
    { id: 'tun', icon: TunIcon },
    { id: 'dns', icon: DnsIcon },
    { id: 'sniffer', icon: SnifferIcon },
    { id: 'resources', icon: ResourcesIcon }
  ] },
  { id: 'application', items: [
    { id: 'mihomo', icon: CoreIcon },
    { id: 'settings', icon: SettingsIcon }
  ] }
] as const

export const sidebarNavigation = [
  {
    id: 'workspace',
    items: [
      { id: 'dashboard', icon: HomeIcon },
      { id: 'proxies', icon: ProxiesIcon },
      { id: 'profiles', icon: ProfilesIcon },
      { id: 'connections', icon: ConnectionsIcon },
      { id: 'rules', icon: RulesIcon },
      { id: 'logs', icon: LogsIcon }
    ]
  },
  {
    id: 'application',
    items: [
      { id: 'settings', icon: SettingsIcon }
    ]
  }
] as const

export type NavTab = typeof navigation[number]['items'][number]['id']
export type NavGroup = typeof navigation[number]['id']
export const getNavigationGroup = (id: NavTab) => navigation.find((group) => group.items.some((item) => item.id === id))!
export const getNavigationItem = (id: NavTab) => navigation.flatMap((group) => [...group.items]).find((item) => item.id === id)!
