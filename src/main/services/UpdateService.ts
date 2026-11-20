import { app, net, session } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { IPC_CHANNELS } from '@shared/ipc'
import { compareVersions, isStableVersion, RELEASE_REPOSITORY, type AppUpdaterStatus, type WhatsNewEntry, type WhatsNewPayload } from '@shared/updater'
import type { BaseService } from './BaseService'
import { getAppPaths } from '../utils/paths'
import { writeFileAtomic } from '../utils/atomicWrite'
import { logger } from '../utils/logger'

interface GithubRelease { tag_name: string; draft: boolean; prerelease: boolean; body?: string }
interface GithubCompare { commits: { commit: { message: string } }[] }
const BUMP_COMMIT = /^chore:\s*bump(?:\s+version)?\s+to\s+\d/i

export interface UpdateProxyProvider {
  isCoreRunning: () => boolean
  startIdleCore: () => Promise<void>
  getMixedPort: () => Promise<number>
}

export class UpdateService implements BaseService {
  private status: AppUpdaterStatus = { state: 'idle' }
  private checking: Promise<AppUpdaterStatus> | null = null
  private downloading: Promise<void> | null = null
  private whatsNew: Promise<WhatsNewPayload | null> = Promise.resolve(null)
  private listeners: Array<() => void> = []
  private installing = false
  public isQuittingForUpdate = false
  private checkInProgress = false
  private lifetime = new AbortController()

  constructor(
    private broadcast: (channel: string, payload: unknown) => void,
    private prepareInstall: () => Promise<void>,
    private autoCheckEnabled: () => boolean = () => true,
    private recoverInstall: () => Promise<void> = async () => {},
    private proxyFallback?: UpdateProxyProvider
  ) {}

  async initialize(): Promise<void> {
    this.whatsNew = this.loadWhatsNew()
    // NSIS needs installation metadata. Portable executables and dev runs cannot update in place.
    const isSupportedPlatform = process.platform === 'win32' || (process.platform === 'linux' && !!process.env.APPIMAGE)
    if (!app.isPackaged || !isSupportedPlatform || process.env.PORTABLE_EXECUTABLE_DIR) {
      this.setStatus({ state: 'unsupported' })
      return
    }
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false
    autoUpdater.allowDowngrade = false
    autoUpdater.setFeedURL({ provider: 'github', ...RELEASE_REPOSITORY })
    this.listen('checking-for-update', () => this.setStatus({ state: 'checking' }))
    this.listen('update-not-available', () => {
      this.setStatus({ state: 'not-available' })
      void this.clearProxy()
    })
    this.listen('update-available', (info: { version: string }) => this.setStatus({ state: 'available', version: info.version }))
    this.listen('download-progress', (progress: { percent: number }) => this.setStatus({ state: 'downloading', percent: Math.min(100, Math.max(0, Math.round(progress.percent))) }))
    this.listen('update-downloaded', (info: { version: string }) => {
      if (this.installing) return
      this.installing = true
      this.setStatus({ state: 'downloaded', version: info.version })
      void this.clearProxy()
      // Cleanup finishes before the installer starts replacing files or relaunching the app.
      void this.prepareInstall().then(() => {
        this.isQuittingForUpdate = true
        if (typeof app?.releaseSingleInstanceLock === 'function') {
          app.releaseSingleInstanceLock()
        }
        autoUpdater.quitAndInstall(true, true)
      }).catch((error) => this.fail(error))
    })
    this.listen('before-quit-for-update' as any, () => {
      this.isQuittingForUpdate = true
      if (typeof app?.releaseSingleInstanceLock === 'function') {
        app.releaseSingleInstanceLock()
      }
    })
    // Check failures also reject checkForUpdates(); handle them once in the retry loop.
    this.listen('error', (error: Error) => { if (!this.checkInProgress) this.fail(error) })
    if (this.autoCheckEnabled()) void this.checkUpdates()
  }

  private listen(event: Parameters<typeof autoUpdater.on>[0], listener: Parameters<typeof autoUpdater.on>[1]): void {
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
    void this.clearProxy()
    if (this.installing) {
      this.installing = false
      this.isQuittingForUpdate = false
      void this.recoverInstall().catch((recoveryError) => logger.error('Unable to restore session after failed installation', recoveryError))
    }
  }

  getStatus(): AppUpdaterStatus { return this.status }
  getWhatsNew(): Promise<WhatsNewPayload | null> { return this.whatsNew }

  private async clearProxy(): Promise<void> {
    try {
      const updaterSession = (autoUpdater as unknown as { netSession?: { setProxy?: (opts: { mode: string }) => Promise<void> } }).netSession
      if (updaterSession?.setProxy) {
        await updaterSession.setProxy({ mode: 'direct' })
      }
      if (typeof session !== 'undefined' && session?.defaultSession?.setProxy) {
        await session.defaultSession.setProxy({ mode: 'direct' })
      }
    } catch (err) {
      logger.warn(`Could not clear update proxy rules: ${String(err)}`)
    }
  }

