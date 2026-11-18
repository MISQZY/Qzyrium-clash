import type { CustomLocalizationPack } from '@shared/custom-localization'
import { translate, type Locale } from '../i18n/catalogs'
import type { ProxyNode, ConnectionsSnapshot, MihomoRule } from '@shared/mihomo'
import type { GlobeLocations } from '@shared/geo'

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
  custom?: CustomLocalizationPack
  approximate?: boolean
  chainId?: string
  chain?: string[]
  chainLabel?: string
  chainHopCities?: string[]
  isChainSegment?: boolean
  segmentIndex?: number
  totalSegments?: number
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

export function localizeCountry(country?: string, code?: string, locale: string = 'ru'): string {
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
  connecting?: boolean,
  custom?: CustomLocalizationPack
): GlobeRoute[] {
  const origin = locations.origin
  if (connecting || !origin || !locations.routes || locations.routes.length === 0) return []

  const activeConnections = connections?.connections || []

  const routes: GlobeRoute[] = []

  locations.routes.forEach(({ node, location, chain }, index) => {
    const delay = delays[node] ?? proxies[node]?.history.at(-1)?.delay
    const color = ROUTE_COLORS[index % ROUTE_COLORS.length]

    const country = localizeCountry(location.country, location.countryCode, custom?.locale ?? locale)
    const originCountry = localizeCountry(origin.country, origin.countryCode, custom?.locale ?? locale)

    let selector: string | undefined
    let rule: string | undefined
    const isNodeInChain = (c: { chains: string[] }) =>
      c.chains.includes(node) || c.chains.at(-1) === node || (chain !== undefined && chain.some((h) => c.chains.includes(h.node)))

    const connectionCount = activeConnections.filter(isNodeInChain).length

    // 1. Find live connections routed through this node or chain
    const matching = activeConnections.filter(isNodeInChain)

    const parentGroups = Object.entries(proxies).filter(
      ([name, p]) => name !== 'GLOBAL' && (p.now === node || (Array.isArray((p as { all?: string[] }).all) && (p as { all?: string[] }).all?.includes(node)))
    )

    if (matching.length > 0) {
      const primary = matching[0]
      const nodeIndex = primary.chains.indexOf(node)
      const upstream = nodeIndex > 0 ? primary.chains.slice(0, nodeIndex) : []
      if (upstream.length > 0) {
        selector = upstream.join(' → ')
      } else {
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
        rule = translate(locale, 'dashboard', 'routeGlobal', {}, custom)
      } else {
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
            ? (translate(locale, 'dashboard', 'routeTunnelRules', {}, custom))
            : (translate(locale, 'dashboard', 'routeDefault', {}, custom))
        }
      }
    }
    const fromLabel = [origin.city, originCountry || origin.country].filter(Boolean).join(', ') || (translate(locale, 'dashboard', 'yourDevice', {}, custom))
    const toLabel = [location.city, country || location.country].filter(Boolean).join(', ') || (translate(locale, 'dashboard', 'server', {}, custom))

    if (chain && chain.length >= 2) {
      const chainId = `chain-${node}-${index}`
      const chainNodes = chain.map((h) => h.node)
      const chainLabel = chainNodes.join(' \u2192 ')
      const chainHopCities = chain.map((h) => {
        const cName = localizeCountry(h.location.country, h.location.countryCode, custom?.locale ?? locale)
        return [h.location.city, cName || h.location.country].filter(Boolean).join(', ') || h.node
      })

      // Segment 0: User device -> Hop 0 (Entry)
      const hop0 = chain[0]
      const hop0Country = localizeCountry(hop0.location.country, hop0.location.countryCode, custom?.locale ?? locale)
      routes.push({
        id: `${chainId}-0`,
        chainId,
        chain: chainNodes,
        chainLabel,
        chainHopCities,
        isChainSegment: true,
        segmentIndex: 0,
        totalSegments: chain.length,
        node: hop0.node,
        from: [origin.longitude, origin.latitude],
        to: [hop0.location.longitude, hop0.location.latitude],
        delay,
        fromLabel,
        toLabel: chainHopCities[0],
        country: hop0Country,
        countryCode: hop0.location.countryCode || COUNTRY_NAME_TO_CODE[hop0.location.country.toLowerCase().trim()],
        color,
        selector,
        rule,
        connectionCount,
        connecting,
        approximate: !locations.origin || origin.precision === 'country' || hop0.location.precision === 'country'
      })

      // Subsequent segments: Hop[i-1] -> Hop[i]
      for (let i = 1; i < chain.length; i++) {
        const prev = chain[i - 1]
        const curr = chain[i]
        const currCountry = localizeCountry(curr.location.country, curr.location.countryCode, custom?.locale ?? locale)
        routes.push({
          id: `${chainId}-${i}`,
          chainId,
          chain: chainNodes,
          chainLabel,
          chainHopCities,
          isChainSegment: true,
          segmentIndex: i,
          totalSegments: chain.length,
          node: curr.node,
          from: [prev.location.longitude, prev.location.latitude],
          to: [curr.location.longitude, curr.location.latitude],
          delay: i === chain.length - 1 ? delay : undefined,
          fromLabel: chainHopCities[i - 1],
          toLabel: chainHopCities[i],
          country: currCountry,
          countryCode: curr.location.countryCode || COUNTRY_NAME_TO_CODE[curr.location.country.toLowerCase().trim()],
          color,
          selector,
          rule,
          connectionCount,
          connecting,
          approximate: prev.location.precision === 'country' || curr.location.precision === 'country'
        })
      }
    } else {
      routes.push({
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
      })
    }
  })

  return routes
}
