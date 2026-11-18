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

export interface GlobeCandidateMap extends Map<string, string[]> {
  chains?: string[][]
}

export function globeCandidates(
  snapshot: ConnectionsSnapshot,
  proxies: Record<string, ProxyNode>,
  config: Record<string, unknown>,
  hosts: Map<string, string>,
  mode: string,
  dialers?: Map<string, string>
): GlobeCandidateMap {
  const result = new Map<string, string[]>()
  if (mode === 'direct') {
    const empty = result as GlobeCandidateMap
    empty.chains = []
    return empty
  }
  const groups = Array.isArray(config['proxy-groups']) ? config['proxy-groups'] as { name?: string; proxies?: string[]; filter?: string; type?: string }[] : []
  const proxyList = Array.isArray(config.proxies) ? config.proxies as { name?: string; server?: string; type?: string; 'dialer-proxy'?: string }[] : []
  // DNS outbounds handle queries internally; they are not geographic VPN exits.
  const dnsOutbounds = new Set([
    ...Object.entries(proxies).filter(([, proxy]) => proxy.type?.toLowerCase() === 'dns').map(([name]) => name),
    ...proxyList.filter((proxy) => proxy.type?.toLowerCase() === 'dns').map((proxy) => proxy.name)
  ])
  const isTunnel = (name: string) => !builtins.has(name) && !dnsOutbounds.has(name)

  const dialerMap = new Map<string, string>(dialers ?? [])
  for (const p of proxyList) {
    if (p && typeof p.name === 'string' && typeof p['dialer-proxy'] === 'string' && p['dialer-proxy']) {
      dialerMap.set(p.name, p['dialer-proxy'])
    }
  }

  const resolveDialerChain = (name: string): string[] => {
    const chain: string[] = [name]
    const seen = new Set<string>([name])
    let current = name
    while (dialerMap.has(current) && seen.size < 10) {
      const upstream = dialerMap.get(current)!
      if (!upstream || seen.has(upstream) || !isTunnel(upstream)) break
      seen.add(upstream)
      chain.unshift(upstream)
      current = upstream
    }
    return chain
  }

  const isLeafNode = (name: string): boolean => {
    if (!name || !isTunnel(name)) return false
    if (proxies[name]?.now) return false
    if (proxies[name] && 'all' in proxies[name]) return false
    if (['Direct', 'Reject', 'RejectDrop', 'Pass'].includes(proxies[name]?.type || '')) return false
    if (groups.some((g) => g.name === name)) return false
    return true
  }

  const resolveGroupProxy = (group: { name?: string; proxies?: string[]; filter?: string }): string | undefined => {
    if (Array.isArray(group.proxies) && group.proxies.length > 0) {
      const first = group.proxies.find((p) => typeof p === 'string' && isTunnel(p))
      if (first) return first
    }
    if (group.filter && typeof group.filter === 'string') {
      try {
        const clean = group.filter.replace(/^\(\?[imsuxU]+\)/i, '')
        const re = new RegExp(clean, 'i')
        const match = proxyList.find((p) => p?.name && isTunnel(p.name) && re.test(p.name))
        if (match?.name) return match.name
      } catch {
        // invalid regex in group filter ignored
      }
    }
    const fallback = proxyList.find((p) => p?.name && isTunnel(p.name))
    return fallback?.name
  }

  const leaf = (name: string, visited = new Set<string>()): string | undefined => {
    if (!name || !isTunnel(name) || visited.has(name) || visited.size > 20) return
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

  const detectedChains: string[][] = []
  const seenChainKeys = new Set<string>()

  for (const connection of snapshot.connections) {
    const reversed = [...connection.chains].reverse()
    const leafNodes = reversed.filter((name) => isLeafNode(name))

    if (leafNodes.length >= 2) {
      const chainKey = leafNodes.join('>')
      if (!seenChainKeys.has(chainKey)) {
        seenChainKeys.add(chainKey)
        detectedChains.push(leafNodes)
      }
      add(leafNodes[0], connection.metadata.remoteDestination)
      for (let i = 1; i < leafNodes.length; i++) {
        add(leafNodes[i])
      }
    } else if (leafNodes.length === 1) {
      const singleLeaf = leafNodes[0]
      const dialerChain = resolveDialerChain(singleLeaf)
      if (dialerChain.length >= 2) {
        const chainKey = dialerChain.join('>')
        if (!seenChainKeys.has(chainKey)) {
          seenChainKeys.add(chainKey)
          detectedChains.push(dialerChain)
        }
        add(dialerChain[0], connection.metadata.remoteDestination)
        for (let i = 1; i < dialerChain.length; i++) {
          add(dialerChain[i])
        }
      } else {
        add(singleLeaf, connection.metadata.remoteDestination)
      }
    }
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
      const first = proxyList.find((p) => p?.name && isTunnel(p.name))
      if (first?.name) selected = leaf(first.name)
    }
  }

  if (selected) {
    const groupObj = groups.find((g) => g.name === selected)
    if (groupObj && groupObj.type?.toLowerCase() === 'relay' && Array.isArray(groupObj.proxies) && groupObj.proxies.length >= 2) {
      const relayHops: string[] = []
      for (const p of groupObj.proxies) {
        const h = leaf(p)
        if (h && !relayHops.includes(h)) relayHops.push(h)
      }
      if (relayHops.length >= 2) {
        const chainKey = relayHops.join('>')
        if (!seenChainKeys.has(chainKey)) {
          seenChainKeys.add(chainKey)
          detectedChains.push(relayHops)
        }
        for (const h of relayHops) add(h)
      } else if (relayHops[0]) {
        add(relayHops[0])
      }
    } else {
      const dialerChain = resolveDialerChain(selected)
      if (dialerChain.length >= 2) {
        const chainKey = dialerChain.join('>')
        if (!seenChainKeys.has(chainKey)) {
          seenChainKeys.add(chainKey)
          detectedChains.push(dialerChain)
        }
        for (const h of dialerChain) add(h)
      } else {
        add(selected)
      }
    }
  }

  const candidateResult = new Map([...result].slice(0, 16)) as GlobeCandidateMap
  candidateResult.chains = detectedChains
  return candidateResult
}
