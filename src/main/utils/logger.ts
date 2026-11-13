import fs from 'fs'
import path from 'path'
import { getAppPaths } from './paths'
import { normalizeLogLevel, cleanLogMessage } from '@shared/logs'
import type { LogEntry } from '@shared/types'
import type { AppConfig } from '@shared/app-config'
import type { FileHandle } from 'node:fs/promises'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_ARCHIVES = 20
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const ARCHIVE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-\d+)?\.log$/
const MAX_PENDING_BYTES = 32 * 1024 * 1024
const MAX_PENDING_RECORDS = 8192
interface PendingRecord { text: string; size: number; day: string; maxBytes: number }

class LogFile {
  private enabled = true
  private maxBytes = MAX_BYTES
  private maxArchives = MAX_ARCHIVES
  private maxAgeMs = MAX_AGE_MS
  private logFilePath = ''
  private bytes = 0
  private day = ''
  private reportedFailure = false
  private handle?: FileHandle
  private queue: PendingRecord[] = []
  private pendingBytes = 0
  private writing: Promise<void> | null = null
  private closed = false
  private needsPrune = false

  configure(enabled: boolean, sizeMb: number, archives: number, days: number): void {
    this.enabled = enabled
    this.maxBytes = sizeMb * 1024 * 1024
    this.maxArchives = archives
    this.maxAgeMs = days * 86400000
    if (this.logFilePath) { this.needsPrune = true; this.schedule() }
  }

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
      if (index >= this.maxArchives || Date.now() - file.modified > this.maxAgeMs) {
        fs.unlinkSync(path.join(directory, file.name))
      }
    }
  }

  private reportFailure(error: unknown): void {
    if (this.reportedFailure) return
    this.reportedFailure = true
    console.error('[Logger] Unable to maintain log files:', error)
  }

  private schedule(): void {
    if (this.writing || this.closed) return
    this.writing = Promise.resolve().then(() => this.drain()).finally(() => { this.writing = null })
  }

  /** Wait for accepted records, including any pending rotation/retention work. */
  async flush(): Promise<void> {
    while (this.writing) await this.writing
  }

  async close(): Promise<void> {
    this.closed = true
    await this.flush()
    await this.closeHandle()
  }

  private async closeHandle(): Promise<void> {
    const handle = this.handle
    this.handle = undefined
    await handle?.close().catch(error => this.reportFailure(error))
  }

  private async archiveAsync(): Promise<void> {
    await this.closeHandle()
    const stamp = (await fs.promises.stat(this.logFilePath)).mtime.toISOString().replace(/[:.]/g, '-')
    const directory = path.dirname(this.logFilePath)
    let destination = path.join(directory, `${stamp}.log`)
    let suffix = 0
    const exists = async (file: string) => {
      try { await fs.promises.access(file); return true }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
    }
    while (await exists(destination)) destination = path.join(directory, `${stamp}-${++suffix}.log`)
    await fs.promises.rename(this.logFilePath, destination)
    this.bytes = 0
    this.needsPrune = true
  }

  private async pruneAsync(): Promise<void> {
    this.needsPrune = false
    try {
      const directory = path.dirname(this.logFilePath)
      const archives = await Promise.all((await fs.promises.readdir(directory))
        .filter(name => ARCHIVE_PATTERN.test(name))
        .map(async name => ({ name, modified: (await fs.promises.stat(path.join(directory, name))).mtimeMs })))
      archives.sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name))
      for (const [index, file] of archives.entries()) {
        if (index >= this.maxArchives || Date.now() - file.modified > this.maxAgeMs) await fs.promises.unlink(path.join(directory, file.name))
      }
    } catch (error) { this.reportFailure(error) }
  }

  private async drain(): Promise<void> {
    while (this.queue.length || this.needsPrune) {
      if (this.needsPrune) await this.pruneAsync()
      const first = this.queue[0]
      if (!first) continue
      let count = 1
      let size = first.size
      while (count < this.queue.length) {
        const next = this.queue[count]
        if (next.day !== first.day || next.maxBytes !== first.maxBytes || size + next.size > 256 * 1024 || this.bytes + size + next.size > first.maxBytes) break
        size += next.size
        count++
      }
      const records = this.queue.splice(0, count)
      try {
        if (!this.handle) {
          this.handle = await fs.promises.open(this.logFilePath, 'a')
          this.bytes = (await this.handle.stat()).size
        }
        if (this.bytes > 0 && (this.bytes + size > first.maxBytes || this.day !== first.day)) {
          await this.archiveAsync()
          this.handle = await fs.promises.open(this.logFilePath, 'a')
        }
        await this.handle.writeFile(records.map(record => record.text).join(''), 'utf8')
        this.bytes += size
        this.day = first.day
        this.reportedFailure = false
      } catch (error) {
        this.reportFailure(error)
        await this.closeHandle()
      } finally { this.pendingBytes -= size }
    }
  }

  writeEntry(entry: LogEntry): void {
    const level = normalizeLogLevel(entry.type)
    const timestamp = Number.isNaN(Date.parse(entry.time)) ? new Date().toISOString() : new Date(entry.time).toISOString()
    const source = entry.source === 'mihomo' ? 'mihomo' : 'app'
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${source}] `
    const formatted = cleanLogMessage(entry.payload).split('\n').map((line) => `${prefix}${line}\n`).join('')
    const output = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log
    output(formatted.trimEnd())
    if (!this.logFilePath || !this.enabled || this.closed) return
    try {
      // Preserve very large messages without allowing a single record to exceed
      // the file limit. The Unicode flag keeps surrogate pairs intact.
      const records = Buffer.byteLength(formatted, 'utf8') <= this.maxBytes ? [formatted]
        : cleanLogMessage(entry.payload).split('\n').flatMap((line) =>
          (line.match(/[\s\S]{1,65536}/gu) ?? ['']).map((part) => `${prefix}${part}\n`))
      for (const record of records) {
        const size = Buffer.byteLength(record, 'utf8')
        const day = new Date().toISOString().slice(0, 10)
        if (this.pendingBytes + size > MAX_PENDING_BYTES || this.queue.length >= MAX_PENDING_RECORDS) {
          this.reportFailure(new Error('Log write queue is full; disk records are being dropped'))
          break
        }
        this.queue.push({ text: record, size, day, maxBytes: this.maxBytes })
        this.pendingBytes += size
      }
      this.schedule()
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

export class Logger extends LogFile {
  private readonly connections = new LogFile()
  private appLogHandler?: (entry: LogEntry) => void

  configureSettings(general: AppConfig['general']): void {
    super.configure(general.appLogEnabled ?? true, general.appLogMaxSizeMb ?? 10, general.appLogArchives ?? 20, general.appLogRetentionDays ?? 30)
    this.connections.configure(general.connectionLogEnabled ?? true, general.connectionLogMaxSizeMb ?? 10, general.connectionLogArchives ?? 20, general.connectionLogRetentionDays ?? 30)
  }

  override initialize(directory = getAppPaths().logsDir): void {
    // Existing mixed logs remain in the root directory for reference.
    super.initialize(path.join(directory, 'app'))
    this.connections.initialize(path.join(directory, 'connections'))
  }

  setAppLogHandler(handler: (entry: LogEntry) => void): void {
    this.appLogHandler = handler
  }

  override async flush(): Promise<void> {
    await Promise.all([super.flush(), this.connections.flush()])
  }

  override async close(): Promise<void> {
    await Promise.all([super.close(), this.connections.close()])
  }

  override writeEntry(entry: LogEntry): void {
    if (entry.source === 'mihomo') {
      this.connections.writeEntry(entry)
    } else {
      const sanitized = { ...entry, source: 'app' as const, payload: cleanLogMessage(entry.payload) }
      super.writeEntry(sanitized)
      this.appLogHandler?.(sanitized)
    }
  }
}

export const logger = new Logger()
