/** Lightweight editor checks. Mihomo remains authoritative when rules are saved. */
const isUnsigned = (value: string, maximum: number): boolean =>
  /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= maximum

function isRangeList(value: string, maximum: number, wildcard = false): boolean {
  if (wildcard && value === '*') return true
  const ranges = value.split('/')
  if (ranges.length > 28 || !ranges.some((range) => range.trim())) return false
  return ranges.every((range) => {
    if (!range) return true
    const bounds = range.trim().split('-')
    return bounds.length <= 2 && bounds.every((bound) => isUnsigned(bound.trim().replace(/^\[|\]$/g, '').trim(), maximum))
  })
}

function isIPv4(value: string): boolean {
  const octets = value.split('.')
  return octets.length === 4 && octets.every((octet) =>
    /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)
}

function isCIDR(value: string): boolean {
  const parts = value.split('/')
  if (parts.length !== 2) return false
  const [address, prefix] = parts
  if (!address.includes(':')) return isIPv4(address) && isUnsigned(prefix, 32)
  if (!/^[\da-f:.]+$/i.test(address) || !isUnsigned(prefix, 128)) return false
  if (address.includes('.') && !isIPv4(address.slice(address.lastIndexOf(':') + 1))) return false
  try {
    // The URL parser handles compressed IPv6 and embedded IPv4 without a fragile IPv6 regex.
    new URL(`http://[${address}]/`)
    return true
  } catch {
    return false
  }
}

export function validateRulePayload(type: string, payload: string): boolean {
  type = type.toUpperCase()
  if (type === 'MATCH') return true
  const value = payload.trim()
  if (!value) return false
  switch (type) {
    case 'DOMAIN':
    case 'DOMAIN-SUFFIX':
      // Routing matches also include Unicode, numeric labels, local names and suffixes.
      return /^[^\s,/:]+$/u.test(value)
    case 'DOMAIN-KEYWORD':
      return !/[\s,]/u.test(value)
    case 'IP-CIDR':
    case 'IP-CIDR6':
    case 'SRC-IP-CIDR':
    case 'IP-SUFFIX':
    case 'SRC-IP-SUFFIX':
      return isCIDR(value)
    case 'SRC-PORT':
    case 'DST-PORT':
    case 'IN-PORT':
      return isRangeList(value, 65535)
    case 'IP-ASN':
    case 'SRC-IP-ASN':
      return isUnsigned(value, 4294967295)
    case 'UID':
      return isRangeList(value, 4294967295)
    case 'DSCP':
      return isRangeList(value, 63, true)
    case 'NETWORK':
      return ['tcp', 'udp'].includes(value.toLowerCase())
    default:
      // Regexes and nested logical rules use Mihomo's parser, not JavaScript's grammar.
      return true
  }
}
