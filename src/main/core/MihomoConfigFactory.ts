import yaml from 'yaml'
import { AppConfig } from '@shared/app-config'
import { CustomRuleItem } from '@shared/profile'
import { resolveEffectiveRules } from '@shared/rules'
import { parseProfileConfig } from '@shared/profile-config'
import { resolveEffectiveCore, CORE_PORT_KEYS } from '@shared/effective-core'
import { DEFAULT_GEOX_URLS } from '@shared/geodata'

export function createMirrorUrlRewriter(mirror: string): (url: string) => string {
  const normalizedMirror = (mirror.trim() || 'https://ghfast.top').replace(/\/+$/, '')
  return (url: string): string => {
    const trimmed = url.trim()
    if (/^https?:\/\/(?:raw\.githubusercontent\.com|github\.com)\//i.test(trimmed)) {
      return `${normalizedMirror}/${trimmed}`
    }
    return trimmed
  }
}

function rewriteProviderUrls(providers: unknown, rewriter: (url: string) => string): void {
  if (providers && typeof providers === 'object' && !Array.isArray(providers)) {
    for (const item of Object.values(providers as Record<string, unknown>)) {
      if (item && typeof item === 'object' && 'url' in item && typeof item.url === 'string') {
        item.url = rewriter(item.url)
      }
    }
  }
}

function rewriteRecordUrls(record: unknown, rewriter: (url: string) => string): void {
  if (record && typeof record === 'object' && !Array.isArray(record)) {
    const target = record as Record<string, unknown>
    for (const [key, val] of Object.entries(target)) {
      if (typeof val === 'string') {
        target[key] = rewriter(val)
      }
    }
  }
}

export class MihomoConfigFactory {
  static createDefaultConfig(appConfig: AppConfig): Record<string, unknown> {
    return {
      'mixed-port': appConfig.kernel.mixedPort,
      'allow-lan': appConfig.kernel.allowLan,
      mode: appConfig.kernel.mode,
      'log-level': appConfig.kernel.logLevel,
      'external-controller': `127.0.0.1:${appConfig.kernel.controllerPort}`,
      secret: appConfig.kernel.controllerSecret,
      proxies: [],
      'proxy-groups': [
        {
          name: 'PROXY',
          type: 'select',
          proxies: ['DIRECT']
        }
      ],
      rules: ['MATCH,DIRECT']
    }
  }

