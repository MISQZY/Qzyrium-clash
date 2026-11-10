import { ChildProcess, spawn, execFile } from 'child_process'
import { promisify } from 'node:util'
import axios from 'axios'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import { CoreState, LogEntry } from '@shared/types'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'
import { LogLines } from '../utils/log-lines'
import { parseMihomoLog } from '@shared/logs'

const runFile = promisify(execFile)

export class MihomoProcessManager extends EventEmitter {
  private childProcess: ChildProcess | null = null
  private state: CoreState = 'stopped'
  private binaryPath: string | null = null
  private explicitStop = false
  private startSequence = 0

  constructor() {
    super()
  }

  getState(): CoreState {
    return this.state
  }

  private setState(newState: CoreState): void {
    if (this.state !== newState) {
      this.state = newState
      logger.info(`Mihomo core state changed to: ${newState}`)
      this.emit('state-change', newState)
    }
  }

  private async resolveBinaryPath(): Promise<string | null> {
    if (this.binaryPath && existsSync(this.binaryPath)) return this.binaryPath
    const paths = getAppPaths()
    if (existsSync(paths.coreBinaryPath)) {
      this.binaryPath = paths.coreBinaryPath
      return this.binaryPath
    }

    logger.warn(`Mihomo binary not found at ${paths.coreBinaryPath}. Core will be simulated until installed.`)
    this.binaryPath = null
    return null
  }

