import { translate, type Locale } from '../i18n/catalogs'
import type { ProxyNode, ConnectionsSnapshot, MihomoRule } from '@shared/mihomo'
import type { GlobeLocations, GeoLocation } from '@shared/geo'

export type Coordinate = [longitude: number, latitude: number]

export interface GlobeRoute {
  id: string
  from: Coordinate
  to: Coordinate
  node: string
  delay?: number
  fromLabel: string
  toLabel: string
  country?: string
  countryCode?: string
  color: string
  selector?: string
  rule?: string
  connectionCount?: number
  connecting?: boolean
  approximate?: boolean
}

export const ROUTE_COLORS = [
  '#0ea5e9', // Sky blue
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#3b82f6', // Royal blue
  '#ec4899', // Pink
  '#f97316', // Orange
  '#a855f7', // Purple
  '#06b6d4', // Cyan
  '#e11d48', // Rose
  '#6366f1', // Indigo
  '#d946ef', // Fuchsia
  '#fb923c'  // Coral
]

export const DEFAULT_ORIGIN: GeoLocation = {
  ip: '',
  city: '',
  country: '',
  longitude: 37.618423,
  latitude: 55.751244,
  precision: 'country'
}

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  germany: 'DE',
  netherlands: 'NL',
  'united states': 'US',
  usa: 'US',
  russia: 'RU',
  'russian federation': 'RU',
  'united kingdom': 'GB',
  uk: 'GB',
  france: 'FR',
  japan: 'JP',
  singapore: 'SG',
  'hong kong': 'HK',
  finland: 'FI',
  sweden: 'SE',
  poland: 'PL',
  turkey: 'TR',
  kazakhstan: 'KZ',
  canada: 'CA',
  switzerland: 'CH',
  austria: 'AT',
  italy: 'IT',
  spain: 'ES',
  czechia: 'CZ',
  'czech republic': 'CZ',
  estonia: 'EE',
  latvia: 'LV',
  lithuania: 'LT',
  ukraine: 'UA',
  georgia: 'GE',
  armenia: 'AM',
  moldova: 'MD',
  norway: 'NO',
  denmark: 'DK',
  belgium: 'BE',
  ireland: 'IE',
  australia: 'AU',
  brazil: 'BR',
  india: 'IN',
  'south korea': 'KR',
  korea: 'KR'
}

export function localizeCountry(country?: string, code?: string, locale: Locale = 'ru'): string {
  if (!country && !code) return ''
  const isoCode = code || (country ? COUNTRY_NAME_TO_CODE[country.toLowerCase().trim()] : undefined)
  if (isoCode) {
    try {
      const localized = new Intl.DisplayNames([locale, 'en'], { type: 'region' }).of(isoCode.toUpperCase())
      if (localized) return localized
    } catch {
      // fallback to original string
    }
  }
  return country || ''
}

export function connectionRoutes(
  locations: GlobeLocations,
  proxies: Record<string, ProxyNode>,
  delays: Record<string, number>,
  connections?: ConnectionsSnapshot,
  mode?: string,
  rules?: MihomoRule[],
  locale: Locale = 'ru',
  connecting?: boolean
): GlobeRoute[] {
  const origin = locations.origin || DEFAULT_ORIGIN
  if (!locations.routes || locations.routes.length === 0) return []

  const activeConnections = connections?.connections || []

  return locations.routes.map(({ node, location }, index) => {
    const delay = delays[node] ?? proxies[node]?.history.at(-1)?.delay
    const color = connecting ? '#71717a' : ROUTE_COLORS[index % ROUTE_COLORS.length]

    const country = localizeCountry(location.country, location.countryCode, locale)
    const originCountry = localizeCountry(origin.country, origin.countryCode, locale)

    let selector: string | undefined
    let rule: string | undefined
    const connectionCount = activeConnections.filter(
      (c) => c.chains.includes(node) || c.chains.at(-1) === node
    ).length

    if (connecting) {
      selector = translate(locale, 'dashboard', 'routeConnecting')
      rule = translate(locale, 'dashboard', 'routeEstablishing')
    } else {
      // 1. Find live connections routed through this node
      const matching = activeConnections.filter(
        (c) => c.chains.includes(node) || c.chains.at(-1) === node
      )

      if (matching.length > 0) {
        const primary = matching[0]
        const nodeIndex = primary.chains.indexOf(node)
        const upstream = nodeIndex > 0 ? primary.chains.slice(0, nodeIndex) : []
        if (upstream.length > 0) {
          selector = upstream.join(' → ')
        } else {
          const parentGroups = Object.entries(proxies).filter(
            ([name, p]) => name !== 'GLOBAL' && (p.now === node || (Array.isArray((p as { all?: string[] }).all) && (p as { all?: string[] }).all?.includes(node)))
          )
          if (parentGroups.length > 0) {
            selector = parentGroups[0][0]
          } else if (mode === 'global') {
            selector = 'GLOBAL'
          }
        }
        if (selector === node) selector = undefined

        if (primary.rulePayload) {
          rule = `${primary.rule} (${primary.rulePayload})`
        } else {
          rule = primary.rule || 'Match'
        }

        if (matching.length > 1) {
          const distinctRules = Array.from(
            new Set(
              matching.map((c) => (c.rulePayload ? `${c.rule} (${c.rulePayload})` : c.rule || 'Match'))
            )
          )
          if (distinctRules.length > 1) {
            const firstTwo = distinctRules.slice(0, 2).join(', ')
            rule = distinctRules.length > 2 ? `${firstTwo} (+${distinctRules.length - 2})` : firstTwo
          }
        }
      } else {
        // 2. Idle or default selected tunnel
        if (mode === 'global') {
          selector = 'GLOBAL'
          rule = translate(locale, 'dashboard', 'routeGlobal')
        } else {
          const parentGroups = Object.entries(proxies).filter(
            ([, p]) => p.now === node || ('all' in p && (p as { all?: string[] }).all?.includes(node) && p.now === node)
          )
          if (parentGroups.length > 0) {
            selector = parentGroups.map(([name]) => name).join(', ')
          }

          if (rules && rules.length > 0) {
            const targetGroup = parentGroups[0]?.[0]
            const matchingRule = rules.find((r) => r.proxy === node || (targetGroup && r.proxy === targetGroup))
            if (matchingRule) {
              rule = matchingRule.payload ? `${matchingRule.type} (${matchingRule.payload})` : matchingRule.type
            }
          }

          if (!rule) {
            const matchTarget = rules?.find((r) => r.type === 'MATCH')?.proxy
            const isMatchDirect = !matchTarget || matchTarget === 'DIRECT' || matchTarget === 'Прочие сервисы'
            rule = isMatchDirect
              ? (translate(locale, 'dashboard', 'routeTunnelRules'))
              : (translate(locale, 'dashboard', 'routeDefault'))
          }
        }
      }
    }

    const fromLabel = [origin.city, originCountry || origin.country].filter(Boolean).join(', ') || (translate(locale, 'dashboard', 'yourDevice'))
    const toLabel = [location.city, country || location.country].filter(Boolean).join(', ') || (translate(locale, 'dashboard', 'server'))

    return {
      id: node,
      node,
      from: [origin.longitude, origin.latitude],
      to: [location.longitude, location.latitude],
      delay: delay && delay > 0 ? delay : undefined,
      fromLabel,
      toLabel,
      country,
      countryCode: location.countryCode || COUNTRY_NAME_TO_CODE[location.country.toLowerCase().trim()],
      color,
      selector,
      rule,
      connectionCount,
      connecting,
      approximate: !locations.origin || origin.precision === 'country' || location.precision === 'country'
    }
  })
}
