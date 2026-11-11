export function sanitizeUrl(rawUrl?: string): string {
  if (!rawUrl) return ''
  try {
    const u = new URL(rawUrl)
    for (const key of ['token', 'secret', 'password', 'key', 'auth']) {
      if (u.searchParams.has(key)) u.searchParams.set(key, '[REDACTED]')
    }
    return u.toString()
  } catch {
    return '[REDACTED_URL]'
  }
}

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

