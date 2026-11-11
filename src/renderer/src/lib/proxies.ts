import type { ProxyGroup, ProxyNode, MihomoRule } from '@shared/mihomo'
import type { TunnelMode } from '@shared/types'

export type ProxySortMode = 'default' | 'latency' | 'name'

export function visibleProxyGroups(proxies: Record<string, ProxyNode>, rules: MihomoRule[] | undefined, mode: TunnelMode): string[] {

    const list: string[] = []
    const visited = new Set<string>()

    const isEligibleGroup = (name: string): boolean => {
      const item = proxies[name] as unknown as ProxyGroup | undefined
      if (!item || !Array.isArray(item.all)) return false
      if (item.hidden) return false
      if (name === 'GLOBAL' && mode !== 'global') return false
      const rawType = (item.type || '').toLowerCase()
      if (rawType === 'direct' || rawType === 'reject' || rawType === 'compatible' || rawType === 'pass') {
        return false
      }
      return true
    }

    const addGroup = (name: string) => {
      if (!name || visited.has(name)) return
      visited.add(name)
      if (!isEligibleGroup(name)) return
      list.push(name)

      // Traverse sub-groups contained inside this group's .all
      const group = proxies[name] as unknown as ProxyGroup
      for (const childName of group.all || []) {
        if (proxies[childName] && Array.isArray((proxies[childName] as unknown as ProxyGroup).all)) {
          addGroup(childName)
        }
      }
    }

    if (mode === 'global') {
      if (proxies['GLOBAL'] && isEligibleGroup('GLOBAL')) {
        addGroup('GLOBAL')
      }
      for (const name of Object.keys(proxies)) {
        addGroup(name)
      }
    } else if (rules && rules.length > 0) {
      for (const rule of rules) {
        addGroup(rule.proxy)
      }
    }

    // Fallback if rules gave no groups (or rules empty / loading)
    if (list.length === 0) {
      for (const name of Object.keys(proxies)) {
        addGroup(name)
      }
    }

    // GLOBAL.all follows the provider's configured group order. Rule traversal
    // determines visibility only; neither rule order nor nested selectors should
    // rearrange the cards. Keep API order for groups missing from GLOBAL.
    const configuredOrder = [...new Set([
      ...((proxies.GLOBAL as ProxyGroup | undefined)?.all ?? []),
      ...Object.keys(proxies)
    ])]
    const order = new Map(configuredOrder.map((name, index) => [name, index]))
    if (mode === 'global') order.set('GLOBAL', -1)
    return list.sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity))

}

export function sortProxyNodes(nodes: string[], sortMode: ProxySortMode, proxies: Record<string, ProxyNode>, delays: Record<string, number>): string[] {
      if (sortMode === 'default') return nodes
      const copy = [...nodes]

      if (sortMode === 'name') {
        return copy.sort((a, b) => a.localeCompare(b))
      }

      if (sortMode === 'latency') {
        return copy.sort((a, b) => {
          const nodeDataA = proxies[a]
          const nodeDataB = proxies[b]
          const da = delays[a] ?? nodeDataA?.history?.[nodeDataA.history.length - 1]?.delay
          const db = delays[b] ?? nodeDataB?.history?.[nodeDataB.history.length - 1]?.delay

          const getWeight = (d?: number) => {
            if (d === undefined) return 999998 // Untested comes before failed
            if (d <= 0) return 999999 // Timeout / error comes last
            return d
          }

          const wa = getWeight(da)
          const wb = getWeight(db)
          if (wa !== wb) return wa - wb
          return a.localeCompare(b)
        })
      }

      return nodes
}
