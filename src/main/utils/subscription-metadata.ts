import type { ProfileUserInfo } from '@shared/profile'
import { subscriptionName } from './subscription-name'

function parseUserInfo(header?: unknown): ProfileUserInfo | undefined {
  if (!header || typeof header !== 'string') return undefined
  const info: ProfileUserInfo = {}
  const pairs = header.split(';')
  for (const pair of pairs) {
    const [k, v] = pair.trim().split('=')
    if (!k || !v) continue
    const key = k.toLowerCase().trim()
    const num = Number(v.trim())
    if (!isNaN(num)) {
      if (key === 'upload') info.upload = num
      else if (key === 'download') info.download = num
      else if (key === 'total') info.total = num
      else if (key === 'expire') info.expire = num
    }
  }
  return Object.keys(info).length > 0 ? info : undefined
}

function getHeader(headers: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!headers) return undefined
  const target = key.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) {
      if (typeof v === 'string') return v
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
    }
  }
  return undefined
}

function parseProfileLogo(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:') return trimmed
  } catch {
    // Invalid URL
  }
  return undefined
}

function parseSupportUrl(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:') return trimmed
  } catch {
    // Invalid URL
  }
  return undefined
}

function parseAnnounce(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  let text = raw.trim()
  if (!text) return undefined

  if (/^base64:/i.test(text)) {
    const encoded = text.slice(7).trim()
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8')
      if (decoded && !decoded.includes('\ufffd')) return decoded.trim()
    } catch {
      // fallback
    }
  }

  if (text.includes('%')) {
    try {
      text = decodeURIComponent(text)
    } catch {
      // keep original
    }
  }

  if (/^[A-Za-z0-9+/=]+$/.test(text) && text.length > 8 && text.length % 4 === 0) {
    try {
      const decoded = Buffer.from(text, 'base64').toString('utf-8')
      // eslint-disable-next-line no-control-regex -- Reject binary data while retaining tabs and line breaks.
      if (/[\p{L}\p{N}]/u.test(decoded) && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(decoded)) {
        text = decoded
      }
    } catch {
      // keep original
    }
  }
  return text.trim() || undefined
}

export function parseSubscriptionMetadata(headers: Parameters<typeof subscriptionName>[0], content: string) {
  return {
    providerName: subscriptionName(headers, content),
    userInfo: parseUserInfo(getHeader(headers, 'subscription-userinfo')),
    profileLogo: parseProfileLogo(getHeader(headers, 'profile-logo')),
    announce: parseAnnounce(getHeader(headers, 'announce') || getHeader(headers, 'profile-announce')),
    supportUrl: parseSupportUrl(getHeader(headers, 'support-url'))
  }
}
