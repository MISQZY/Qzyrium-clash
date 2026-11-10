// The globe only needs names, server addresses and selector targets, never the
// credentials, certificates, DNS configuration or thousands of routing conditions.
export function globeProxies(value: unknown): { name: string; server: string }[] {
  if (!Array.isArray(value)) return []
  return value.filter((proxy) => proxy && typeof proxy.name === 'string' && typeof proxy.server === 'string')
    .map(({ name, server }) => ({ name, server }))
}

export function globeProfile(value: Record<string, unknown>): Record<string, unknown> {
  const targets = new Set<string>()
  if (Array.isArray(value.rules)) for (const rule of value.rules) {
    if (typeof rule !== 'string') continue
    const parts = rule.split(',').map((part) => part.trim())
    const target = parts.at(-1) === 'no-resolve' ? parts.at(-2) : parts.at(-1)
    if (target) targets.add(target)
  }
  const providers = value['proxy-providers']
  return {
    proxies: globeProxies(value.proxies),
    'proxy-groups': Array.isArray(value['proxy-groups']) ? value['proxy-groups'].filter((group) => group && typeof group === 'object').map(({ name, proxies, filter }) => ({ name, proxies, filter })) : [],
    rules: [...targets].map((target) => `MATCH,${target}`),
    'proxy-providers': providers && typeof providers === 'object' ? Object.fromEntries(Object.entries(providers).filter(([, provider]) => provider && typeof provider === 'object').map(([name, provider]) => [name, { path: provider.path, payload: globeProxies(provider.payload) }])) : {}
  }
}
