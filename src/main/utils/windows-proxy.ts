import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { getAppPaths } from './paths'
import { writeFileAtomicAsync } from './atomicWrite'

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
    const { stdout } = await execute('reg.exe', ['query', registryKey], { windowsHide: true, timeout: 5000 })
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
      await execute('reg.exe', ['add', registryKey, '/v', name, '/t', value.type, '/d', value.data, '/f'], { windowsHide: true, timeout: 5000 })
    } else {
      if ((await this.read())[name] === null) return
      await execute('reg.exe', ['delete', registryKey, '/v', name, '/f'], { windowsHide: true, timeout: 5000 })
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

  async capture(): Promise<void> {
    if (await this.readSnapshot()) return
    const values = await this.registry.read()
    await writeFileAtomicAsync(this.filename(), JSON.stringify({ version: 1, values }))
  }

  async set(name: Name, data: string, type: Value['type'] = 'REG_SZ'): Promise<void> {
    await this.registry.write(name, { type, data })
  }

  async restore(): Promise<void> {
    const values = await this.readSnapshot()
    if (!values) return
    // Enable last so an old proxy is never enabled with our server address.
    for (const name of [...names.slice(1), names[0]]) await this.registry.write(name, values[name])
    await unlink(this.filename())
  }
}