  private async applyProxy(port: number): Promise<void> {
    const proxyRules = `http=127.0.0.1:${port};https=127.0.0.1:${port}`
    try {
      const updaterSession = (autoUpdater as unknown as { netSession?: { setProxy?: (opts: { proxyRules: string }) => Promise<void> } }).netSession
      if (updaterSession?.setProxy) {
        await updaterSession.setProxy({ proxyRules })
      }
      if (typeof session !== 'undefined' && session?.defaultSession?.setProxy) {
        await session.defaultSession.setProxy({ proxyRules })
      }
    } catch (err) {
      logger.warn(`Could not set update proxy rules: ${String(err)}`)
    }
  }

  checkUpdates(): Promise<AppUpdaterStatus> {
    if (this.lifetime.signal.aborted) return Promise.resolve(this.status)
    if (this.checking) return this.checking
    if (this.downloading || ['unsupported', 'available', 'downloading', 'downloaded'].includes(this.status.state)) return Promise.resolve(this.status)
    this.checkInProgress = true
    this.checking = (async () => {
      let triedProxy = false
      for (let attempt = 0; ; attempt++) {
        try {
          await autoUpdater.checkForUpdates()
          break
        } catch (error) {
          if (this.lifetime.signal.aborted) break
          if (!triedProxy && this.proxyFallback) {
            triedProxy = true
            try {
              if (!this.proxyFallback.isCoreRunning()) {
                await this.proxyFallback.startIdleCore()
              }
              const port = await this.proxyFallback.getMixedPort()
              await this.applyProxy(port)
              logger.info(`Update check falling back to proxy on port ${port}`)
              continue
            } catch (proxyError) {
              logger.warn(`Proxy fallback before update check failed: ${String(proxyError)}`)
            }
          }
          // Starting TUN can change routes while the initial request is in flight.
          if (attempt >= 2 || !(error instanceof Error) || !error.message.includes('ERR_NETWORK_CHANGED')) {
            this.fail(error)
            break
          }
          logger.warn('Network changed during update check; retrying after routes settle')
          try { await delay(2000 * (attempt + 1), undefined, { signal: this.lifetime.signal }) } catch { break }
        }
      }
      return this.status
    })().finally(() => { this.checking = null; this.checkInProgress = false })
    return this.checking
  }

  downloadUpdate(): Promise<void> {
    if (this.downloading) return this.downloading
    if (this.status.state !== 'available') return Promise.resolve()
    this.setStatus({ state: 'downloading', percent: 0 })
    this.downloading = (async () => {
      try {
        await autoUpdater.downloadUpdate()
      } catch (error) {
        if (this.proxyFallback) {
          try {
            if (!this.proxyFallback.isCoreRunning()) {
              await this.proxyFallback.startIdleCore()
            }
            const port = await this.proxyFallback.getMixedPort()
            await this.applyProxy(port)
            logger.info(`Retrying update download via proxy on port ${port}`)
            await autoUpdater.downloadUpdate()
            return
          } catch (proxyError) {
            logger.warn(`Proxy update download retry failed: ${String(proxyError)}`)
          }
        }
        this.fail(error)
      } finally {
        this.downloading = null
      }
    })()
    return this.downloading
  }

  private async githubGet<T>(endpoint: string): Promise<T> {
    const { owner, repo } = RELEASE_REPOSITORY
    const url = `https://api.github.com/repos/${owner}/${repo}${endpoint}`
    try {
      const response = await net.fetch(url, {
        headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000)
      })
      if (!response.ok) throw new Error(`GitHub API: ${response.status}`)
      return await response.json() as T
    } catch (directError) {
      if (this.proxyFallback) {
        try {
          if (!this.proxyFallback.isCoreRunning()) {
            await this.proxyFallback.startIdleCore()
          }
          const port = await this.proxyFallback.getMixedPort()
          await this.applyProxy(port)
          const response = await net.fetch(url, {
            headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000)
          })
          if (!response.ok) throw new Error(`GitHub API via proxy: ${response.status}`, { cause: directError })
          return await response.json() as T
        } catch (proxyError) {
          logger.warn(`GitHub API request via proxy failed: ${String(proxyError)}`)
        }
      }
      throw directError
    }
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
          // Compare returns oldest first; reverse all pages to show the newest changes first.
          notes.reverse()
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
    this.lifetime.abort()
    for (const remove of this.listeners) remove()
    this.listeners = []
    await this.clearProxy()
  }
}
