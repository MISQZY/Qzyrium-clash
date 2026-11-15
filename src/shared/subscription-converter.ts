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

export function decodeBase64Safe(input: string): string | null {
  const cleaned = input.trim().replace(/\s+/g, '')
  if (cleaned.length < 4) return null
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
      const serverPortPart = decoded.slice(atIndex + 1)

      const colonIndex = userInfoPart.indexOf(':')
      if (colonIndex === -1) return null
      cipher = userInfoPart.slice(0, colonIndex)
      password = userInfoPart.slice(colonIndex + 1)

      const lastColon = serverPortPart.lastIndexOf(':')
      if (lastColon === -1) return null
      server = cleanServerHost(serverPortPart.slice(0, lastColon))
      port = Number(serverPortPart.slice(lastColon + 1))
    }

    if (!server || !port || isNaN(port) || port < 1 || port > 65535 || !cipher || !password) {
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
    if (!server || !port || isNaN(port) || !uuid) return null

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
    const url = new URL(uri)
    const server = cleanServerHost(url.hostname)
    const port = Number(url.port)
    const uuid = url.username
    if (!server || !port || isNaN(port) || !uuid) return null

    const name = safeDecodeURIComponent(url.hash.replace(/^#/, '')).trim() || `${server}:${port}`
    const params = url.searchParams
    const security = params.get('security')?.toLowerCase() || 'none'
    const network = params.get('type')?.toLowerCase() || 'tcp'
    const flow = params.get('flow')
    const sni = params.get('sni') || params.get('host')
    const fp = params.get('fp')
    const pbk = params.get('pbk')
    const sid = params.get('sid')
    const path = params.get('path') || '/'
    const host = params.get('host')
    const serviceName = params.get('serviceName')

    const node: ProxyNodeConfig = {
      name,
      type: 'vless',
      server,
      port,
      uuid,
      udp: true,
      network
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

    if (network === 'ws') {
      node['ws-opts'] = {
        path,
        ...(host ? { headers: { Host: host } } : {})
      }
    } else if (network === 'grpc') {
      node['grpc-opts'] = {
        'grpc-service-name': serviceName || path || ''
      }
    }

    return node
  } catch {
    return null
  }
}

export function parseTrojanUri(uri: string): ProxyNodeConfig | null {
  try {
    const url = new URL(uri)
    const server = cleanServerHost(url.hostname)
    const port = Number(url.port || 443)
    const password = safeDecodeURIComponent(url.username)
    if (!server || !port || isNaN(port) || !password) return null

    const name = safeDecodeURIComponent(url.hash.replace(/^#/, '')).trim() || `${server}:${port}`
    const params = url.searchParams
    const sni = params.get('sni') || params.get('peer')
    const alpn = params.get('alpn')
    const network = params.get('type')?.toLowerCase() || 'tcp'
    const fp = params.get('fp')
    const path = params.get('path') || '/'
    const host = params.get('host')
    const serviceName = params.get('serviceName')

    const node: ProxyNodeConfig = {
      name,
      type: 'trojan',
      server,
      port,
      password,
      udp: true,
      network
    }

    if (sni) node.sni = sni
    if (alpn) node.alpn = alpn.split(',').map((s) => s.trim())
    if (fp) node['client-fingerprint'] = fp

    if (network === 'ws') {
      node['ws-opts'] = {
        path,
        ...(host ? { headers: { Host: host } } : {})
      }
    } else if (network === 'grpc') {
      node['grpc-opts'] = {
        'grpc-service-name': serviceName || path || ''
      }
    }

    return node
  } catch {
    return null
  }
}

export function parseHysteria2Uri(uri: string): ProxyNodeConfig | null {
  try {
    const url = new URL(uri.replace(/^hy2:\/\//i, 'hysteria2://'))
    const server = cleanServerHost(url.hostname)
    const port = Number(url.port || 443)
    const password = safeDecodeURIComponent(url.password ? `${url.username}:${url.password}` : url.username)
    if (!server || !port || isNaN(port) || !password) return null

    const name = safeDecodeURIComponent(url.hash.replace(/^#/, '')).trim() || `${server}:${port}`
    const params = url.searchParams
    const sni = params.get('sni')
    const obfs = params.get('obfs')
    const obfsPassword = params.get('obfs-password')
    const insecure = params.get('insecure') === '1'

    const node: ProxyNodeConfig = {
      name,
      type: 'hysteria2',
      server,
      port,
      password,
      udp: true
    }

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
    const url = new URL(uri)
    const server = cleanServerHost(url.hostname)
    const port = Number(url.port || 443)
    const uuid = url.username
    const password = url.password ? safeDecodeURIComponent(url.password) : undefined
    if (!server || !port || isNaN(port) || !uuid) return null

    const name = safeDecodeURIComponent(url.hash.replace(/^#/, '')).trim() || `${server}:${port}`
    const params = url.searchParams
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
    const port = Number(url.port)
    if (!server || !port || isNaN(port)) return null

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

export function parseProxyUri(rawLine: string): ProxyNodeConfig | null {
  const line = rawLine.trim()
  if (!line || line.startsWith('#')) return null

  if (/^ss:\/\//i.test(line)) return parseShadowsocksUri(line)
  if (/^vmess:\/\//i.test(line)) return parseVmessUri(line)
  if (/^vless:\/\//i.test(line)) return parseVlessUri(line)
  if (/^trojan:\/\//i.test(line)) return parseTrojanUri(line)
  if (/^(?:hysteria2|hy2):\/\//i.test(line)) return parseHysteria2Uri(line)
  if (/^tuic:\/\//i.test(line)) return parseTuicUri(line)
  if (/^(?:socks5|socks|http):\/\//i.test(line)) return parseSocksHttpUri(line)

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

export function deduplicateProxyNames(nodes: ProxyNodeConfig[]): void {
  const names = nodes.map(node => typeof node.name === 'string' && node.name.trim()
    ? node.name.trim() : `${node.server}:${node.port}`)
  // Preserve original names even when they match a suffix generated for an earlier duplicate.
  const occupied = new Set(names)
  const seen = new Set<string>()
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
