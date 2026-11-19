import yaml from 'yaml'

export interface ProxyNodeConfig extends Record<string, unknown> {
  name: string
  type: string
  server: string
  port: number
}

function safeDecodeURIComponent(val: string): string {
  try {
    return decodeURIComponent(val)
  } catch {
    return val
  }
}

function cleanServerHost(host: string): string {
  return host.replace(/^\[|\]$/g, '').trim()
}

function hasBinaryControlChars(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31)) {
      return true
    }
  }
  return false
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

export interface StandardUriContext {
  url: URL
  server: string
  port: number
  name: string
  params: URLSearchParams
}

export function parseStandardUriContext(uri: string, defaultPort = 443): StandardUriContext | null {
  try {
    const url = new URL(uri)
    const server = cleanServerHost(url.hostname)
    const port = Number(url.port || defaultPort)
    if (!server || !isValidPort(port)) return null
    const name = safeDecodeURIComponent(url.hash.replace(/^#/, '')).trim() || `${server}:${port}`
    return { url, server, port, name, params: url.searchParams }
  } catch {
    return null
  }
}

export function createTransportOptions(network: string, params: URLSearchParams): Record<string, unknown> {
  const path = params.get('path') || '/'
  const host = params.get('host')
  const serviceName = params.get('serviceName')

  const opts: Record<string, unknown> = {}
  if (network === 'ws') {
    opts['ws-opts'] = {
      path,
      ...(host ? { headers: { Host: host } } : {})
    }
  } else if (network === 'grpc') {
    opts['grpc-opts'] = {
      'grpc-service-name': serviceName ?? params.get('path') ?? ''
    }
  } else if (network === 'httpupgrade') {
    opts['httpupgrade-opts'] = {
      path,
      ...(host ? { headers: { Host: host } } : {})
    }
  } else if (network === 'xhttp' || network === 'splithttp') {
    const xhttpMode = params.get('mode') || params.get('xhttp-mode')
    opts['xhttp-opts'] = {
      path,
      ...(host ? { headers: { Host: host } } : {}),
      ...(xhttpMode ? { mode: xhttpMode } : {})
    }
  }
  return opts
}

export function decodeBase64Safe(input: string): string | null {
  const cleaned = input.trim().replace(/\s+/g, '')
  if (cleaned.length < 2 || cleaned.replace(/=+$/, '').length % 4 === 1) return null
  if (!/^[A-Za-z0-9+/_-]+={0,3}$/.test(cleaned)) return null

  try {
    const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    let decoded = ''
    if (typeof Buffer !== 'undefined') {
      decoded = Buffer.from(padded, 'base64').toString('utf8')
    } else if (typeof atob === 'function') {
      const binary = atob(padded)
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
      decoded = new TextDecoder('utf-8').decode(bytes)
    }
    if (!decoded || hasBinaryControlChars(decoded)) return null
    return decoded
  } catch {
    return null
  }
}

export function parseShadowsocksUri(uri: string): ProxyNodeConfig | null {
  try {
    const hashIndex = uri.indexOf('#')
    const rawFragment = hashIndex !== -1 ? uri.slice(hashIndex + 1) : ''
    const withoutFragment = hashIndex !== -1 ? uri.slice(0, hashIndex) : uri
    const name = safeDecodeURIComponent(rawFragment).trim()

    const body = withoutFragment.replace(/^ss:\/\//i, '')
    const [mainPart, queryString] = body.split('?')
    const queryParams = new URLSearchParams(queryString || '')

    let cipher = ''
    let password = ''
    let server = ''
    let port = 0

    if (mainPart.includes('@')) {
      const atIndex = mainPart.lastIndexOf('@')
      const userInfoPart = mainPart.slice(0, atIndex)
      const serverPortPart = mainPart.slice(atIndex + 1).replace(/\/$/, '')

      if (userInfoPart.includes(':')) {
        const colonIndex = userInfoPart.indexOf(':')
        cipher = safeDecodeURIComponent(userInfoPart.slice(0, colonIndex))
        password = safeDecodeURIComponent(userInfoPart.slice(colonIndex + 1))
      } else {
        const decodedUserInfo = decodeBase64Safe(userInfoPart)
        if (!decodedUserInfo || !decodedUserInfo.includes(':')) return null
        const colonIndex = decodedUserInfo.indexOf(':')
        cipher = decodedUserInfo.slice(0, colonIndex)
        password = decodedUserInfo.slice(colonIndex + 1)
      }

      const lastColon = serverPortPart.lastIndexOf(':')
      if (lastColon === -1) return null
      server = cleanServerHost(serverPortPart.slice(0, lastColon))
      port = Number(serverPortPart.slice(lastColon + 1))
    } else {
      const decoded = decodeBase64Safe(mainPart)
      if (!decoded || !decoded.includes('@')) return null
      const atIndex = decoded.lastIndexOf('@')
      const userInfoPart = decoded.slice(0, atIndex)
      const serverPortPart = decoded.slice(atIndex + 1).replace(/\/.*$/, '')

      const colonIndex = userInfoPart.indexOf(':')
      if (colonIndex === -1) return null
      cipher = userInfoPart.slice(0, colonIndex)
      password = userInfoPart.slice(colonIndex + 1)

      const lastColon = serverPortPart.lastIndexOf(':')
      if (lastColon === -1) return null
      server = cleanServerHost(serverPortPart.slice(0, lastColon))
      port = Number(serverPortPart.slice(lastColon + 1))
    }

    if (!server || !isValidPort(port) || !cipher || !password) {
      return null
    }

    const node: ProxyNodeConfig = {
      name: name || `${server}:${port}`,
      type: 'ss',
      server,
      port,
      cipher,
      password,
      udp: true
    }

    const plugin = queryParams.get('plugin')
    if (plugin) {
      const [pluginName, ...pluginOpts] = plugin.split(';')
      node.plugin = ['obfs-local', 'simple-obfs'].includes(pluginName) ? 'obfs' : pluginName
      const opts: Record<string, unknown> = {}
      for (const opt of pluginOpts) {
        const separator = opt.indexOf('=')
        const key = (separator === -1 ? opt : opt.slice(0, separator)).trim()
        // URLSearchParams has already decoded the plugin value; preserve '=' inside options.
        if (key) opts[key] = separator === -1 ? true : opt.slice(separator + 1)
      }
      if (node.plugin === 'obfs') {
        if (opts.obfs !== undefined) opts.mode = opts.obfs
        if (opts['obfs-host'] !== undefined) opts.host = opts['obfs-host']
        delete opts.obfs
        delete opts['obfs-host']
      }
      if (node.plugin === 'v2ray-plugin') opts.mode ??= 'websocket'
      if (Object.keys(opts).length) node['plugin-opts'] = opts
    }

    return node
  } catch {
    return null
  }
}

export function parseVmessUri(uri: string): ProxyNodeConfig | null {
  try {
    const raw = uri.replace(/^vmess:\/\//i, '').trim()
    const decoded = decodeBase64Safe(raw)
    if (!decoded) return null
    const json = JSON.parse(decoded) as Record<string, unknown>

    const server = cleanServerHost(String(json.add || json.address || ''))
    const port = Number(json.port)
    const uuid = String(json.id || '')
    if (!server || !isValidPort(port) || !uuid) return null

    const name = safeDecodeURIComponent(String(json.ps || '')).trim() || `${server}:${port}`
    const cipher = String(json.scy || json.cipher || 'auto')
    const alterId = Number(json.aid || 0)
    const network = String(json.net || 'tcp').toLowerCase()
    const isTls = json.tls === 'tls' || json.tls === true || json.tls === '1'
    const sni = json.sni ? String(json.sni) : (json.host ? String(json.host) : undefined)

    const node: ProxyNodeConfig = {
      name,
      type: 'vmess',
      server,
      port,
      uuid,
      alterId,
      cipher,
      udp: true,
      tls: isTls,
      network
    }

    if (sni) node.servername = sni
    if (json.alpn) {
      node.alpn = Array.isArray(json.alpn) ? json.alpn : String(json.alpn).split(',')
    }
    if (json.fp) node['client-fingerprint'] = String(json.fp)

    if (network === 'ws') {
      node['ws-opts'] = {
        path: String(json.path || '/'),
        ...(json.host ? { headers: { Host: String(json.host) } } : {})
      }
    } else if (network === 'grpc') {
      node['grpc-opts'] = {
        'grpc-service-name': String(json.path || json.serviceName || '')
      }
    } else if (network === 'h2') {
      node['h2-opts'] = {
        host: json.host ? String(json.host).split(',').map((s) => s.trim()) : undefined,
        path: String(json.path || '/')
      }
    } else if (network === 'http') {
      node['http-opts'] = {
        path: json.path ? [String(json.path)] : undefined,
        headers: json.host ? { Host: [String(json.host)] } : undefined
      }
    }

    return node
  } catch {
    return null
  }
}

export function parseVlessUri(uri: string): ProxyNodeConfig | null {
  try {
    const ctx = parseStandardUriContext(uri, 443)
    if (!ctx || !ctx.url.username) return null
    const { server, port, name, params } = ctx
    const uuid = ctx.url.username

    const security = params.get('security')?.toLowerCase() || 'none'
    const pbk = params.get('pbk')
    if (security === 'reality' && !pbk) return null
    const network = params.get('type')?.toLowerCase() || 'tcp'
    const flow = params.get('flow')
    const sni = params.get('sni') || params.get('host')
    const fp = params.get('fp')
    const sid = params.get('sid')

    const node: ProxyNodeConfig = {
      name,
      type: 'vless',
      server,
      port,
      uuid,
      udp: true,
      network,
      ...createTransportOptions(network, params)
    }

    if (flow) node.flow = flow

    if (security === 'tls' || security === 'reality') {
      node.tls = true
      if (sni) node.servername = sni
      if (fp) node['client-fingerprint'] = fp
      if (security === 'reality' && pbk) {
        node['reality-opts'] = {
          'public-key': pbk,
          ...(sid ? { 'short-id': sid } : {})
        }
      }
    }

    const packetEncoding = params.get('packetEncoding') || params.get('packet-encoding')
    if (packetEncoding) node['packet-encoding'] = packetEncoding
    const alpn = params.get('alpn')
    if (alpn) node.alpn = alpn.split(',').map((s) => s.trim())

    return node
  } catch {
    return null
  }
}

export function parseWireGuardUri(uri: string): ProxyNodeConfig | null {
  try {
    const url = new URL(uri)
    const server = cleanServerHost(url.hostname)
    const port = Number(url.port || 51820)
    const privateKey = safeDecodeURIComponent(url.username)
    if (!server || !port || isNaN(port) || !privateKey) return null

    const name = safeDecodeURIComponent(url.hash.replace(/^#/, '')).trim() || `WireGuard-${server}:${port}`
    const params = url.searchParams
    const publicKey = params.get('publickey') || params.get('public-key') || params.get('pk')
    const ip = params.get('ip') || params.get('address')
    const presharedKey = params.get('pre-shared-key') || params.get('presharedkey') || params.get('preshared-key') || params.get('psk')
    const mtu = params.get('mtu') ? Number(params.get('mtu')) : undefined
    const reserved = params.get('reserved')

    if (!publicKey || !ip) return null

    const node: ProxyNodeConfig = {
      name,
      type: 'wireguard',
      server,
      port,
      ip,
      'public-key': publicKey,
      'private-key': privateKey,
      udp: true
    }

    if (presharedKey) node['pre-shared-key'] = presharedKey
    if (mtu && !isNaN(mtu)) node.mtu = mtu
    if (reserved) {
      try {
        const parts = reserved.split(',').map((v) => parseInt(v.trim(), 10)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 255)
        if (parts.length > 0) node.reserved = parts
      } catch {}
    }

    return node
  } catch {
    return null
  }
}

export function parseHysteriaUri(uri: string): ProxyNodeConfig | null {
  try {
    const url = new URL(uri)
    const server = cleanServerHost(url.hostname)
    const port = Number(url.port || 443)
    if (!server || !port || isNaN(port)) return null

    const name = safeDecodeURIComponent(url.hash.replace(/^#/, '')).trim() || `Hysteria-${server}:${port}`
    const params = url.searchParams
    const auth = params.get('auth') || url.username || ''
    const peer = params.get('peer') || params.get('sni')
    const up = params.get('up') || params.get('upmbps')
    const down = params.get('down') || params.get('downmbps')
    const insecure = params.get('insecure') === '1'
    const alpn = params.get('alpn')
    const protocol = params.get('protocol') || 'udp'

    const node: ProxyNodeConfig = {
      name,
      type: 'hysteria',
      server,
      port,
      protocol,
      udp: true
    }

    if (auth) node['auth-str'] = auth
    if (up) node.up = up
    if (down) node.down = down
    if (peer) node.sni = peer
    if (insecure) node['skip-cert-verify'] = true
    if (alpn) node.alpn = alpn.split(',').map((s) => s.trim())

    return node
  } catch {
    return null
  }
}

export function parseSnellUri(uri: string): ProxyNodeConfig | null {
  try {
    const url = new URL(uri)
    const server = cleanServerHost(url.hostname)
    const port = Number(url.port)
    const psk = safeDecodeURIComponent(url.username)
    if (!server || !port || isNaN(port) || !psk) return null

    const name = safeDecodeURIComponent(url.hash.replace(/^#/, '')).trim() || `Snell-${server}:${port}`
    const params = url.searchParams
    const version = params.get('version') ? Number(params.get('version')) : 1
    const obfs = params.get('obfs')
    const obfsHost = params.get('obfs-host')

    const node: ProxyNodeConfig = {
      name,
      type: 'snell',
      server,
      port,
      psk,
      version: isNaN(version) ? 1 : version,
      udp: true
    }

    if (obfs) {
      node['obfs-opts'] = {
        mode: obfs,
        ...(obfsHost ? { host: obfsHost } : {})
      }
    }

    return node
  } catch {
    return null
  }
}

export function parseTrojanUri(uri: string): ProxyNodeConfig | null {
  try {
    const ctx = parseStandardUriContext(uri, 443)
    if (!ctx || !ctx.url.username) return null
    const { server, port, name, params } = ctx
    const password = safeDecodeURIComponent(ctx.url.username)
    if (!password) return null

    const sni = params.get('sni') || params.get('peer')
    const alpn = params.get('alpn')
    const network = params.get('type')?.toLowerCase() || 'tcp'
    const fp = params.get('fp')

    const node: ProxyNodeConfig = {
      name,
      type: 'trojan',
      server,
      port,
      password,
      udp: true,
      network,
      ...createTransportOptions(network, params)
    }

    if (sni) node.sni = sni
    if (alpn) node.alpn = alpn.split(',').map((s) => s.trim())
    if (fp) node['client-fingerprint'] = fp

    return node
  } catch {
    return null
  }
}

export function parseHysteria2Uri(uri: string): ProxyNodeConfig | null {
  try {
    let cleanUri = uri.replace(/^hy2:\/\//i, 'hysteria2://')
    let ports: string | undefined
    // Support port ranges or port hopping list in URI authority, e.g. host:20000-30000 or host:20000,20001
    // WHATWG URL constructor rejects non-integer ports.
    const portRangeMatch = /^(hysteria2:\/\/[^/?#]*?):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)(?=[/?#]|$)/i.exec(cleanUri)
    if (portRangeMatch && (portRangeMatch[2].includes('-') || portRangeMatch[2].includes(','))) {
      ports = portRangeMatch[2]
      const firstPort = parseInt(ports.split(/[,-]/)[0], 10) || 443
      cleanUri = `${portRangeMatch[1]}:${firstPort}${cleanUri.slice(portRangeMatch[0].length)}`
    }
    const url = new URL(cleanUri)
    const server = cleanServerHost(url.hostname)
    const port = Number(url.port || 443)
    const password = safeDecodeURIComponent(url.password ? `${url.username}:${url.password}` : url.username)
    if (!server || !isValidPort(port) || !password) return null

    const name = safeDecodeURIComponent(url.hash.replace(/^#/, '')).trim() || `${server}:${port}`
    const params = url.searchParams
    const sni = params.get('sni')
    const obfs = params.get('obfs')
    const obfsPassword = params.get('obfs-password')
    const insecure = params.get('insecure') === '1'
    const mport = params.get('mport') || params.get('ports')
    if (mport) ports = mport

    const node: ProxyNodeConfig = {
      name,
      type: 'hysteria2',
      server,
      port,
      password,
      udp: true
    }

    if (ports) node.ports = ports
    if (sni) node.sni = sni
    if (obfs) {
      node.obfs = obfs
      if (obfsPassword) node['obfs-password'] = obfsPassword
    }
    if (insecure) node['skip-cert-verify'] = true

    return node
  } catch {
    return null
  }
}

export function parseTuicUri(uri: string): ProxyNodeConfig | null {
  try {
    const ctx = parseStandardUriContext(uri, 443)
    if (!ctx || !ctx.url.username) return null
    const { server, port, name, params } = ctx
    const uuid = ctx.url.username
    const password = ctx.url.password ? safeDecodeURIComponent(ctx.url.password) : undefined

    const sni = params.get('sni')
    const congestion = params.get('congestion_control')
    const alpn = params.get('alpn')

    const node: ProxyNodeConfig = {
      name,
      type: 'tuic',
      server,
      port,
      uuid,
      udp: true,
      'ip-version': 'prefer-ipv4'
    }

    if (password) node.password = password
    if (sni) node.sni = sni
    if (congestion) node['congestion-controller'] = congestion
    if (alpn) node.alpn = alpn.split(',').map((s) => s.trim())

    return node
  } catch {
    return null
  }
}

export function parseSocksHttpUri(uri: string): ProxyNodeConfig | null {
  try {
    const url = new URL(uri)
    const server = cleanServerHost(url.hostname)
    const port = Number(url.port || (url.protocol.toLowerCase() === 'http:' ? 80 : 0))
    if (!server || !isValidPort(port)) return null

    const isHttp = url.protocol.toLowerCase().startsWith('http')
    const type = isHttp ? 'http' : 'socks5'
    const name = safeDecodeURIComponent(url.hash.replace(/^#/, '')).trim() || `${server}:${port}`

    const node: ProxyNodeConfig = {
      name,
      type,
      server,
      port
    }

    if (url.username) node.username = safeDecodeURIComponent(url.username)
    if (url.password) node.password = safeDecodeURIComponent(url.password)

    return node
  } catch {
    return null
  }
}

export function parseShadowsocksRUri(uri: string): ProxyNodeConfig | null {
  try {
    const raw = uri.replace(/^ssr:\/\//i, '').trim()
    const decoded = decodeBase64Safe(raw)
    if (!decoded) return null

    const questionIndex = decoded.indexOf('/?')
    const mainPart = questionIndex !== -1 ? decoded.slice(0, questionIndex) : decoded
    const queryPart = questionIndex !== -1 ? decoded.slice(questionIndex + 2) : ''

    const parts = mainPart.split(':')
    if (parts.length < 6) return null

    const server = cleanServerHost(parts[0])
    const port = Number(parts[1])
    const protocol = parts[2]
    const cipher = parts[3]
    const obfs = parts[4]
    const password = decodeBase64Safe(parts[5]) || parts[5]

    if (!server || !isValidPort(port) || !cipher || !password) return null

    const params = new URLSearchParams(queryPart)
    const rawRemarks = params.get('remarks')
    const name = (rawRemarks ? decodeBase64Safe(rawRemarks) : null) || `${server}:${port}`
    const protoParam = params.get('protoparam')
    const obfsParam = params.get('obfsparam')

    const node: ProxyNodeConfig = {
      name,
      type: 'ssr',
      server,
      port,
      cipher,
      password,
      protocol,
      obfs,
      udp: true
    }

    if (protoParam) node['protocol-param'] = decodeBase64Safe(protoParam) || protoParam
    if (obfsParam) node['obfs-param'] = decodeBase64Safe(obfsParam) || obfsParam

    return node
  } catch {
    return null
  }
}

type UriParser = (uri: string) => ProxyNodeConfig | null

const URI_PARSER_REGISTRY: ReadonlyArray<{ pattern: RegExp; parse: UriParser }> = [
  { pattern: /^ssr:\/\//i, parse: parseShadowsocksRUri },
  { pattern: /^ss:\/\//i, parse: parseShadowsocksUri },
  { pattern: /^vmess:\/\//i, parse: parseVmessUri },
  { pattern: /^vless:\/\//i, parse: parseVlessUri },
  { pattern: /^trojan:\/\//i, parse: parseTrojanUri },
  { pattern: /^(?:hysteria2|hy2):\/\//i, parse: parseHysteria2Uri },
  { pattern: /^hysteria:\/\//i, parse: parseHysteriaUri },
  { pattern: /^wireguard:\/\//i, parse: parseWireGuardUri },
  { pattern: /^snell:\/\//i, parse: parseSnellUri },
  { pattern: /^tuic:\/\//i, parse: parseTuicUri },
  { pattern: /^(?:socks5|socks|http):\/\//i, parse: parseSocksHttpUri }
]

export function parseProxyUri(rawLine: string): ProxyNodeConfig | null {
  const line = rawLine.trim()
  if (!line || line.startsWith('#')) return null

  for (const entry of URI_PARSER_REGISTRY) {
    if (entry.pattern.test(line)) {
      return entry.parse(line)
    }
  }

  return null
}

export function parseProxyList(text: string): ProxyNodeConfig[] {
  const lines = text.split(/\r?\n/)
  const proxies: ProxyNodeConfig[] = []

  for (const line of lines) {
    const parsed = parseProxyUri(line)
    if (parsed) {
      proxies.push(parsed)
    }
  }

  return proxies
}

function reserveUniqueName(base: string, occupied: Set<string>): string {
  let name = base
  for (let suffix = 1; occupied.has(name); suffix++) name = `${base} (${suffix})`
  occupied.add(name)
  return name
}

// Mihomo installs these policies and its synthetic GLOBAL selector in the proxy namespace.
const BUILTIN_PROXY_NAMES = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL'])

export function deduplicateProxyNames(nodes: ProxyNodeConfig[]): void {
  const names = nodes.map(node => typeof node.name === 'string' && node.name.trim()
    ? node.name.trim() : `${node.server}:${node.port}`)
  // Preserve original names even when they match a suffix generated for an earlier duplicate.
  const occupied = new Set([...BUILTIN_PROXY_NAMES, ...names])
  const seen = new Set(BUILTIN_PROXY_NAMES)
  for (const [index, node] of nodes.entries()) {
    const name = names[index]
    node.name = seen.has(name) ? reserveUniqueName(name, occupied) : name
    seen.add(name)
  }
}

export function convertSubscriptionToClashYaml(content: string): string {
  if (!content || typeof content !== 'string') return content

  const trimmed = content.trim()
  if (!trimmed) return content

  // 1. Check if content is already valid Clash/Mihomo YAML with proxy or rule definitions
  try {
    const parsed = yaml.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (['proxies', 'proxy-providers', 'proxy-groups', 'rules', 'rule-providers'].some((k) => k in parsed)) {
        return content
      }
    }
  } catch {
    // Continue to Base64 / URI checks
  }

  // 2. Try decoding as Base64
  let candidateText = trimmed
  const decoded = decodeBase64Safe(trimmed)
  if (decoded) {
    try {
      const parsedDecoded = yaml.parse(decoded)
      if (parsedDecoded && typeof parsedDecoded === 'object' && !Array.isArray(parsedDecoded)) {
        if (['proxies', 'proxy-providers', 'proxy-groups', 'rules', 'rule-providers'].some((k) => k in parsedDecoded)) {
          return decoded
        }
      }
    } catch {
      // Decoded payload is not YAML
    }
    candidateText = decoded
  }

  // 3. Try parsing proxy URIs from candidate text (either decoded Base64 or raw text)
  const proxies = parseProxyList(candidateText)
  if (proxies.length > 0) {
    deduplicateProxyNames(proxies)
    const proxyNames = proxies.map((p) => p.name)
    const occupied = new Set(proxyNames)
    const selectGroupName = reserveUniqueName('PROXY', occupied)
    const autoGroupName = reserveUniqueName('AUTO', occupied)
    const config = {
      proxies,
      'proxy-groups': [
        {
          name: selectGroupName,
          type: 'select',
          proxies: [autoGroupName, ...proxyNames]
        },
        {
          name: autoGroupName,
          type: 'url-test',
          url: 'https://www.gstatic.com/generate_204',
          interval: 300,
          tolerance: 50,
          proxies: [...proxyNames]
        }
      ],
      rules: [
        `MATCH,${selectGroupName}`
      ]
    }
    return yaml.stringify(config)
  }

  return content
}
