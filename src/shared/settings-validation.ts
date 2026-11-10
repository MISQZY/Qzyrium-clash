import type { AppConfig } from './app-config'
import { SHORTCUT_ACTIONS, shortcutIdentity } from './shortcuts'
import { coreFields, dnsFields, generalFields, resourceFields, snifferFields, tunFields, validateFields } from './settings-fields'

export function validateAppConfig(config: AppConfig): void {
  for (const port of [config.kernel.mixedPort, config.kernel.controllerPort]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ports must be between 1 and 65535')
  }
  if (config.kernel.mixedPort === config.kernel.controllerPort) throw new Error('Mixed and controller ports must be different')
  if (!['rule', 'global', 'direct'].includes(config.kernel.mode)) throw new Error('Invalid routing mode')
  if (!['info', 'warning', 'debug', 'error', 'silent'].includes(config.kernel.logLevel)) throw new Error('Invalid log level')
  if (!['system', 'gvisor', 'mixed'].includes(config.kernel.tun.stack)) throw new Error('Invalid TUN stack')
  validateFields(config.kernel.options, coreFields, 'kernel')
  validateFields(config.kernel.tun.options, tunFields, 'tun')
  validateFields(config.kernel.dns, dnsFields, 'dns')
  validateFields(config.kernel.sniffer, snifferFields, 'sniffer')
  validateFields(config.kernel.resources, resourceFields, 'resources')
  if (typeof config.general.autoConnect !== 'boolean') throw new Error('general.autoConnect: expected a boolean')
  if (typeof config.general.minimizeToTray !== 'boolean') throw new Error('general.minimizeToTray: expected a boolean')
  const extra = Object.fromEntries(generalFields.filter(({ key }) => key in config.general).map(({ key }) => [key, config.general[key as keyof AppConfig['general']]]))
  validateFields(extra, generalFields, 'general')
  if (config.general.delayTestUrl && !/^https?:\/\//i.test(config.general.delayTestUrl)) throw new Error('Latency test URL must use HTTP or HTTPS')
  const shortcuts = config.general.shortcuts ?? {}
  const actions: readonly string[] = SHORTCUT_ACTIONS
  if (Object.keys(shortcuts).some((key) => !actions.includes(key)) || Object.values(shortcuts).some((value) => typeof value !== 'string')) throw new Error('Invalid shortcut action')
  const accelerators = Object.values(shortcuts).filter((value) => value.trim()).map(shortcutIdentity)
  if (new Set(accelerators).size !== accelerators.length) throw new Error('Shortcuts must be unique')
  if (config.sysProxy.mode && !['manual', 'pac'].includes(config.sysProxy.mode)) throw new Error('Invalid system proxy mode')
  if (config.sysProxy.host && !/^[\w.:-]+$/.test(config.sysProxy.host)) throw new Error('Invalid system proxy host')
  if (config.sysProxy.bypass.some((value) => typeof value !== 'string')) throw new Error('Invalid proxy bypass list')
  const ports = [config.kernel.mixedPort, config.kernel.controllerPort, config.kernel.options?.port, config.kernel.options?.['socks-port']].filter((port) => typeof port === 'number' && port > 0)
  if (new Set(ports).size !== ports.length) throw new Error('Listening ports must be unique')
}
