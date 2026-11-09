import { Script } from 'node:vm'
import type { AppConfig } from '@shared/app-config'

export function pacScript(settings: AppConfig): string {
  const rawHost = settings.sysProxy.host || '127.0.0.1'
  const host = rawHost.includes(':') ? `[${rawHost}]` : rawHost
  const port = settings.kernel.mixedPort
  const custom = settings.sysProxy.pacScript?.trim()
  const script = custom
    ? custom.replaceAll('{{host}}', host).replaceAll('{{port}}', String(port)).replaceAll('%mixed-port%', String(port))
    : `function FindProxyForURL(url, host) {
  var bypass = ${JSON.stringify(settings.sysProxy.bypass)};
  if (isPlainHostName(host)) return "DIRECT";
  for (var i = 0; i < bypass.length; i++) {
    if (bypass[i] === "<local>" || !bypass[i]) continue;
    if (shExpMatch(host, bypass[i])) return "DIRECT";
  }
  return ${JSON.stringify(`PROXY ${host}:${port}; SOCKS5 ${host}:${port}; DIRECT`)};
}`
  new Script(script)
  if (!/\bFindProxyForURL\s*(?:\(|=)/.test(script)) throw new Error('PAC script must define FindProxyForURL')
  return script
}
