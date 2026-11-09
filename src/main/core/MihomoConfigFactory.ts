import yaml from 'yaml'
import { AppConfig } from '@shared/app-config'
import { CustomRuleItem } from '@shared/profile'
import { splitRuleFields } from '@shared/rules'
import { logger } from '../utils/logger'

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
    customRules?: CustomRuleItem[]
  ): string {
    let parsed: Record<string, unknown> = {}

    if (rawProfileYaml && rawProfileYaml.trim().length > 0) {
      try {
        parsed = yaml.parse(rawProfileYaml) || {}
      } catch (err) {
        logger.error('Failed to parse profile YAML, falling back to default skeleton', err)
        parsed = this.createDefaultConfig(appConfig)
      }
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
          : ['any:53']
      }

      // Ensure DNS module is active and properly configured for TUN packet resolution
      const currentDns = (parsed.dns && typeof parsed.dns === 'object' && !Array.isArray(parsed.dns))
        ? (parsed.dns as Record<string, unknown>)
        : {}
      if (currentDns.enable !== true) {
        parsed['dns'] = {
          'enhanced-mode': 'fake-ip',
          'fake-ip-range': '198.18.0.1/16',
          nameserver: [
            '77.88.8.8',
            '1.1.1.1',
            '8.8.8.8'
          ],
          ...currentDns,
          enable: true
        }
      }
    } else {
      delete parsed['tun']
    }

    // Apply user custom rules (top priority / prepend or bottom priority before MATCH)
    if (customRules && customRules.length > 0) {
      const activeCustomRules = customRules.filter((r) => r.enabled !== false)
      if (activeCustomRules.length > 0) {
        let baseRules: string[] = []
        if (Array.isArray(parsed['rules'])) {
          baseRules = parsed['rules'].map(String)
        }

        // Filter out deleted base rules
        const deletedCustomRules = activeCustomRules.filter((r) => r.isDeleted)
        if (deletedCustomRules.length > 0) {
          baseRules = baseRules.filter((baseRuleStr) => {
            const parts = splitRuleFields(baseRuleStr).map((s) => s.trim())
            const bType = parts[0]?.toUpperCase()
            const bPayload = bType === 'MATCH' ? '' : parts[1] || ''
            const bProxy = bType === 'MATCH' ? parts[1] || '' : parts[2] || ''
            return !deletedCustomRules.some((del) => {
              if ((del.type || '').toUpperCase() !== bType) return false
              if (bType === 'MATCH') return !del.proxy || del.proxy === bProxy
              return (del.payload || '') === bPayload && (!del.proxy || del.proxy === bProxy)
            })
          })
        }

        const topRules: string[] = []
        const bottomRules: string[] = []

        for (const rule of activeCustomRules) {
          if (rule.isDeleted) continue
          const type = (rule.type || '').trim().toUpperCase()
          const payload = (rule.payload || '').trim()
          const proxy = (rule.proxy || 'DIRECT').trim()
          const extra = rule.additionalParams && rule.additionalParams.length > 0
            ? `,${rule.additionalParams.join(',')}`
            : ''

          let ruleStr = ''
          if (type === 'MATCH') {
            ruleStr = `MATCH,${proxy}${extra}`
          } else if (payload) {
            ruleStr = `${type},${payload},${proxy}${extra}`
          }

          if (ruleStr) {
            if (rule.position === 'bottom') {
              bottomRules.push(ruleStr)
            } else {
              topRules.push(ruleStr)
            }
          }
        }

        if (bottomRules.length > 0) {
          const matchIndex = baseRules.findIndex((r) => r.trim().toUpperCase().startsWith('MATCH,'))
          if (matchIndex !== -1) {
            baseRules.splice(matchIndex, 0, ...bottomRules)
          } else {
            baseRules.push(...bottomRules)
          }
        }

        parsed['rules'] = [...topRules, ...baseRules]
      }
    }

    return yaml.stringify(parsed)
  }
}
