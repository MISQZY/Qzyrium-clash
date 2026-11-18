import { matchesServiceHttpStatus, REGIONAL_SERVICE_PRESETS, type ServiceCheckTarget, type ServiceCheckResult, type ProxyIpInfo } from '@shared/service-check'

export interface ServiceResponse { status: number; url: string; body: string }
export type ServiceRequest = (url: string, followRedirects?: boolean) => Promise<ServiceResponse>

const DATACENTER_KEYWORDS = [
  'datacenter', 'data center', 'hosting', 'cloud', 'server', 'vps', 'dedicated',
  'digitalocean', 'hetzner', 'ovh', 'linode', 'vultr', 'aws', 'amazon', 'google cloud',
  'azure', 'microsoft', 'oracle', 'leaseweb', 'm247', 'datacamp', 'choopa', 'constant company',
  'packet', 'equinix', 'cogent', 'fastly', 'cloudflare', 'akamai'
]

const RESIDENTIAL_KEYWORDS = [
  'telecom', 'broadband', 'cable', 'wireless', 'mobile', 'fiber', 'residential',
  'comcast', 'verizon', 'at&t', 'spectrum', 'charter', 'vodafone', 'orange', 'telefonica',
  'deutsche telekom', 'bt', 'virgin media', 'rostelecom', 'mts', 'megafon', 'beeline', 'er-telecom',
  'kcell', 'turkcell', 'turk telekom'
]

function detectIpType(isp?: string, org?: string, hosting?: boolean): 'residential' | 'datacenter' {
  if (hosting === true) return 'datacenter'
  if (hosting === false) return 'residential'
  const text = `${isp || ''} ${org || ''}`.toLowerCase()
  if (RESIDENTIAL_KEYWORDS.some(kw => text.includes(kw))) return 'residential'
  if (DATACENTER_KEYWORDS.some(kw => text.includes(kw))) return 'datacenter'
  return 'datacenter'
}

export async function fetchIpIntelligence(request: ServiceRequest): Promise<ProxyIpInfo | null> {
  // Strategy 1: https://api.ip.sb/geoip
  try {
    const res = await request('https://api.ip.sb/geoip')
    if (res.status === 200) {
      const data = JSON.parse(res.body)
      if (data && typeof data.ip === 'string') {
        const asnStr = data.asn !== undefined ? String(data.asn).replace(/^AS/i, '') : undefined
        return {
          ip: data.ip,
          country: data.country || undefined,
          countryCode: data.country_code ? String(data.country_code).toUpperCase() : undefined,
          city: data.city || undefined,
          region: data.region || undefined,
          asn: asnStr ? `AS${asnStr}` : undefined,
          isp: data.isp || data.asn_organization || undefined,
          org: data.organization || data.asn_organization || undefined,
          type: detectIpType(data.isp, data.organization || data.asn_organization)
        }
      }
    }
  } catch { /* try fallback */ }

  // Strategy 2: https://ipwho.is/
  try {
    const res = await request('https://ipwho.is/')
    if (res.status === 200) {
      const data = JSON.parse(res.body)
      if (data && (data.ip || data.success)) {
        const conn = (data.connection && typeof data.connection === 'object') ? data.connection : {}
        const asnStr = conn.asn !== undefined ? String(conn.asn).replace(/^AS/i, '') : undefined
        const isDc = data.type === 'Datacenter' || (data.type !== 'Residential' && detectIpType(conn.isp, conn.org) === 'datacenter')
        return {
          ip: data.ip,
          country: data.country || undefined,
          countryCode: data.country_code ? String(data.country_code).toUpperCase() : undefined,
          city: data.city || undefined,
          region: data.region || undefined,
          asn: asnStr ? `AS${asnStr}` : undefined,
          isp: conn.isp || undefined,
          org: conn.org || undefined,
          type: isDc ? 'datacenter' : 'residential'
        }
      }
    }
  } catch { /* try fallback */ }

  return null
}

function challenged(response: ServiceResponse): boolean {
  return /cf-chl-|challenge-platform|verify you are human|just a moment|g-recaptcha|unusual traffic/i.test(response.body) || response.status === 429
}

function regionFromBody(body: string): string | undefined {
  return /"(?:countryCode|country_code)"\s*:\s*"([A-Z]{2})"/i.exec(body)?.[1].toUpperCase()
}

