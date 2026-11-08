import { ChildProcess, spawn, execSync } from 'child_process'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import { CoreState, LogEntry } from '@shared/types'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'

export class MihomoProcessManager extends EventEmitter {
  private childProcess: ChildProcess | null = null
  private state: CoreState = 'stopped'
  private binaryPath: string | null = null
  private explicitStop = false

  constructor() {
    super()
    this.resolveBinaryPath()
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

  private resolveBinaryPath(): string | null {
    const paths = getAppPaths()
    if (existsSync(paths.coreBinaryPath)) {
      this.binaryPath = paths.coreBinaryPath
      return this.binaryPath
    }

    // Check system PATH
    try {
      const cmd = process.platform === 'win32' ? 'where mihomo.exe' : 'which mihomo'
      const stdout = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      const firstLine = stdout.split(/\r?\n/)[0]
      if (firstLine && existsSync(firstLine)) {
        this.binaryPath = firstLine
        logger.info(`Discovered Mihomo core in system PATH: ${this.binaryPath}`)
        return this.binaryPath
      }
    } catch {
      // not in system PATH
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

    this.explicitStop = false
    this.setState('starting')

    const binary = this.resolveBinaryPath()
    if (!binary) {
      logger.warn('Cannot spawn Mihomo core binary: binary not found. Running in mock/standby mode.')
      this.setState('error')
      this.emit('log', {
        type: 'warning',
        payload: 'Mihomo core binary missing. Run "pnpm prepare:resources" to download core.',
        time: new Date().toLocaleTimeString()
      } as LogEntry)
      return
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

    logger.info(`Spawning Mihomo: ${binary} ${args.join(' ')}`)

    try {
      this.childProcess = spawn(binary, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      this.childProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8').trim()
        if (text) {
          logger.debug(`[Mihomo stdout] ${text}`)
          this.emit('log', {
            type: 'info',
            payload: text,
            time: new Date().toLocaleTimeString()
          } as LogEntry)
        }
      })

      this.childProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8').trim()
        if (text) {
          logger.warn(`[Mihomo stderr] ${text}`)
          this.emit('log', {
            type: 'warning',
            payload: text,
            time: new Date().toLocaleTimeString()
          } as LogEntry)
        }
      })

      this.childProcess.on('error', (err) => {
        logger.error('Failed to spawn Mihomo process', err)
        this.setState('error')
      })

      this.childProcess.on('exit', (code, signal) => {
        logger.info(`Mihomo process exited with code ${code}, signal ${signal}`)
        this.childProcess = null
        if (!this.explicitStop) {
          this.setState('error')
        } else {
          this.setState('stopped')
        }
      })

      this.setState('running')
    } catch (err) {
      logger.error('Error starting Mihomo process', err)
      this.setState('error')
      throw err
    }
  }

  async stop(): Promise<void> {
    if (!this.childProcess) {
      this.setState('stopped')
      return
    }

    this.explicitStop = true
    logger.info('Stopping Mihomo core process...')

    try {
      if (process.platform === 'win32' && this.childProcess.pid) {
        try {
          execSync(`taskkill /pid ${this.childProcess.pid} /t /f`, { stdio: 'ignore' })
        } catch {
          this.childProcess.kill()
        }
      } else {
        this.childProcess.kill('SIGTERM')
      }
    } catch (err) {
      logger.error('Error stopping Mihomo process', err)
    }

    this.childProcess = null
    this.setState('stopped')
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
