import { redactUrl } from '@shared/logs'
import { isIP } from 'node:net'

export const sanitizeUrl = (rawUrl?: string): string => rawUrl ? redactUrl(rawUrl) : ''

export const subscriptionHostname = (hostname: string): string =>
  hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '')

/** Preserve LAN subscriptions while excluding local services and metadata. */
export function isAllowedSubscriptionAddress(address: string): boolean {
  address = subscriptionHostname(address)
  const family = isIP(address)
  if (family === 4) {
    const octets = address.split('.').map(Number)
    return octets[0] !== 0 && octets[0] !== 127 && address !== '169.254.169.254'
  }
  if (family !== 6) return false
  const expanded = address.replace(/\d+\.\d+\.\d+\.\d+$/, value => {
    const octets = value.split('.').map(Number)
    return `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
  })
  const [left, right] = expanded.split('::')
  const start = left ? left.split(':') : []
  const end = right ? right.split(':') : []
  const words = (right !== undefined ? [...start, ...Array(8 - start.length - end.length).fill('0'), ...end] : start)
    .map(value => parseInt(value, 16))
  if (words.slice(0, 6).every(value => value === 0) && words[6] === 0 && words[7] <= 1) return false
  if (words.slice(0, 5).every(value => value === 0) && (words[5] === 0xffff || words[5] === 0)) {
    return isAllowedSubscriptionAddress(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`)
  }
  return true
}

export function isValidRemoteSubscriptionUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const hostname = subscriptionHostname(parsed.hostname)
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      return false
    }
    return !isIP(hostname) || isAllowedSubscriptionAddress(hostname)
  } catch {
    return false
  }
}

