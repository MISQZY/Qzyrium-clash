import fs from 'node:fs/promises'
import path from 'node:path'
import yaml from 'yaml'
import type { ProxyGroup, ProxyNode } from '@shared/mihomo'

type RecordValue = Record<string, unknown>
const record = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value)
const records = (value: unknown): RecordValue[] => Array.isArray(value) ? value.filter(record) : []
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const expression = (value: unknown): RegExp | undefined => typeof value === 'string'
  ? new RegExp(value.replace(/\(\?i\)/g, ''), value.includes('(?i)') ? 'i' : '') : undefined

/** Display metadata from the profile and downloaded providers; never starts Mihomo. */
export async function offlineProxies(config: RecordValue, root: string, selected: Record<string, string> = {}): Promise<Record<string, ProxyNode>> {
  const nodes = new Map<string, ProxyNode>()
  const addNode = (item: RecordValue) => {
    if (typeof item.name !== 'string' || typeof item.type !== 'string') return
    nodes.set(item.name, { name: item.name, type: item.type.toUpperCase(), udp: item.udp !== false, history: [] })
  }
  const inline = records(config.proxies)
  inline.forEach(addNode)
  const providers = new Map<string, string[]>()
  if (record(config['proxy-providers'])) for (const [name, provider] of Object.entries(config['proxy-providers'])) {
    if (!record(provider)) continue
    let payload = records(provider.payload)
    if (typeof provider.path === 'string') {
      const filename = path.resolve(root, provider.path)
      const relative = path.relative(root, filename)
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) try {
        const stat = await fs.stat(filename)
        if (stat.size <= 8_000_000) {
          const parsed: unknown = yaml.parse(await fs.readFile(filename, 'utf8'))
          if (record(parsed)) payload = [...payload, ...records(parsed.proxies)]
        }
      } catch { /* This provider has not been downloaded yet. */ }
    }
    const override = record(provider.override) ? provider.override : {}
    const prefix = typeof override['additional-prefix'] === 'string' ? override['additional-prefix'] : ''
    const suffix = typeof override['additional-suffix'] === 'string' ? override['additional-suffix'] : ''
    const names: string[] = []
    for (const item of payload) {
      if (typeof item.name !== 'string') continue
      const proxy = { ...item, name: prefix + item.name + suffix }
      addNode(proxy); names.push(proxy.name)
    }
    providers.set(name, names)
  }
  const realNames = [...nodes.keys()]
  for (const [name, type] of [['DIRECT', 'Direct'], ['REJECT', 'Reject'], ['REJECT-DROP', 'Reject'], ['PASS', 'Pass'], ['COMPATIBLE', 'Compatible']]) nodes.set(name, { name, type, udp: true, history: [] })
  const groups = records(config['proxy-groups']).filter(group => typeof group.name === 'string')
  const groupNames = groups.map(group => group.name as string)
  const available = new Set([...nodes.keys(), ...groupNames])
  for (const group of groups) {
    const name = group.name as string
    const types: Record<string, string> = { select: 'Selector', 'url-test': 'URLTest', fallback: 'Fallback', 'load-balance': 'LoadBalance', relay: 'Relay' }
    const candidates: string[] = []
    const use = group['include-all'] || group['include-all-providers'] ? [...providers.keys()] : strings(group.use)
    for (const provider of use) candidates.push(...providers.get(provider) ?? [])
    if (group['include-all'] || group['include-all-proxies']) candidates.push(...strings(inline.map(proxy => proxy.name)))
    const include = expression(group.filter)
    const exclude = expression(group['exclude-filter'])
    const excludeTypes = typeof group['exclude-type'] === 'string' ? group['exclude-type'].toLowerCase().split('|') : []
    const filtered = candidates.filter(candidate => (!include || include.test(candidate)) && !exclude?.test(candidate) && !excludeTypes.includes(nodes.get(candidate)?.type.toLowerCase() ?? ''))
    const all = [...new Set([...strings(group.proxies), ...filtered])].filter(candidate => candidate !== name && available.has(candidate))
    const item: ProxyGroup = { name, type: types[String(group.type)] ?? String(group.type ?? 'Selector'), udp: true, history: [], all, now: all.includes(selected[name]) ? selected[name] : all[0] ?? '', hidden: group.hidden === true, icon: typeof group.icon === 'string' ? group.icon : undefined }
    nodes.set(name, item)
  }
  if (!nodes.has('GLOBAL')) {
    const all = [...groupNames, ...realNames, 'DIRECT']
    nodes.set('GLOBAL', { name: 'GLOBAL', type: 'Selector', udp: true, history: [], all, now: all.includes(selected.GLOBAL) ? selected.GLOBAL : all[0] ?? 'DIRECT' } as ProxyGroup)
  }
  return Object.fromEntries(nodes)
}
