import { createElement, type Context, type ReactNode } from 'react'
import type { DomainStores } from './useWorkspaceStore'
import * as contexts from './store-contexts'

function bind<T>(context: Context<T | null>, value: T) {
  return (children: ReactNode) => createElement(context.Provider, { value }, children)
}

/** Keep provider identity and nesting stable while each domain owns its value. */
export function provideDomainStores(stores: DomainStores, children: ReactNode): ReactNode {
  const providers = [
    bind(contexts.RefreshContext, stores.refreshAll),
    bind(contexts.NavigationContext, stores.navigation),
    bind(contexts.KernelContext, stores.kernel),
    bind(contexts.TrafficContext, stores.traffic),
    bind(contexts.ProfilesContext, stores.profiles),
    bind(contexts.SettingsContext, stores.settings),
    bind(contexts.ProxiesContext, stores.proxies),
    bind(contexts.RulesContext, stores.rules),
    bind(contexts.ConnectionsContext, stores.connections),
    bind(contexts.LogsContext, stores.logs),
  ]
  return providers.reduceRight<ReactNode>((tree, provide) => provide(tree), children)
}
