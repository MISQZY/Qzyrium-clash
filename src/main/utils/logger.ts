import fs from 'fs'
import path from 'path'
import { getAppPaths } from './paths'
import { normalizeLogLevel, cleanLogMessage } from '@shared/logs'
import type { LogEntry } from '@shared/types'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_ARCHIVES = 20
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const ARCHIVE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-\d+)?\.log$/

export class Logger {
  private logFilePath = ''
  private bytes = 0
  private day = ''
  private reportedFailure = false

  // Resolve paths after userData migration and only in the instance holding the lock.
  initialize(directory?: string): void {
    if (this.logFilePath) return
    try {
      directory ??= getAppPaths().logsDir
      fs.mkdirSync(directory, { recursive: true })
      const latest = path.join(directory, 'latest.log')
      if (fs.existsSync(latest) && fs.statSync(latest).size > 0) this.archive(latest)
      for (const name of ['qzyrium.log.1', 'qzyrium.log']) {
        const legacy = path.join(directory, name)
        if (fs.existsSync(legacy) && fs.statSync(legacy).size > 0) this.archive(legacy)
      }
      fs.writeFileSync(latest, '', 'utf8')
      this.logFilePath = latest
      this.day = new Date().toISOString().slice(0, 10)
      this.prune()
    } catch (error) {
      this.reportFailure(error)
    }
  }

  private archive(file: string): void {
    const stamp = fs.statSync(file).mtime.toISOString().replace(/[:.]/g, '-')
    const directory = path.dirname(file)
    let destination = path.join(directory, `${stamp}.log`)
    let suffix = 0
    while (fs.existsSync(destination)) destination = path.join(directory, `${stamp}-${++suffix}.log`)
    fs.renameSync(file, destination)
  }

  private prune(): void {
    try { this.pruneArchives() } catch (error) { this.reportFailure(error) }
  }

  private pruneArchives(): void {
    const directory = path.dirname(this.logFilePath)
    const archives = fs.readdirSync(directory)
      .filter((name) => ARCHIVE_PATTERN.test(name))
      .map((name) => ({ name, modified: fs.statSync(path.join(directory, name)).mtimeMs }))
      .sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name))
    for (const [index, file] of archives.entries()) {
      if (index >= MAX_ARCHIVES || Date.now() - file.modified > MAX_AGE_MS) {
        fs.unlinkSync(path.join(directory, file.name))
      }
    }
  }

  private reportFailure(error: unknown): void {
    if (this.reportedFailure) return
    this.reportedFailure = true
    console.error('[Logger] Unable to maintain log files:', error)
  }

  writeEntry(entry: LogEntry): void {
    const level = normalizeLogLevel(entry.type)
    const timestamp = Number.isNaN(Date.parse(entry.time)) ? new Date().toISOString() : new Date(entry.time).toISOString()
    const source = entry.source === 'mihomo' ? 'mihomo' : 'app'
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${source}] `
    const formatted = cleanLogMessage(entry.payload).split('\n').map((line) => `${prefix}${line}\n`).join('')
    const output = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log
    output(formatted.trimEnd())
    if (!this.logFilePath) return
    try {
      // Preserve very large messages without allowing a single record to exceed
      // the file limit. The Unicode flag keeps surrogate pairs intact.
      const records = Buffer.byteLength(formatted, 'utf8') <= MAX_BYTES ? [formatted]
        : cleanLogMessage(entry.payload).split('\n').flatMap((line) =>
          (line.match(/[\s\S]{1,65536}/gu) ?? ['']).map((part) => `${prefix}${part}\n`))
      for (const record of records) {
        const size = Buffer.byteLength(record, 'utf8')
        const day = new Date().toISOString().slice(0, 10)
        const rotate = this.bytes > 0 && (this.bytes + size > MAX_BYTES || this.day !== day)
        if (rotate) {
          this.archive(this.logFilePath)
          this.bytes = 0
        }
        fs.appendFileSync(this.logFilePath, record, 'utf8')
        this.bytes += size
        this.day = day
        this.reportedFailure = false
        if (rotate) this.prune()
      }
    } catch (error) {
      this.reportFailure(error)
    }
  }

  private write(type: string, payload: string): void {
    this.writeEntry({ type, payload, time: new Date().toISOString(), source: 'app' })
  }

  info(msg: string): void { this.write('info', msg) }
  warn(msg: string): void { this.write('warning', msg) }
  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? `\n${err.stack || err.message}` : err !== undefined ? ` ${String(err)}` : ''
    this.write('error', `${msg}${detail}`)
  }
  debug(msg: string): void { this.write('debug', msg) }
}

export const logger = new Logger()
