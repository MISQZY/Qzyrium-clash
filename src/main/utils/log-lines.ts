import { StringDecoder } from 'node:string_decoder'

// Pipes may split both a line and a UTF-8 character across data events.
export class LogLines {
  private decoder = new StringDecoder('utf8')
  private pending = ''

  constructor(private readonly onLine: (line: string) => void) {}

  push(chunk: Buffer): void {
    this.pending += this.decoder.write(chunk)
    this.drain()
  }

  end(): void {
    this.pending += this.decoder.end()
    this.drain()
    if (this.pending) this.onLine(this.pending)
    this.pending = ''
  }

  private drain(): void {
    let newline: number
    while ((newline = this.pending.indexOf('\n')) !== -1) {
      this.onLine(this.pending.slice(0, newline).replace(/\r$/, ''))
      this.pending = this.pending.slice(newline + 1)
    }
    // Bound memory even if a broken child never writes a newline.
    while (this.pending.length > 64 * 1024) {
      this.onLine(this.pending.slice(0, 64 * 1024))
      this.pending = this.pending.slice(64 * 1024)
    }
  }
}
