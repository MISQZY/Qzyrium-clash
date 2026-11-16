export type CoreChannel = 'stable' | 'alpha'

export interface CoreVersionInfo {
  channel: CoreChannel
  installedVersion: string
  installedBuild?: string
  installedPath: string
  isBundled: boolean
  alphaInstalled: boolean
  alphaVersion?: string
  alphaBuild?: string
  stableInstalled: boolean
  stableVersion?: string
  stableBuild?: string
}

export type CoreUpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date'; version: string; build?: string }
  | { state: 'available'; version: string; build?: string; releaseName?: string; downloadUrl: string; sha256?: string; releaseDate?: string }
  | { state: 'downloading'; percent: number; version?: string; build?: string }
  | { state: 'testing'; version?: string }
  | { state: 'installed'; version: string; build?: string }
  | { state: 'error'; message: string; rolledBack?: boolean }

export interface GithubReleaseAsset {
  name: string
  digest?: string | null
  browser_download_url: string
  size?: number
  updated_at?: string
  created_at?: string
}

export interface GithubReleasePayload {
  tag_name: string
  name?: string
  body?: string
  published_at?: string
  created_at?: string
  assets: GithubReleaseAsset[]
}

export const MIHOMO_REPOSITORY = { owner: 'MetaCubeX', repo: 'mihomo' } as const

/**
 * Match the optimal Mihomo release asset for the given platform and architecture.
 * Prioritizes maximum compatibility (e.g. v1 / compatible builds) matching resources.lock.json.
 */
export function matchMihomoAsset(
  assets: GithubReleaseAsset[],
  platform: string = process.platform,
  arch: string = process.arch
): GithubReleaseAsset | null {
  const isWin = platform === 'win32'
  const isDarwin = platform === 'darwin'
  const isLinux = platform === 'linux'
  const ext = isWin ? '.zip' : '.gz'

  // Exclude non-matching archive formats and specific Go versions (e.g. go120, go124)
  const candidates = assets.filter((a) => a.name.endsWith(ext) && !/-go1\d+/i.test(a.name))

  if (isWin) {
    if (arch === 'x64') {
      return (
        candidates.find((a) => a.name.includes('windows-amd64-v1')) ||
        candidates.find((a) => a.name.includes('windows-amd64-compatible')) ||
        candidates.find((a) => a.name.includes('windows-amd64')) ||
        null
      )
    }
    if (arch === 'ia32') {
      return candidates.find((a) => a.name.includes('windows-386')) || null
    }
    if (arch === 'arm64') {
      return candidates.find((a) => a.name.includes('windows-arm64')) || null
    }
  }

  if (isDarwin) {
    if (arch === 'arm64') {
      return candidates.find((a) => a.name.includes('darwin-arm64')) || null
    }
    if (arch === 'x64') {
      return (
        candidates.find((a) => a.name.includes('darwin-amd64-v1')) ||
        candidates.find((a) => a.name.includes('darwin-amd64-compatible')) ||
        candidates.find((a) => a.name.includes('darwin-amd64')) ||
        null
      )
    }
  }

  if (isLinux) {
    if (arch === 'arm64') {
      return candidates.find((a) => a.name.includes('linux-arm64')) || null
    }
    if (arch === 'x64') {
      return (
        candidates.find((a) => a.name.includes('linux-amd64-v1')) ||
        candidates.find((a) => a.name.includes('linux-amd64-compatible')) ||
        candidates.find((a) => a.name.includes('linux-amd64')) ||
        null
      )
    }
  }

  return null
}

/**
 * Parse standard checksums.txt containing lines formatted as:
 * "<hash>  ./<filename>" or "<hash>  <filename>"
 */
export function parseChecksumsTxt(content: string): Map<string, string> {
  const result = new Map<string, string>()
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = /^([a-f0-9]{64})\s+(?:\.\/)?([^\s\r\n]+)$/i.exec(trimmed)
    if (match) {
      const hash = match[1].toLowerCase()
      const rawFile = match[2].trim()
      const filename = rawFile.replace(/^.*[/\\]/, '')
      result.set(filename, hash)
    }
  }
  return result
}

/**
 * Parse sha256 checksum from GitHub release body notes if checksums.txt is not present.
 */
export function parseChecksumFromBody(body: string, filename: string): string | null {
  if (!body) return null
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(?:\\*|#)?\\s*${escaped}[\\s\\S]*?sha256[:\\s]+([a-f0-9]{64})`, 'i')
  const match = regex.exec(body)
  return match ? match[1].toLowerCase() : null
}

/**
 * Extract build commit or date from asset name or version string.
 */
export function extractBuildIdentifier(versionString: string, assetName?: string): string | undefined {
  if (assetName) {
    const commitMatch = /alpha-([a-f0-9]{7,40})/i.exec(assetName)
    if (commitMatch) return commitMatch[1]
  }
  const versionCommitMatch = /alpha-([a-f0-9]{7,40})/i.exec(versionString)
  if (versionCommitMatch) return versionCommitMatch[1]

  const dateMatch = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]+\s+\d+\s+[\d:]+\s+UTC\s+\d{4})/i.exec(versionString)
  if (dateMatch) return dateMatch[1]

  return undefined
}
