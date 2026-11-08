import yaml from 'yaml'
import { AppConfig } from '@shared/app-config'
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
      proxies: [
        {
          name: 'DIRECT',
          type: 'direct',
          udp: true
        }
      ],
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

  static synthesize(rawProfileYaml: string | null, appConfig: AppConfig): string {
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
    parsed['mixed-port'] = appConfig.kernel.mixedPort
    parsed['allow-lan'] = appConfig.kernel.allowLan
    parsed['mode'] = appConfig.kernel.mode
    parsed['log-level'] = appConfig.kernel.logLevel
    parsed['external-controller'] = `127.0.0.1:${appConfig.kernel.controllerPort}`
    parsed['secret'] = appConfig.kernel.controllerSecret

    // TUN mode configuration
    if (appConfig.kernel.tun.enable) {
      parsed['tun'] = {
        enable: true,
        stack: appConfig.kernel.tun.stack,
        'auto-route': appConfig.kernel.tun.autoRoute,
        'strict-route': appConfig.kernel.tun.strictRoute,
        'dns-hijack': appConfig.kernel.tun.dnsHijack
      }
    } else {
      delete parsed['tun']
    }

    return yaml.stringify(parsed)
  }
}
