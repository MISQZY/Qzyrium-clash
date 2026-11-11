import { redactUrl } from '@shared/logs'

export const sanitizeUrl = (rawUrl?: string): string => rawUrl ? redactUrl(rawUrl) : ''

export function isValidRemoteSubscriptionUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname.toLowerCase().trim()
    if (
      hostname === '169.254.169.254' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

