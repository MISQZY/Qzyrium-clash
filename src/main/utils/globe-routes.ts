import { isIP } from 'node:net'
import type { ConnectionsSnapshot, ProxyNode } from '@shared/mihomo'

const builtins = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE'])
export function serverHost(address: string): string | undefined {
  if (isIP(address)) return address
  if (address.startsWith('[')) {
    const close = address.indexOf(']')
    return close > 1 ? address.slice(1, close) : undefined
  }
  const host = address.replace(/:\d+$/, '')
  return host && !host.includes(':') ? host : undefined
}

export function globeCandidates(snapshot: ConnectionsSnapshot, proxies: Record<string, ProxyNode>, config: Record<string, unknown>, hosts: Map<string, string>, mode: string): Map<string, string[]> {
  const result = new Map<string, string[]>()
  if (mode === 'direct') return result
  const groups = Array.isArray(config['proxy-groups']) ? config['proxy-groups'] as { name?: string; proxies?: string[]; filter?: string }[] : []
  const proxyList = Array.isArray(config.proxies) ? config.proxies as { name?: string; server?: string }[] : []

  const resolveGroupProxy = (group: { name?: string; proxies?: string[]; filter?: string }): string | undefined => {
    if (Array.isArray(group.proxies) && group.proxies.length > 0) {
      const first = group.proxies.find((p) => typeof p === 'string' && !builtins.has(p))
      if (first) return first
    }
    if (group.filter && typeof group.filter === 'string') {
      try {
        const clean = group.filter.replace(/^\(\?[imsuxU]+\)/i, '')
        const re = new RegExp(clean, 'i')
        const match = proxyList.find((p) => p?.name && re.test(p.name))
        if (match?.name) return match.name
      } catch {
        // invalid regex in group filter ignored
      }
    }
    const fallback = proxyList.find((p) => p?.name && !builtins.has(p.name))
    return fallback?.name
  }

  const leaf = (name: string, visited = new Set<string>()): string | undefined => {
    if (!name || builtins.has(name) || visited.has(name) || visited.size > 20) return
    visited.add(name)
    const proxy = proxies[name]
    if (proxy?.now) return leaf(proxy.now, visited)
    if (proxy && ('all' in proxy || ['Direct', 'Reject', 'RejectDrop', 'Pass'].includes(proxy.type))) return
    const group = groups.find((g) => g.name === name)
    if (group) {
      const next = resolveGroupProxy(group)
      if (next && next !== name) return leaf(next, visited)
      return
    }
    return name
  }
  const add = (node: string, remote?: string) => {
    const candidates = result.get(node) ?? []
    for (const address of [hosts.get(node), remote]) {
      const host = address && serverHost(address)
      if (host && !candidates.includes(host)) candidates.push(host)
    }
    result.set(node, candidates)
  }
  for (const connection of snapshot.connections) {
    // Explicit leaf entries take precedence over parent selectors in chains.
    const node = connection.chains.find((name) => !proxies[name]?.now && !(proxies[name] && 'all' in proxies[name]) && leaf(name))
    if (node) add(node, connection.metadata.remoteDestination)
  }
  // Display a selected tunnel even when the browser has no open sockets yet.
  let selected: string | undefined
  if (mode === 'global') {
    selected = proxies.GLOBAL?.now && leaf(proxies.GLOBAL.now)
  } else {
    // 1. Check MATCH/FINAL rule target
    if (Array.isArray(config.rules)) {
      const match = config.rules.find((rule) => typeof rule === 'string' && /^(MATCH|FINAL),/i.test(rule))
      if (typeof match === 'string') {
        const target = match.split(',')[1]?.trim()
        selected = target && leaf(target)
      }
    }
    // 2. If MATCH goes DIRECT (e.g. "Other services -> DIRECT"), inspect active rules using a VPN/proxy
    if (!selected && Array.isArray(config.rules)) {
      for (const rule of config.rules) {
        if (typeof rule !== 'string') continue
        const parts = rule.split(',').map((s) => s.trim())
        const target = parts[parts.length - 1] === 'no-resolve' ? parts[parts.length - 2] : parts[parts.length - 1]
        if (target && !builtins.has(target)) {
          const resolved = leaf(target)
          if (resolved) {
            selected = resolved
            break
          }
        }
      }
    }
    // 3. Fall back to active proxy groups (e.g. VPN selector)
    if (!selected) {
      for (const group of groups) {
        if (group.name && !builtins.has(group.name)) {
          const resolved = leaf(group.name)
          if (resolved) {
            selected = resolved
            break
          }
        }
      }
    }
    // 4. Fall back to first non-builtin proxy in profile
    if (!selected) {
      const first = proxyList.find((p) => p?.name && !builtins.has(p.name))
      if (first?.name) selected = leaf(first.name)
    }
  }
  if (selected) add(selected)
  return new Map([...result].slice(0, 12))
}
