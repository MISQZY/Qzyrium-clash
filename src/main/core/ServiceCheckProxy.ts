import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import yaml from 'yaml'
import type { ProxyNode } from '@shared/mihomo'

export async function buildServiceCheckConfig(raw: Record<string, unknown>, name: string, port: number,
  sourceDir: string, tempDir: string, proxies: Record<string, ProxyNode>): Promise<Record<string, unknown>> {
  const providers: Record<string, unknown> = {}
  let index = 0
  const rawProviders = (raw['proxy-providers'] && typeof raw['proxy-providers'] === 'object' ? raw['proxy-providers'] : {}) as Record<string, Record<string, unknown>>
  for (const [key, value] of Object.entries(rawProviders)) {
    if (value.type === 'inline') { providers[key] = { ...value, 'health-check': { enable: false } }; continue }
    if (typeof value.path !== 'string') throw new Error('Proxy provider has no local cache')
    const filename = `provider-${index++}.yaml`
    await fs.copyFile(path.resolve(sourceDir, value.path), path.join(tempDir, filename))
    await fs.chmod(path.join(tempDir, filename), 0o600)
    const { url: _url, interval: _interval, ...provider } = value
    providers[key] = { ...provider, type: 'file', path: filename, 'health-check': { enable: false } }
  }
  const rawProxies = Array.isArray(raw.proxies) ? raw.proxies as Record<string, unknown>[] : []
  const rawGroups = Array.isArray(raw['proxy-groups']) ? raw['proxy-groups'] as Record<string, unknown>[] : []
  const known = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE',
    ...rawProxies.map((proxy) => String(proxy.name)),
    ...rawGroups.map((group) => String(group.name))])
  const frozenGroup = (groupName: string, selection: string) => known.has(selection)
    ? { name: groupName, type: 'select', proxies: [selection] }
    : { name: groupName, type: 'select', 'include-all-providers': true,
        filter: `^${selection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/`/g, '\\x60')}$`, 'empty-fallback': 'REJECT' }
  // Provider hosts aren't global outbound names. An exact-match selector keeps
  // their native overrides and provides a REJECT fallback if a host disappears.
  let alias = '__qzyrium_service_check__'
  while (known.has(alias)) alias += '_'
  const groups = rawGroups.map((group) => {
    const now = proxies[String(group.name)]?.now ?? 'REJECT'
    return frozenGroup(String(group.name), now)
  })
  groups.push(frozenGroup(alias, name))
  return {
    proxies: raw.proxies ?? [], 'proxy-groups': groups, 'proxy-providers': providers,
    'mixed-port': 0, port: 0, 'socks-port': 0, 'allow-lan': false, ipv6: raw.ipv6 ?? false,
    'log-level': 'silent', mode: 'rule', tun: { enable: false }, dns: { enable: false },
    profile: { 'store-selected': false, 'store-fake-ip': false },
    listeners: [{ name: 'service-check', type: 'http', listen: '127.0.0.1', port, proxy: alias }],
    rules: ['MATCH,REJECT']
  }
}

async function unusedPort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function listening(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1')
    const finish = (ready: boolean) => { socket.destroy(); resolve(ready) }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(100, () => finish(false))
  })
}

/** A short-lived core with no TUN, system proxy, controller or direct fallback. */
export async function withServiceCheckProxy<T>(options: {
  binary: string; configPath: string; mihomoDir: string; name: string
  proxies: Record<string, ProxyNode>; signal: AbortSignal
}, run: (port: number) => Promise<T>): Promise<T> {
  const base = path.resolve(options.mihomoDir)
  const tempDir = await fs.mkdtemp(path.join(base, 'service-check-'))
  await fs.chmod(tempDir, 0o700)
  let child: ReturnType<typeof spawn> | undefined
  let exited: Promise<void> | undefined
  const kill = () => child?.kill()
  try {
    options.signal.throwIfAborted()
    const port = await unusedPort()
    const raw = yaml.parse(await fs.readFile(options.configPath, 'utf8'))
    const config = await buildServiceCheckConfig(raw, options.name, port, base, tempDir, options.proxies)
    const configPath = path.join(tempDir, 'config.yaml')
    await fs.writeFile(configPath, yaml.stringify(config), { mode: 0o600 })
    options.signal.throwIfAborted()
    child = spawn(options.binary, ['-d', tempDir, '-f', configPath], { windowsHide: true, stdio: 'ignore' })
    let failed = false
    exited = new Promise(resolve => { child!.once('exit', () => { failed = true; resolve() }); child!.once('error', () => { failed = true; resolve() }) })
    options.signal.addEventListener('abort', kill, { once: true })
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      options.signal.throwIfAborted()
      if (failed) throw new Error('Service check core failed to start')
      if (await listening(port)) { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    if (!ready) throw new Error('Service check core startup timed out')
    return await run(port)
  } finally {
    options.signal.removeEventListener('abort', kill)
    child?.kill()
    if (exited) await exited
    // mkdtemp's verified child directory is the only recursive removal target.
    const resolved = path.resolve(tempDir)
    if (path.dirname(resolved) === base && path.basename(resolved).startsWith('service-check-')) {
      await fs.rm(resolved, { recursive: true, force: true })
    }
  }
}

/**
 * Scavenges abandoned service-check temporary directories that may have been left behind
 * by crashed, killed, or abruptly terminated application instances.
 */
export async function cleanAbandonedServiceCheckDirs(baseDir: string): Promise<void> {
  try {
    const base = path.resolve(baseDir)
    const entries = await fs.readdir(base, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('service-check-')) {
        const target = path.join(base, entry.name)
        await fs.rm(target, { recursive: true, force: true }).catch(() => {})
      }
    }
  } catch {
    // Ignore missing directory or permission errors
  }
}
