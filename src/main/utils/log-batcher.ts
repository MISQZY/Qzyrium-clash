import type { LogEntry } from '@shared/types'
import { LogBuffer } from '@shared/log-buffer'

/** Bound both the number and bytes of queued IPC records. Disk logging is independent. */
export class LogBatcher {
  private buffer = new LogBuffer(500)
  private bytes = 0
  private timer?: ReturnType<typeof setTimeout>
  constructor(private send: (entries: LogEntry[]) => void) {}
  push(entry: LogEntry): void {
    const bytes = Buffer.byteLength(entry.payload, 'utf8')
    if (bytes > 2 * 1024 * 1024) return
    if (this.bytes + bytes > 2 * 1024 * 1024) { this.buffer.clear(); this.bytes = 0 }
    this.buffer.push(entry)
    this.bytes += bytes
    this.timer ??= setTimeout(() => this.flush(), 100)
  }
  flush(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    const entries = this.buffer.snapshot()
    this.buffer.clear()
    this.bytes = 0
    if (entries.length) this.send(entries)
  }
  clear(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.buffer.clear()
    this.bytes = 0
  }
}
