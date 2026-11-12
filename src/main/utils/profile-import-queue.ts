import { randomUUID } from 'node:crypto'
import { parseSubscriptionImportUrl } from '@shared/clash-url'

export interface PendingProfileImport { id: string; url: string; name?: string }

/** Keep the active request until the user finishes or dismisses its dialog. */
export class ProfileImportQueue {
  private requests: PendingProfileImport[] = []
  private ready = false
  private delivered?: string

  constructor(private send: (request: PendingProfileImport) => void) {}

  add(rawUrl: string): boolean {
    const parsed = parseSubscriptionImportUrl(rawUrl)
    if (!parsed.url) return false
    this.requests.push({ ...parsed, id: randomUUID() })
    this.flush()
    return true
  }

  resetRenderer(): void { this.ready = false; this.delivered = undefined }
  rendererReady(): void { this.ready = true; this.flush() }

  complete(id: string): void {
    if (this.requests[0]?.id !== id || this.delivered !== id) return
    this.requests.shift()
    this.delivered = undefined
    this.flush()
  }

  private flush(): void {
    const request = this.requests[0]
    if (!this.ready || !request || this.delivered === request.id) return
    this.send(request)
    this.delivered = request.id
  }
}
