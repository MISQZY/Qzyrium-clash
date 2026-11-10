import yaml from 'yaml'

export function parseProfileConfig(content: string): Record<string, unknown> {
  const config: unknown = yaml.parse(content)
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).length === 0) {
    throw new Error('Profile must contain a non-empty Clash/Mihomo YAML object')
  }
  const record = config as Record<string, unknown>
  if (!['proxies', 'proxy-providers', 'proxy-groups', 'rules', 'rule-providers'].some((key) => key in record)) {
    throw new Error('Profile does not contain Clash/Mihomo proxies or routing rules')
  }
  return record
}
