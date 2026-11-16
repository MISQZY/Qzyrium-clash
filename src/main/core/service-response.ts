import { matchesServiceHttpStatus, REGIONAL_SERVICE_PRESETS, type ServiceCheckTarget, type ServiceCheckResult } from '@shared/service-check'

export interface ServiceResponse { status: number; url: string; body: string }
export type ServiceRequest = (url: string, followRedirects?: boolean) => Promise<ServiceResponse>

function challenged(response: ServiceResponse): boolean {
  return /cf-chl-|challenge-platform|verify you are human|just a moment|g-recaptcha|unusual traffic/i.test(response.body) || response.status === 429
}

function regionFromBody(body: string): string | undefined {
  return /"(?:countryCode|country_code)"\s*:\s*"([A-Z]{2})"/i.exec(body)?.[1].toUpperCase()
}

export function classifyServiceResponse(target: ServiceCheckTarget, response: ServiceResponse): ServiceCheckResult {
  const result: ServiceCheckResult = { id: target.id, status: 'unknown', httpStatus: response.status }
  const body = response.body.toLowerCase()
  if (target.kind === 'regional') {
    result.region = regionFromBody(response.body)
    if ((target.preset === 'youtube-premium' && body.includes('youtube premium is not available in your country')) ||
      (target.preset === 'chatgpt' && /unsupported_country|country_not_supported/.test(body)) ||
      (target.preset === 'notebooklm' && new URL(response.url).searchParams.get('location') === 'unsupported')) {
      return { ...result, status: 'blocked' }
    }
  }
  if (challenged(response)) return { ...result, status: 'challenged' }
  if (target.kind === 'regional') {
    if (target.preset === 'notebooklm') {
      const final = new URL(response.url)
      if (response.status >= 200 && response.status < 400 && final.hostname === 'accounts.google.com' && final.pathname.toLowerCase().includes('signin')) {
        return { ...result, status: 'available' }
      }
    }
    if (target.preset === 'youtube-premium' && response.status === 200 && body.includes('ad-free') && body.includes('youtube premium')) {
      return { ...result, status: 'available' }
    }
    if (target.preset === 'chatgpt' && response.status === 200) {
      try {
        const json = JSON.parse(response.body)
        if (json && typeof json === 'object' && !Array.isArray(json) && typeof json.cookie_consent_required === 'boolean') return { ...result, status: 'available' }
      } catch { /* A login page or HTML challenge is not evidence of access. */ }
    }
    if (target.preset === 'netflix' && response.status === 200) {
      const final = new URL(response.url)
      const match = /^\/(?:(?<region>[a-z]{2})(?:-[a-z]{2})?\/)?title\/(\d+)/i.exec(final.pathname)
      if (final.hostname === 'www.netflix.com' && match && /og:video|"@type"\s*:\s*"(?:TVSeries|Movie)"|"titleId"\s*:/i.test(response.body)) {
        return { ...result, status: 'available', region: match.groups?.region?.toUpperCase() ?? 'US' }
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
  const url = target.kind === 'regional' ? REGIONAL_SERVICE_PRESETS[target.preset!].url : target.url
  const response = await request(url, target.kind !== undefined && target.kind !== 'http')
  let result = classifyServiceResponse(target, response)
  if (target.kind === 'regional' && target.preset === 'netflix' && response.status === 404) {
    const original = await request('https://www.netflix.com/title/80197526', true)
    result = classifyServiceResponse(target, original)
    if (result.status === 'available') result.status = 'restricted'
    else if (original.status === 404) result.status = 'blocked'
  }
  return { ...result, delay: Math.max(1, Math.round(performance.now() - start)) }
}
