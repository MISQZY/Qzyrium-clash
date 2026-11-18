export const REGIONAL_SERVICE_PRESETS = {
  'youtube-premium': { name: 'YouTube Premium', url: 'https://www.youtube.com/premium', expected: '200' },
  netflix: { name: 'Netflix', url: 'https://www.netflix.com/title/70143836', expected: '200' },
  chatgpt: { name: 'ChatGPT', url: 'https://api.openai.com/compliance/cookie_requirements', expected: '200' },
  notebooklm: { name: 'NotebookLM', url: 'https://notebooklm.google.com/', expected: '200-399' },
  gemini: { name: 'Google Gemini', url: 'https://gemini.google.com/', expected: '200-399' },
  claude: { name: 'Claude', url: 'https://claude.ai/login', expected: '200-399' },
  'google-search': { name: 'Google Search', url: 'https://www.google.com/search?q=google', expected: '200' },
  tiktok: { name: 'TikTok', url: 'https://www.tiktok.com/', expected: '200-399' },
  spotify: { name: 'Spotify', url: 'https://open.spotify.com/', expected: '200-399' },
  disney: { name: 'Disney+', url: 'https://www.disneyplus.com/', expected: '200-399' }
} as const
export type RegionalService = keyof typeof REGIONAL_SERVICE_PRESETS

export interface ServiceCheckTarget {
  id: string
  name: string
  url: string
  expected: string
  kind?: 'http' | 'content' | 'regional'
  preset?: RegionalService
  content?: { source: 'text' | 'json'; path?: string; available: string; blocked?: string }
}

export const REMNAWAVE_GEOCHECK_TARGETS: ServiceCheckTarget[] = [
  { id: 'netflix', name: 'Netflix', url: 'https://www.netflix.com/title/70143836', expected: '200', kind: 'regional', preset: 'netflix' },
  { id: 'youtube-premium', name: 'YouTube Premium', url: 'https://www.youtube.com/premium', expected: '200', kind: 'regional', preset: 'youtube-premium' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://api.openai.com/compliance/cookie_requirements', expected: '200', kind: 'regional', preset: 'chatgpt' },
  { id: 'gemini', name: 'Google Gemini', url: 'https://gemini.google.com/', expected: '200-399', kind: 'regional', preset: 'gemini' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/login', expected: '200-399', kind: 'regional', preset: 'claude' },
  { id: 'google-search', name: 'Google Search', url: 'https://www.google.com/search?q=google', expected: '200', kind: 'regional', preset: 'google-search' },
  { id: 'tiktok', name: 'TikTok', url: 'https://www.tiktok.com/', expected: '200-399', kind: 'regional', preset: 'tiktok' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/', expected: '200-399', kind: 'regional', preset: 'spotify' },
  { id: 'disney', name: 'Disney+', url: 'https://www.disneyplus.com/', expected: '200-399', kind: 'regional', preset: 'disney' },
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/', expected: '200-399', kind: 'http' }
]

export const DEFAULT_SERVICE_CHECK_TARGETS: ServiceCheckTarget[] = [
  { id: 'cloudflare', name: 'Cloudflare', url: 'https://cp.cloudflare.com/generate_204', expected: '204' },
  { id: 'aws', name: 'AWS', url: 'https://aws.amazon.com/', expected: '200-399' },
  { id: 'discord', name: 'Discord', url: 'https://discord.com/api/v10/gateway', expected: '200' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', expected: '200-399' },
  { id: 'google', name: 'Google', url: 'https://www.gstatic.com/generate_204', expected: '204' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/', expected: '200' },
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/', expected: '200-399' }
]

/** Preserve saved endpoints when retiring the regional editor options. */
export function editableServiceCheckTargets(targets: ServiceCheckTarget[]): ServiceCheckTarget[] {
  return targets.map(target => {
    if (target.kind !== 'regional') return target
    const { preset: _preset, content: _content, ...rest } = target
    return { ...rest, kind: 'http' }
  })
}

export const MAX_SERVICE_CHECK_TARGETS = 32

export function validateServiceCheckTargets(value: unknown): asserts value is ServiceCheckTarget[] {
  if (!Array.isArray(value) || value.length > MAX_SERVICE_CHECK_TARGETS) throw new Error('Invalid service check list')
  const ids = new Set<string>()
  const urls = new Set<string>()
  for (const target of value) {
    if (!target || typeof target !== 'object' || typeof target.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(target.id) || ids.has(target.id)) throw new Error('Invalid or duplicate service id')
    if (typeof target.name !== 'string' || !target.name.trim() || target.name.length > 80) throw new Error('Service name must contain 1–80 characters')
    if (typeof target.url !== 'string' || target.url.length > 2048 || target.url !== target.url.trim()) throw new Error('Invalid service URL')
    const url = new URL(target.url)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) throw new Error('Service URL must use HTTPS without credentials or a fragment')
    if (urls.has(url.href)) throw new Error('Service URLs must be unique')
    if (target.kind !== undefined && !['http', 'content', 'regional'].includes(target.kind)) throw new Error('Invalid service check type')
    if (target.kind === 'regional' && (!Object.hasOwn(REGIONAL_SERVICE_PRESETS, target.preset ?? '') ||
      target.url !== REGIONAL_SERVICE_PRESETS[target.preset as RegionalService].url)) throw new Error('Invalid regional service preset')
    if (target.kind === 'content') {
      const content = target.content
      if (!content || !['text', 'json'].includes(content.source) || typeof content.available !== 'string' ||
        !content.available.trim() || content.available.length > 512 ||
        (content.blocked !== undefined && (typeof content.blocked !== 'string' || content.blocked.length > 512)) ||
        (content.source === 'json' && (typeof content.path !== 'string' || content.path.length > 256 ||
          !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(content.path) ||
          content.path.split('.').some((key: string) => ['__proto__', 'constructor', 'prototype'].includes(key))))) throw new Error('Invalid response matcher')
    }
    if (typeof target.expected !== 'string' || target.expected.length > 223 || target.expected.split('/').length > 28 || !/^[1-5]\d\d(?:-[1-5]\d\d)?(?:\/[1-5]\d\d(?:-[1-5]\d\d)?)*$/.test(target.expected) ||
      target.expected.split('/').some((part: string) => { const [min, max] = part.split('-').map(Number); return max !== undefined && max < min })) {
      throw new Error('Expected HTTP codes must use codes or ranges, for example 200/204 or 200-299')
    }
    ids.add(target.id)
    urls.add(url.href)
  }
}

export interface ProxyIpInfo {
  ip: string
  country?: string
  countryCode?: string
  city?: string
  region?: string
  asn?: string
  isp?: string
  org?: string
  type?: 'residential' | 'datacenter'
}

export interface ServiceCheckResult {
  id: string
  status: 'available' | 'rejected' | 'unreachable' | 'unknown' | 'blocked' | 'challenged' | 'restricted'
  delay?: number
  region?: string
  httpStatus?: number
  details?: string
  ipInfo?: ProxyIpInfo
}

export function matchesServiceHttpStatus(expected: string, status: number): boolean {
  return expected.split('/').some(part => {
    const [min, max = min] = part.split('-').map(Number)
    return status >= min && status <= max
  })
}

export function canCheckProxyServices(node?: { type: string; all?: unknown }): boolean {
  return !!node && !Array.isArray(node.all) &&
    !['direct', 'reject', 'reject-drop', 'rejectdrop', 'pass', 'compatible'].includes(node.type.toLowerCase())
}
