import fs from 'fs'
import path from 'path'
import { getAppPaths } from './paths'

export class Logger {
  private logFilePath: string

  constructor(filename = 'qzyrium.log') {
    const paths = getAppPaths()
    this.logFilePath = path.join(paths.logsDir, filename)
  }

  private write(level: string, message: string): void {
    const time = new Date().toISOString()
    const formatted = `[${time}] [${level.toUpperCase()}] ${message}\n`
    console.log(formatted.trim())
    try {
      fs.appendFileSync(this.logFilePath, formatted, { encoding: 'utf-8' })
    } catch {
      // Ignore write errors to prevent crashes
    }
  }

  info(msg: string): void {
    this.write('info', msg)
  }

  warn(msg: string): void {
    this.write('warn', msg)
  }

  error(msg: string, err?: unknown): void {
    const errStr = err instanceof Error ? `\n${err.stack || err.message}` : err ? ` ${String(err)}` : ''
    this.write('error', `${msg}${errStr}`)
  }

  debug(msg: string): void {
    this.write('debug', msg)
  }
}

export const logger = new Logger()
