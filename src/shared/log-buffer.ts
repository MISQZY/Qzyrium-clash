import type { LogEntry } from './types'

interface RecordEntry { sequence: number; entry: LogEntry }

class Ring {
  private items: RecordEntry[] = []
  private cursor = 0
  constructor(private limit: number) {}
  push(item: RecordEntry): void {
    if (this.items.length < this.limit) this.items.push(item)
    else { this.items[this.cursor] = item; this.cursor = (this.cursor + 1) % this.limit }
  }
  values(): RecordEntry[] {
    return this.items.length < this.limit ? [...this.items]
      : [...this.items.slice(this.cursor), ...this.items.slice(0, this.cursor)]
  }
}

/** Constant-time insertion; each source keeps its own bounded history. */
export class LogBuffer {
  private sequence = 0
  private sources: { app: Ring; mihomo: Ring }
  revision = 0
  constructor(private limit = 300) {
    this.sources = { app: new Ring(limit), mihomo: new Ring(limit) }
  }
  push(entry: LogEntry): void {
    this.sources[entry.source ?? 'app'].push({ sequence: this.sequence++, entry })
    this.revision++
  }
  snapshot(): LogEntry[] {
    return [...this.sources.app.values(), ...this.sources.mihomo.values()]
      .sort((a, b) => a.sequence - b.sequence).map(record => record.entry)
  }
  resize(limit: number): void {
    if (limit === this.limit) return
    const entries = this.snapshot()
    this.limit = limit
    this.sources = { app: new Ring(limit), mihomo: new Ring(limit) }
    for (const entry of entries) this.push(entry)
    this.revision++
  }
  clear(source?: 'app' | 'mihomo'): void {
    if (source) this.sources[source] = new Ring(this.limit)
    else this.sources = { app: new Ring(this.limit), mihomo: new Ring(this.limit) }
    this.revision++
  }
}