export function classifyServiceResponse(target: ServiceCheckTarget, response: ServiceResponse): ServiceCheckResult {
  const result: ServiceCheckResult = { id: target.id, status: 'unknown', httpStatus: response.status }
  const body = response.body.toLowerCase()
  const urlObj = (() => { try { return new URL(response.url) } catch { return null } })()

  if (target.kind === 'regional') {
    result.region = regionFromBody(response.body)
    if ((target.preset === 'youtube-premium' && body.includes('youtube premium is not available in your country')) ||
      (target.preset === 'chatgpt' && /unsupported_country|country_not_supported/.test(body)) ||
      (target.preset === 'notebooklm' && urlObj?.searchParams.get('location') === 'unsupported') ||
      (target.preset === 'gemini' && (urlObj?.searchParams.get('location') === 'unsupported' || body.includes('not currently supported in your country') || body.includes("isn't currently supported"))) ||
      (target.preset === 'claude' && (body.includes('app unavailable in your region') || body.includes('only available in supported countries'))) ||
      (target.preset === 'disney' && (body.includes('disney+ is not available in your region') || body.includes('service unavailable'))) ||
      (target.preset === 'tiktok' && body.includes('tiktok is not available in your region'))) {
      return { ...result, status: 'blocked' }
    }
  }
  if (challenged(response)) {
    if (target.preset === 'google-search' || target.id === 'google-search') {
      return { ...result, status: 'challenged', details: 'captcha' }
    }
    return { ...result, status: 'challenged' }
  }
  if (target.kind === 'regional') {
    if (target.preset === 'notebooklm') {
      if (response.status >= 200 && response.status < 400 && urlObj?.hostname === 'accounts.google.com' && urlObj?.pathname.toLowerCase().includes('signin')) {
        return { ...result, status: 'available' }
      }
    }
    if (target.preset === 'gemini') {
      if (response.status >= 200 && response.status < 400 && (urlObj?.hostname === 'accounts.google.com' || urlObj?.hostname?.includes('gemini.google.com'))) {
        return { ...result, status: 'available' }
      }
    }
    if (target.preset === 'claude') {
      if (response.status >= 200 && response.status < 400 && !body.includes('app unavailable')) {
        return { ...result, status: 'available' }
      }
    }
    if (target.preset === 'google-search') {
      if (response.status === 200) {
        return { ...result, status: 'available', details: 'clean' }
      }
    }
    if (target.preset === 'tiktok' && response.status === 200) {
      return { ...result, status: 'available' }
    }
    if (target.preset === 'spotify' && response.status >= 200 && response.status < 400) {
      return { ...result, status: 'available' }
    }
    if (target.preset === 'disney' && response.status >= 200 && response.status < 400) {
      return { ...result, status: 'available' }
    }
    if (target.preset === 'youtube-premium' && response.status === 200 && body.includes('ad-free') && body.includes('youtube premium')) {
      return { ...result, status: 'available' }
    }
    if (target.preset === 'chatgpt' && response.status === 200) {
      try {
        const json = JSON.parse(response.body)
        if (json && typeof json === 'object' && !Array.isArray(json) && typeof json.cookie_consent_required === 'boolean') {
          return { ...result, status: 'available', details: 'web_api' }
        }
      } catch { /* A login page or HTML challenge is not evidence of access. */ }
    }
    if (target.preset === 'netflix' && response.status === 200) {
      const match = /^\/(?:(?<region>[a-z]{2})(?:-[a-z]{2})?\/)?title\/(\d+)/i.exec(urlObj?.pathname ?? '')
      if (urlObj?.hostname === 'www.netflix.com' && match && /og:video|"@type"\s*:\s*"(?:TVSeries|Movie)"|"titleId"\s*:/i.test(response.body)) {
        return { ...result, status: 'available', details: 'full', region: match.groups?.region?.toUpperCase() ?? 'US' }
      }
    }
    return result
  }
  const expectedStatus = matchesServiceHttpStatus(target.expected, response.status)
  if (target.kind !== 'content') return { ...result, status: expectedStatus ? 'available' : 'rejected' }
  const inconclusive: ServiceCheckResult = { ...result, status: expectedStatus ? 'unknown' : 'rejected' }
  const matcher = target.content!
  let value: unknown = response.body
  if (matcher.source === 'json') {
    try {
      value = JSON.parse(response.body)
      for (const key of matcher.path!.split('.')) {
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return inconclusive
        value = (value as Record<string, unknown>)[key]
      }
      if (!['string', 'number', 'boolean'].includes(typeof value)) return inconclusive
    } catch { return inconclusive }
  }
  const text = String(value).toLowerCase()
  const matches = (expected: string) => matcher.source === 'json' ? text === expected.toLowerCase() : text.includes(expected.toLowerCase())
  if (matcher.blocked?.trim() && matches(matcher.blocked)) return { ...result, status: 'blocked' }
  if (!expectedStatus) return inconclusive
  return { ...result, status: matches(matcher.available) ? 'available' : 'unknown' }
}

export async function checkServiceResponse(target: ServiceCheckTarget, request: ServiceRequest): Promise<ServiceCheckResult> {
  const start = performance.now()
  const url = target.kind === 'regional' && target.preset && REGIONAL_SERVICE_PRESETS[target.preset]
    ? REGIONAL_SERVICE_PRESETS[target.preset].url
    : target.url
  const response = await request(url, target.kind !== undefined && target.kind !== 'http')
  let result = classifyServiceResponse(target, response)
  if (target.kind === 'regional' && target.preset === 'netflix') {
    if (result.status === 'available') {
      result.details = 'full'
    } else if (response.status === 404) {
      const original = await request('https://www.netflix.com/title/80197526', true)
      result = classifyServiceResponse(target, original)
      if (result.status === 'available') {
        result.status = 'restricted'
        result.details = 'originals'
      } else if (original.status === 404) {
        result.status = 'blocked'
      }
    }
  }
  return { ...result, delay: Math.max(1, Math.round(performance.now() - start)) }
}
