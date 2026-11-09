import { app, net } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import { compareVersions, isStableVersion, RELEASE_REPOSITORY, type AppUpdaterStatus, type WhatsNewEntry, type WhatsNewPayload } from '@shared/updater'
import type { BaseService } from './BaseService'
import { getAppPaths } from '../utils/paths'
import { writeFileAtomic } from '../utils/atomicWrite'
import { logger } from '../utils/logger'

interface GithubRelease { tag_name: string; draft: boolean; prerelease: boolean; body?: string }
interface GithubCompare { commits: { commit: { message: string } }[] }
const BUMP_COMMIT = /^chore:\s*bump(?:\s+version)?\s+to\s+\d/i

export class UpdateService implements BaseService {
  private status: AppUpdaterStatus = { state: 'idle' }
  private checking: Promise<AppUpdaterStatus> | null = null
  private downloading: Promise<void> | null = null
  private whatsNew: Promise<WhatsNewPayload | null> = Promise.resolve(null)
  private listeners: Array<() => void> = []

  constructor(private broadcast: (channel: string, payload: unknown) => void, private prepareInstall: () => Promise<void>) {}

  async initialize(): Promise<void> {
    this.whatsNew = this.loadWhatsNew()
    // NSIS needs installation metadata. Portable executables and dev runs cannot update in place.
    if (!app.isPackaged || process.platform !== 'win32' || process.env.PORTABLE_EXECUTABLE_DIR) {
      this.setStatus({ state: 'unsupported' })
      return
    }
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false
    autoUpdater.allowDowngrade = false
    autoUpdater.setFeedURL({ provider: 'github', ...RELEASE_REPOSITORY })
    this.listen('checking-for-update', () => this.setStatus({ state: 'checking' }))
    this.listen('update-not-available', () => this.setStatus({ state: 'not-available' }))
    this.listen('update-available', (info: { version: string }) => this.setStatus({ state: 'available', version: info.version }))
    this.listen('download-progress', (progress: { percent: number }) => this.setStatus({ state: 'downloading', percent: Math.min(100, Math.max(0, Math.round(progress.percent))) }))
    this.listen('update-downloaded', (info: { version: string }) => {
      this.setStatus({ state: 'downloaded', version: info.version })
      // Cleanup finishes before the installer starts replacing files or relaunching the app.
      void this.prepareInstall().then(() => autoUpdater.quitAndInstall(true, true)).catch((error) => this.fail(error))
    })
    this.listen('error', (error: Error) => this.fail(error))
    void this.checkUpdates()
  }

  private listen(event: Parameters<typeof autoUpdater.on>[0], listener: (...args: any[]) => void): void {
    autoUpdater.on(event, listener)
    this.listeners.push(() => autoUpdater.removeListener(event, listener))
  }

  private setStatus(status: AppUpdaterStatus): void {
    this.status = status
    this.broadcast(IPC_CHANNELS.EVENT_UPDATER_STATUS, status)
  }

  private fail(error: unknown): void {
    logger.error('Application update failed', error)
    this.setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) })
  }

  getStatus(): AppUpdaterStatus { return this.status }
  getWhatsNew(): Promise<WhatsNewPayload | null> { return this.whatsNew }

  checkUpdates(): Promise<AppUpdaterStatus> {
    if (this.checking) return this.checking
    if (this.downloading || ['unsupported', 'available', 'downloading', 'downloaded'].includes(this.status.state)) return Promise.resolve(this.status)
    this.checking = (async () => {
      try { await autoUpdater.checkForUpdates() } catch (error) { this.fail(error) }
      return this.status
    })().finally(() => { this.checking = null })
    return this.checking
  }

  downloadUpdate(): Promise<void> {
    if (this.downloading) return this.downloading
    if (this.status.state !== 'available') return Promise.resolve()
    this.setStatus({ state: 'downloading', percent: 0 })
    this.downloading = autoUpdater.downloadUpdate().then(() => {}).catch((error) => { this.fail(error) }).finally(() => { this.downloading = null })
    return this.downloading
  }

  private async githubGet<T>(endpoint: string): Promise<T> {
    const { owner, repo } = RELEASE_REPOSITORY
    const response = await net.fetch(`https://api.github.com/repos/${owner}/${repo}${endpoint}`, {
      headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) throw new Error(`GitHub API: ${response.status}`)
    return await response.json() as T
  }

  private async loadWhatsNew(): Promise<WhatsNewPayload | null> {
    if (!app.isPackaged) return null
    const filename = path.join(getAppPaths().userData, 'app-version.json')
    const currentVersion = app.getVersion()
    try {
      let lastVersion: unknown
      try { lastVersion = JSON.parse(readFileSync(filename, 'utf8')).lastSeenVersion } catch { /* First launch. */ }
      // Record before requesting notes, as in OBSAddon: network failures must not repeat the announcement.
      writeFileAtomic(filename, JSON.stringify({ lastSeenVersion: currentVersion }))
      if (typeof lastVersion !== 'string' || !isStableVersion(lastVersion) || !isStableVersion(currentVersion) || compareVersions(currentVersion, lastVersion) <= 0) return null
      const releases: GithubRelease[] = []
      // GitHub orders by publication date. Sort by version and page until reaching the old version.
      for (let page = 1; page <= 10; page++) {
        const batch = await this.githubGet<GithubRelease[]>(`/releases?per_page=100&page=${page}`)
        releases.push(...batch.filter((release) => !release.draft && !release.prerelease && isStableVersion(release.tag_name)))
        if (batch.length < 100 || releases.some((release) => compareVersions(release.tag_name, lastVersion) <= 0)) break
      }
      releases.sort((a, b) => compareVersions(b.tag_name, a.tag_name))
      const entries = await Promise.all(releases.map(async (release, index): Promise<WhatsNewEntry | null> => {
        if (compareVersions(release.tag_name, lastVersion) <= 0 || compareVersions(release.tag_name, currentVersion) > 0) return null
        const previousTag = releases[index + 1]?.tag_name ?? `v${lastVersion}`
        let notes: string[] = []
        try {
          for (let page = 1; page <= 10; page++) {
            const comparison = await this.githubGet<GithubCompare>(`/compare/${encodeURIComponent(previousTag)}...${encodeURIComponent(release.tag_name)}?per_page=100&page=${page}`)
            notes.push(...comparison.commits.map(({ commit }) => commit.message.split('\n')[0].trim()).filter((subject) => subject && !subject.startsWith('Merge ') && !BUMP_COMMIT.test(subject)))
            if (comparison.commits.length < 100) break
          }
        } catch (error) {
          logger.warn(`Unable to load commit notes for ${release.tag_name}: ${String(error)}`)
          notes = release.body?.trim() ? [release.body.trim()] : []
        }
        return { version: release.tag_name.replace(/^v/, ''), notes }
      }))
      const visible = entries.filter((entry): entry is WhatsNewEntry => entry !== null)
      return visible.length ? { fromVersion: lastVersion, toVersion: currentVersion, entries: visible } : null
    } catch (error) {
      logger.error('Unable to load release notes', error)
      return null
    }
  }

  async dispose(): Promise<void> {
    for (const remove of this.listeners) remove()
    this.listeners = []
  }
}