  async start(
    workDir: string,
    configPath: string,
    controllerPort: number,
    secret: string
  ): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') {
      logger.warn('Mihomo core is already running or starting')
      return
    }
    if (this.childProcess) {
      throw new Error('The previous Mihomo process has not stopped yet')
    }

    const sequence = ++this.startSequence
    this.explicitStop = false
    this.setState('starting')

    const binary = await this.resolveBinaryPath()
    if (sequence !== this.startSequence || this.explicitStop || this.getState() !== 'starting') return
    if (!binary) {
      logger.warn('Cannot spawn Mihomo core binary: binary not found. Running in mock/standby mode.')
      this.setState('error')
      this.emit('log', {
        type: 'warning',
        payload: 'Mihomo core binary missing. Run "pnpm prepare:resources" to download core.',
        time: new Date().toISOString(),
        source: 'mihomo'
      } as LogEntry)
      throw new Error('Mihomo core binary is missing. Run pnpm prepare:resources before connecting.')
    }

    const args = [
      '-d',
      workDir,
      '-f',
      configPath,
      '-ext-ctl',
      `127.0.0.1:${controllerPort}`
    ]

    if (secret) {
      args.push('-secret', secret)
    }

    const sanitizedArgs = args.map((arg, idx) => (args[idx - 1] === '-secret' ? '[REDACTED]' : arg))
    logger.info(`Spawning Mihomo: ${binary} ${sanitizedArgs.join(' ')}`)

    let exitedPrematurely = false
    let exitCode: number | null = null

    try {
      const spawned = spawn(binary, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.childProcess = spawned

      const onPrematureExit = (code: number | null) => {
        if (this.startSequence === sequence && !this.explicitStop) {
          exitedPrematurely = true
          exitCode = code
        }
      }
      spawned.once('exit', onPrematureExit)

      const receiveLine = (line: string, fallback: string) => {
        const entry = parseMihomoLog(line, fallback)
        if (!entry) return
        const isTunError = entry.payload.includes('Start TUN listening error') || entry.payload.includes('configure tun interface')
        if (isTunError) entry.type = 'error'
        logger.writeEntry(entry)
        this.emit('log', entry)
        if (isTunError) this.emit('tun-error', entry.payload)
      }
      const stdout = new LogLines((line) => receiveLine(line, 'info'))
      const stderr = new LogLines((line) => receiveLine(line, 'warning'))
      spawned.stdout?.on('data', (data: Buffer) => stdout.push(data))
      spawned.stderr?.on('data', (data: Buffer) => stderr.push(data))
      spawned.stdout?.on('end', () => stdout.end())
      spawned.stderr?.on('end', () => stderr.end())
      spawned.on('close', () => { stdout.end(); stderr.end() })

      spawned.on('error', (err) => {
        if (this.childProcess !== spawned) return
        logger.error('Failed to spawn Mihomo process', err)
        if (!spawned.pid) this.childProcess = null
        this.setState('error')
      })

      spawned.on('exit', (code, signal) => {
        logger.info(`Mihomo process exited with code ${code}, signal ${signal}`)
        if (this.childProcess !== spawned) return
        this.childProcess = null
        if (!this.explicitStop) {
          this.setState('error')
        } else {
          this.setState('stopped')
        }
      })

      await this.waitForReady(spawned, controllerPort, secret, sequence, () => exitedPrematurely, () => exitCode)
    } catch (err) {
      logger.error('Error starting Mihomo process', err)
      if (sequence === this.startSequence && !this.explicitStop) {
        const cleanup = this.stop()
        const cleanupSequence = this.startSequence
        try { await cleanup }
        catch (stopError) { logger.error('Failed to clean up unsuccessful Mihomo startup', stopError) }
        if (this.startSequence === cleanupSequence) this.setState('error')
      }
      throw err
    }
  }

  private async waitForReady(
    child: ChildProcess,
    port: number,
    secret: string,
    sequence: number,
    isPrematurelyExited: () => boolean,
    getExitCode: () => number | null
  ): Promise<void> {
    const deadline = Date.now() + 15_000
    const current = () => this.childProcess === child && !this.explicitStop && this.state === 'starting' && this.startSequence === sequence
    while (current() && Date.now() < deadline) {
      if (isPrematurelyExited()) {
        throw new Error(`Mihomo process terminated prematurely with exit code ${getExitCode()}`)
      }
      try {
        const { data } = await axios.get(`http://127.0.0.1:${port}/version`, {
          proxy: false, timeout: 500,
          headers: secret ? { Authorization: `Bearer ${secret}` } : undefined
        })
        if (current() && typeof data?.version === 'string') {
          this.setState('running')
          return
        }
      } catch { /* The controller may still be loading its configuration. */ }
      if (current()) await new Promise<void>((resolve) => setTimeout(resolve, 200))
    }
    if (isPrematurelyExited()) {
      throw new Error(`Mihomo process terminated prematurely with exit code ${getExitCode()}`)
    }
    // An old probe must never change a replacement process's state.
    if (this.startSequence !== sequence || this.explicitStop) return
    if (this.state === 'starting') this.setState('error')
    throw new Error('Mihomo controller did not become ready within 15 seconds')
  }

  async stop(): Promise<void> {
    this.startSequence++
    const child = this.childProcess
    if (!child) {
      this.setState('stopped')
      return
    }

    this.explicitStop = true
    logger.info('Stopping Mihomo core process...')

    // Wait for this child's exit before a replacement can bind the same ports.
    // Keep the handle on failure so another start cannot orphan a live core.
    await new Promise<void>((resolve, reject) => {
      const onExit = () => { clearTimeout(timer); resolve() }
      const timer = setTimeout(() => {
        child.removeListener('exit', onExit)
        reject(new Error('Timed out waiting for Mihomo to stop'))
      }, 5000)
      child.once('exit', onExit)
      try {
        if (process.platform === 'win32' && child.pid) {
          try {
            execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, (error) => {
              if (error && this.childProcess === child) child.kill()
            })
          } catch {
            child.kill()
          }
        } else {
          child.kill('SIGTERM')
        }
      } catch (err) {
        clearTimeout(timer)
        child.removeListener('exit', onExit)
        reject(err)
      }
    })
  }

  async restart(
    workDir: string,
    configPath: string,
    controllerPort: number,
    secret: string
  ): Promise<void> {
    await this.stop()
    await this.start(workDir, configPath, controllerPort, secret)
  }
}