  static synthesize(
    rawProfileYaml: string | null,
    appConfig: AppConfig,
    customRules?: CustomRuleItem[],
    ruleIds?: (string | undefined)[]
  ): string {
    if (ruleIds) ruleIds.length = 0
    let parsed: Record<string, unknown>

    if (rawProfileYaml !== null) {
      parsed = parseProfileConfig(rawProfileYaml)
    } else {
      parsed = this.createDefaultConfig(appConfig)
    }

    const effective = resolveEffectiveCore(rawProfileYaml === null ? {} : parsed, appConfig)
    // Apply explicit overrides; listener inheritance is resolved against the original profile.
    Object.assign(parsed, appConfig.kernel.options ?? {})
    if (appConfig.kernel.resources) {
      for (const [key, value] of Object.entries(appConfig.kernel.resources)) {
        parsed[key] = value && typeof value === 'object' && !Array.isArray(value)
          ? { ...(parsed[key] as Record<string, unknown> ?? {}), ...value as Record<string, unknown> }
          : value
      }
    }
    for (const block of ['dns', 'sniffer'] as const) {
      const override = appConfig.kernel[block]
      if (override) parsed[block] = { ...(parsed[block] as Record<string, unknown> ?? {}), ...override }
    }
    for (const key of CORE_PORT_KEYS) parsed[key] = effective.ports[key].value
    parsed['allow-lan'] = appConfig.kernel.allowLan
    parsed['mode'] = appConfig.kernel.mode
    parsed['log-level'] = effective.logLevel.value
    parsed['external-controller'] = `127.0.0.1:${appConfig.kernel.controllerPort}`
    parsed['secret'] = appConfig.kernel.controllerSecret

    // TUN mode configuration
    if (appConfig.kernel.tun.enable) {
      if (appConfig.kernel.tun.ipv6 !== undefined) {
        parsed['ipv6'] = appConfig.kernel.tun.ipv6
      } else if (parsed['ipv6'] === undefined) {
        parsed['ipv6'] = false
      }
      const userDnsHijack = appConfig.kernel.tun.dnsHijack && appConfig.kernel.tun.dnsHijack.length > 0
        ? appConfig.kernel.tun.dnsHijack
        : ['any:53', 'tcp://any:53']
      const effectiveDnsHijack = userDnsHijack.includes('any:53') && !userDnsHijack.some(h => h.startsWith('tcp://'))
        ? [...userDnsHijack, 'tcp://any:53']
        : userDnsHijack

      parsed['tun'] = {
        ...(parsed.tun as Record<string, unknown> ?? {}),
        ...appConfig.kernel.tun.options,
        enable: true,
        stack: appConfig.kernel.tun.stack || 'gvisor',
        'auto-route': appConfig.kernel.tun.autoRoute ?? true,
        'auto-detect-interface': appConfig.kernel.tun.options?.['auto-detect-interface'] ?? true,
        'strict-route': appConfig.kernel.tun.strictRoute ?? true,
        'dns-hijack': effectiveDnsHijack
      }
      if (process.platform === 'linux' && !(parsed.tun as Record<string, unknown>).device) {
        (parsed.tun as Record<string, unknown>).device = 'Qzyrium'
      }

      // Ensure sniffer is active in TUN mode for pure-IP and TLS SNI resolution
      const currentSniffer = (parsed.sniffer && typeof parsed.sniffer === 'object' && !Array.isArray(parsed.sniffer))
        ? (parsed.sniffer as Record<string, unknown>)
        : {}
      if (currentSniffer.enable !== false) {
        parsed['sniffer'] = {
          enable: true,
          'parse-pure-ip': true,
          sniff: {
            TLS: { ports: [443, 8443] },
            HTTP: { ports: [80, '8080-8880'] },
            QUIC: { ports: [443] }
          },
          'skip-domain': [
            'Mijia Cloud',
            'dlg.io.mi.com',
            '+.apple.com'
          ],
          ...currentSniffer
        }
      }

      // Ensure DNS module is active and properly configured for TUN packet resolution
      const currentDns = (parsed.dns && typeof parsed.dns === 'object' && !Array.isArray(parsed.dns))
        ? (parsed.dns as Record<string, unknown>)
        : {}
      const useResilientDns = appConfig.kernel.tun.resilientDns === true
      const fallbackDns = (appConfig.kernel.tun.fallbackDns && appConfig.kernel.tun.fallbackDns.length > 0)
        ? appConfig.kernel.tun.fallbackDns
        : ['77.88.8.8']

      const essentialFakeIpFilters = [
        '*.lan',
        '*.local',
        '*.internal',
        '*.localhost',
        'localhost.ptlogin2.qq.com',
        'dns.msftncsi.com',
        'www.msftncsi.com',
        'msftncsi.com',
        '*.msftconnecttest.com',
        '*.msftncsi.com'
      ]
      const existingFilters = Array.isArray(currentDns['fake-ip-filter'])
        ? (currentDns['fake-ip-filter'] as string[])
        : []
      const mergedFakeIpFilter = Array.from(new Set([...existingFilters, ...essentialFakeIpFilters]))

      const defaultNameservers = [
        'https://cloudflare-dns.com/dns-query',
        'https://dns.google/dns-query',
        'https://dns.quad9.net/dns-query'
      ]
      const defaultBootstrap = ['1.1.1.1', '8.8.8.8', '9.9.9.9']

      let nameservers = Array.isArray(currentDns.nameserver) && currentDns.nameserver.length > 0
        ? [...currentDns.nameserver as string[]]
        : [...defaultNameservers]
      if (useResilientDns) {
        nameservers = Array.from(new Set([...nameservers, ...fallbackDns]))
      }

      let defaultNs = Array.isArray(currentDns['default-nameserver']) && currentDns['default-nameserver'].length > 0
        ? [...currentDns['default-nameserver'] as string[]]
        : [...defaultBootstrap]
      if (useResilientDns) {
        defaultNs = Array.from(new Set([...defaultNs, ...fallbackDns]))
      }

      let proxyNs = Array.isArray(currentDns['proxy-server-nameserver']) && currentDns['proxy-server-nameserver'].length > 0
        ? [...currentDns['proxy-server-nameserver'] as string[]]
        : ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query', '1.1.1.1', '8.8.8.8']
      if (useResilientDns) {
        proxyNs = Array.from(new Set([...proxyNs, ...fallbackDns]))
      }

      parsed['dns'] = {
        ...currentDns,
        enable: true,
        'enhanced-mode': 'fake-ip',
        'fake-ip-range': (currentDns['fake-ip-range'] as string) || '198.18.0.1/16',
        'fake-ip-range6': (currentDns['fake-ip-range6'] as string) || 'fc00::/18',
        'fake-ip-filter': mergedFakeIpFilter,
        'default-nameserver': defaultNs,
        nameserver: nameservers,
        'proxy-server-nameserver': proxyNs
      }

      if (!parsed['find-process-mode']) {
        parsed['find-process-mode'] = 'strict'
      }
    } else if (parsed.tun && typeof parsed.tun === 'object' && !Array.isArray(parsed.tun)) {
      // Keep the profile's TUN parameters visible while the app controls activation.
      parsed.tun = { ...parsed.tun as Record<string, unknown>, enable: false }
    } else {
      delete parsed['tun']
    }

    // Only changed rules are stored as overrides; untouched subscription rows stay in the profile.
    if (customRules?.length) {
      parsed.rules = resolveEffectiveRules(parsed.rules, customRules, ruleIds)
    }

    // Configure default geox-url when geo-auto-update is enabled
    if (parsed['geo-auto-update'] && (!parsed['geox-url'] || typeof parsed['geox-url'] !== 'object')) {
      parsed['geox-url'] = { ...DEFAULT_GEOX_URLS }
    }

    // Optional mirror rewriting for external rule-providers & proxy-providers in restricted networks
    if (appConfig.kernel.mirrorRuleProviders) {
      const rewriteUrl = createMirrorUrlRewriter(appConfig.kernel.coreDownloadMirror ?? '')
      rewriteProviderUrls(parsed['rule-providers'], rewriteUrl)
      rewriteProviderUrls(parsed['proxy-providers'], rewriteUrl)
      rewriteRecordUrls(parsed['geox-url'], rewriteUrl)
    }

    const comments = (customRules ?? []).filter((rule) => !rule.isDeleted && rule.sourceRule === undefined &&
      (rule.enabled === false || rule.validationError)).map((rule) => {
      const fields = rule.type.toUpperCase() === 'MATCH'
        ? ['MATCH', rule.proxy || 'DIRECT']
        : [rule.type, rule.payload, rule.proxy || 'DIRECT']
      return `# ${rule.validationError ? 'Invalid' : 'Disabled'} user rule: ${JSON.stringify(rule.validationError ?? '')}\n# - ${JSON.stringify([...fields, ...(rule.additionalParams ?? [])].join(','))}\n`
    }).join('')
    return yaml.stringify(parsed) + comments
  }
}
