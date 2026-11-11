import yaml from 'yaml'
import { AppConfig } from '@shared/app-config'
import { CustomRuleItem } from '@shared/profile'
import { insertRuleOverrides, splitRuleFields } from '@shared/rules'
import { parseProfileConfig } from '../utils/profile-config'

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

    // Apply strict kernel overrides from AppConfig
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
    parsed['mixed-port'] = appConfig.kernel.mixedPort
    parsed['allow-lan'] = appConfig.kernel.allowLan
    parsed['mode'] = appConfig.kernel.mode
    parsed['log-level'] = appConfig.kernel.logLevel
    parsed['external-controller'] = `127.0.0.1:${appConfig.kernel.controllerPort}`
    parsed['secret'] = appConfig.kernel.controllerSecret

    // TUN mode configuration
    if (appConfig.kernel.tun.enable) {
      if (parsed['ipv6'] === undefined) {
        parsed['ipv6'] = true
      }
      parsed['tun'] = {
        ...(parsed.tun as Record<string, unknown> ?? {}),
        ...appConfig.kernel.tun.options,
        enable: true,
        stack: appConfig.kernel.tun.stack || 'gvisor',
        'auto-route': appConfig.kernel.tun.autoRoute ?? true,
        'auto-detect-interface': true,
        'strict-route': appConfig.kernel.tun.strictRoute ?? false,
        'dns-hijack': appConfig.kernel.tun.dnsHijack && appConfig.kernel.tun.dnsHijack.length > 0
          ? appConfig.kernel.tun.dnsHijack
          : ['any:53', 'tcp://any:53']
      }

      // Ensure DNS module is active and properly configured for TUN packet resolution
      const currentDns = (parsed.dns && typeof parsed.dns === 'object' && !Array.isArray(parsed.dns))
        ? (parsed.dns as Record<string, unknown>)
        : {}
      if (currentDns.enable !== true) {
        parsed['dns'] = {
          'enhanced-mode': 'fake-ip',
          'fake-ip-range': '198.18.0.1/16',
          'fake-ip-filter': [
            '*.lan',
            'localhost.ptlogin2.qq.com',
            'dns.msftncsi.com',
            'www.msftncsi.com',
            'msftncsi.com',
            '*.msftconnecttest.com',
            '*.msftncsi.com'
          ],
          'default-nameserver': [
            '77.88.8.8',
            '1.1.1.1',
            '8.8.8.8'
          ],
          nameserver: [
            'https://dns.cloudflare.com/dns-query',
            'https://dns.google/dns-query',
            '77.88.8.8',
            '1.1.1.1'
          ],
          'proxy-server-nameserver': [
            'https://dns.cloudflare.com/dns-query',
            '77.88.8.8',
            '1.1.1.1'
          ],
          ...currentDns,
          enable: true
        }
      }
    } else {
      delete parsed['tun']
    }

    // Only changed rules are stored as overrides; untouched subscription rows stay in the profile.
    if (customRules?.length) {
      type Entry = { value: string; id?: string; offset?: number; position?: 'top' | 'bottom'; disabled?: boolean }
      const overrides: Entry[] = []
      const sources = new Map(customRules.filter((rule) => rule.sourceRule !== undefined)
        .map((rule) => [JSON.stringify([rule.sourceRule, rule.sourceOccurrence ?? 0]), rule]))
      const deleted = customRules.filter((rule) => rule.isDeleted && rule.enabled !== false && rule.sourceRule === undefined)
      const occurrences = new Map<string, number>()
      const base: Entry[] = []
      for (const value of Array.isArray(parsed.rules) ? parsed.rules.map((rule) => String(rule).trim()) : []) {
        const occurrence = occurrences.get(value) ?? 0
        occurrences.set(value, occurrence + 1)
        const source = sources.get(JSON.stringify([value, occurrence]))
        if (source) {
          overrides.push({ value: source.replacementRule ?? value, id: source.replacementRule ? source.id : undefined,
            offset: source.offset, position: 'top', disabled: source.isDeleted || source.enabled === false || !!source.validationError })
          continue
        }
        const parts = splitRuleFields(value).map((part) => part.trim())
        const type = parts[0]?.toUpperCase()
        const payload = type === 'MATCH' ? '' : parts[1] || ''
        const proxy = type === 'MATCH' ? parts[1] || '' : parts[2] || ''
        const disabled = deleted.some((rule) => rule.type.toUpperCase() === type &&
          (type === 'MATCH' || rule.payload === payload) && (!rule.proxy || rule.proxy === proxy))
        base.push({ value, disabled })
      }
      for (const rule of customRules) {
        if (rule.sourceRule !== undefined || rule.isDeleted) continue
        const type = (rule.type || '').trim().toUpperCase()
        const payload = (rule.payload || '').trim()
        const proxy = (rule.proxy || 'DIRECT').trim()
        const extra = rule.additionalParams?.length ? `,${rule.additionalParams.join(',')}` : ''
        overrides.push({
          value: type === 'MATCH' ? `MATCH,${proxy}${extra}` : `${type},${payload},${proxy}${extra}`,
          id: rule.id, offset: rule.offset, position: rule.position,
          disabled: rule.enabled === false || !!rule.validationError
        })
      }
      const matchIndex = base.findLastIndex((rule) => rule.value.toUpperCase().startsWith('MATCH,'))
      const ordered = insertRuleOverrides(base, overrides, matchIndex === -1 ? base.length : matchIndex)
        .filter((rule) => !rule.disabled)
      parsed.rules = ordered.map((rule) => rule.value)
      if (ruleIds) for (const rule of ordered) ruleIds.push(rule.id)
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
