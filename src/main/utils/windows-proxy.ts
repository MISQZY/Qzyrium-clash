import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { getAppPaths } from './paths'
import { writeFileAtomicAsync } from './atomicWrite'
import { getSystemBinary } from './system-binaries'

const execute = promisify(execFile)
const registryKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
const names = ['ProxyEnable', 'ProxyServer', 'ProxyOverride', 'AutoConfigURL'] as const
type Name = typeof names[number]
type Value = { type: 'REG_SZ' | 'REG_EXPAND_SZ' | 'REG_DWORD'; data: string }
type Snapshot = Record<Name, Value | null>

export interface ProxyRegistry {
  read(): Promise<Snapshot>
  write(name: Name, value: Value | null): Promise<void>
}

export const windowsProxyRegistry: ProxyRegistry = {
  async read() {
    const { stdout } = await execute(getSystemBinary('reg.exe'), ['query', registryKey], { windowsHide: true, timeout: 5000 })
    const values = Object.fromEntries(names.map(name => [name, null])) as Snapshot
    for (const line of stdout.split(/\r?\n/)) {
      const match = /^\s+(ProxyEnable|ProxyServer|ProxyOverride|AutoConfigURL)\s+(REG_\w+)\s*(.*)$/.exec(line)
      if (!match) continue
      if (!['REG_SZ', 'REG_EXPAND_SZ', 'REG_DWORD'].includes(match[2])) throw new Error('Unsupported system proxy registry type')
      values[match[1] as Name] = { type: match[2] as Value['type'], data: match[3] }
    }
    return values
  },
  async write(name, value) {
    if (value) {
      await execute(getSystemBinary('reg.exe'), ['add', registryKey, '/v', name, '/t', value.type, '/d', value.data, '/f'], { windowsHide: true, timeout: 5000 })
    } else {
      try {
        await execute(getSystemBinary('reg.exe'), ['delete', registryKey, '/v', name, '/f'], { windowsHide: true, timeout: 5000 })
      } catch (error) {
        // reg.exe also fails for missing values. Verify absence before treating
        // a failed delete as successful so recovery can retry real failures.
        if ((await this.read())[name] !== null) throw error
      }
    }
  }
}

/** Persist original values before the first write, including absent values. */
export class WindowsProxySettings {
  constructor(private registry = windowsProxyRegistry,
    private filename = () => path.join(getAppPaths().userData, 'system-proxy-recovery.json')) {}

  private async readSnapshot(): Promise<Snapshot | null> {
    let text: string
    try { text = await readFile(this.filename(), 'utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
    const parsed = JSON.parse(text)
    if (parsed.version !== 1 || !parsed.values || names.some(name => {
      const value = parsed.values[name]
      return value !== null && (!value || !['REG_SZ', 'REG_EXPAND_SZ', 'REG_DWORD'].includes(value.type) || typeof value.data !== 'string')
    })) throw new Error('Invalid system proxy recovery file')
    return parsed.values
  }

  private sanitizeSnapshot(values: Snapshot): Snapshot {
    const server = values.ProxyServer?.data || ''
    const pac = values.AutoConfigURL?.data || ''
    const isLoopback = /(?:127\.0\.0\.1|localhost|::1)(?::\d+)?/i.test(server) || /(?:127\.0\.0\.1|localhost|::1)(?::\d+)?/i.test(pac)
    if (isLoopback) {
      return {
        ...values,
        ProxyEnable: { type: 'REG_DWORD', data: '0x0' },
        ProxyServer: null,
        AutoConfigURL: null
      }
    }
    return values
  }

  async capture(): Promise<void> {
    if (await this.readSnapshot()) return
    const values = await this.registry.read()
    const sanitized = this.sanitizeSnapshot(values)
    await writeFileAtomicAsync(this.filename(), JSON.stringify({ version: 1, values: sanitized }))
  }

  async set(name: Name, data: string, type: Value['type'] = 'REG_SZ'): Promise<void> {
    await this.registry.write(name, { type, data })
  }

  async quarantineRecoveryFile(): Promise<void> {
    const file = this.filename()
    try { await rename(file, `${file}.corrupt`) } catch { try { await unlink(file) } catch {} }
  }

  async restore(): Promise<void> {
    const values = await this.readSnapshot()
    if (!values) return
    // Enable last so an old proxy is never enabled with our server address.
    for (const name of [...names.slice(1), names[0]]) await this.registry.write(name, values[name])
    await unlink(this.filename())
  }
}
