export type AppUpdaterStatus =
  | { state: 'idle' | 'checking' | 'not-available' | 'unsupported' }
  | { state: 'available' | 'downloaded'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'error'; message: string }

export interface WhatsNewEntry {
  version: string
  notes: string[]
}

export interface WhatsNewPayload {
  fromVersion: string
  toVersion: string
  entries: WhatsNewEntry[]
}

export const RELEASE_REPOSITORY = { owner: 'MISQZY', repo: 'Qzyrium-clash' } as const

/** Release tags use stable X.Y.Z versions. Ignore prereleases when building the changelog. */
export function isStableVersion(version: string): boolean {
  return /^v?\d+\.\d+\.\d+$/.test(version)
}

export function compareVersions(a: string, b: string): number {
  const left = a.replace(/^v/, '').split('.').map(Number)
  const right = b.replace(/^v/, '').split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    const difference = left[index] - right[index]
    if (difference) return difference
  }
  return 0
}
