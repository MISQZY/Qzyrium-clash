import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { getAppPaths } from './paths'
import { logger } from './logger'
import { getProtectedRuntimeDirectory, prepareExecutableForExecution } from './executable-security'

export class NetworkWatchdog {
  private child?: ChildProcessWithoutNullStreams
  private pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>()
  private buffer = ''
  private ready = false
  private stopping = false

  constructor(private failed: (error: Error) => void = () => {}) {}

  async start(): Promise<void> {
    if (process.platform !== 'win32' && process.platform !== 'linux') return
    if (this.child) throw new Error('Network watchdog is already started')
    this.buffer = ''
    this.stopping = false
    const paths = getAppPaths()
    const linux = process.platform === 'linux'
    const binary = linux ? process.execPath
      : prepareExecutableForExecution(path.join(paths.geoFilesDir, 'qzyrium-watchdog.exe'), 'watchdog')
    const args = linux ? [path.join(paths.geoFilesDir, 'linux-proxy-watchdog.cjs'), paths.userData]
      : [String(process.pid), process.execPath, paths.coreBinaryPath, paths.userData, paths.coresDir, getProtectedRuntimeDirectory()]
    const child = spawn(binary, args, {
      windowsHide: true, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
      ...(!linux ? { cwd: path.dirname(binary) } : {}),
      ...(linux ? { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } } : {})
    })
    this.child = child
    const fail = (error: Error) => {
      const wasReady = this.ready
      this.ready = false
      for (const task of this.pending.values()) task.reject(error)
      this.pending.clear()
      if (wasReady && !this.stopping) this.failed(error)
    }
    child.on('error', fail)
    child.on('exit', code => fail(new Error(`Network watchdog exited (${code})`)))
    child.stdin.on('error', fail)
    child.stdout.on('data', data => {
      this.buffer += data.toString()
      let end: number
      while ((end = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, end).trim()
        this.buffer = this.buffer.slice(end + 1)
        const key = line === 'READY' ? line : line.replace(/^ERROR /, 'CORE ')
        const task = this.pending.get(key)
        if (!task) continue
        this.pending.delete(key)
        if (line.startsWith('ERROR ')) task.reject(new Error('Unable to supervise Mihomo process'))
        else task.resolve()
      }
    })
    child.stderr.on('data', data => logger.error(`Network watchdog: ${data.toString().trim()}`))
    try {
      await this.waitFor('READY', 25_000)
      this.ready = true
    } catch (error) {
      try { child.stdin.end() } catch {}
      try { child.kill() } catch {}
      this.child = undefined
      throw error
    }
  }

  private waitFor(key: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(key); reject(new Error(`Network watchdog timeout (${key})`)) }, timeoutMs)
      this.pending.set(key, {
        resolve: () => { clearTimeout(timer); resolve() },
        reject: error => { clearTimeout(timer); reject(error) }
      })
    })
  }

  async trackCore(pid: number): Promise<void> {
    if (process.platform !== 'win32') return
    if (!this.ready || !this.child) throw new Error('Network watchdog is unavailable')
    const acknowledgement = this.waitFor(`CORE ${pid}`, 5000)
    this.child.stdin.write(`${pid}\n`)
    await acknowledgement
  }

  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    this.stopping = true
    this.ready = false
    if (child.exitCode !== null || child.signalCode !== null) { this.child = undefined; return }
    await new Promise<void>((resolve, reject) => {
      const onExit = () => { clearTimeout(timer); this.child = undefined; resolve() }
      const timer = setTimeout(() => {
        child.removeListener('exit', onExit)
        try { child.kill() } catch {}
        this.child = undefined
        reject(new Error('Network watchdog shutdown timed out'))
      }, 25_000)
      child.once('exit', onExit)
      child.stdin.end()
    })
  }
}

export const networkWatchdog = new NetworkWatchdog(error => {
  logger.error('Network watchdog failed; shutting down to restore network settings', error)
  // Import Electron only in the application process, never in the native helper.
  void import('electron').then(({ app }) => app.quit())
})
