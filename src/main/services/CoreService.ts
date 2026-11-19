import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import AdmZip from 'adm-zip'
import axios from 'axios'
import {
  type CoreChannel,
  type CoreUpdateStatus,
  type CoreVersionInfo,
  type GithubReleasePayload,
  extractBuildIdentifier,
  matchMihomoAsset,
  parseChecksumFromBody,
  parseChecksumsTxt,
  MIHOMO_REPOSITORY
} from '@shared/core-version'
import { IPC_CHANNELS } from '@shared/ipc'
import { logger } from '../utils/logger'
import { getAppPaths, resolveCoreBinaryPath } from '../utils/paths'
import type { BaseService } from './BaseService'
import type { KernelService } from './KernelService'
import type { SettingService } from './SettingService'
import type { NetworkModeController } from './NetworkModeController'
import { writeFileAtomicAsync } from '../utils/atomicWrite'
import { grantLinuxCoreCapabilities } from '../utils/linux-core-capabilities'

const runFile = promisify(execFile)

interface CoreChannelMetadata {
  version: string
  build?: string
  sha256?: string
  installedAt: string
}

interface CoresMetadata {
  activeChannel: CoreChannel
  stable?: CoreChannelMetadata
  alpha?: CoreChannelMetadata
}

interface InstallationJournal {
  previousChannel: CoreChannel
  hadBinary: boolean
  metadata: CoresMetadata
  committed: boolean
}

export class CoreService implements BaseService {
  private status: CoreUpdateStatus = { state: 'idle' }
  private checking = new Map<CoreChannel, Promise<CoreUpdateStatus>>()
  private operation: Promise<unknown> = Promise.resolve()

  constructor(
    private settingService: SettingService,
    private kernelService: KernelService,
    private broadcast: (channel: string, payload: unknown) => void = () => {},
    private network?: Pick<NetworkModeController, 'runExclusive'>
  ) {}

  async initialize(): Promise<void> {
    const paths = getAppPaths()
    if (!fs.existsSync(paths.coresDir)) {
      fs.mkdirSync(paths.coresDir, { recursive: true })
    }
    // Recovery must finish before KernelService initializes and starts the selected core.
    for (const channel of ['stable', 'alpha'] as const) await this.recoverInstallation(channel)
  }

  private installationPaths(channel: CoreChannel) {
    const directory = path.join(getAppPaths().coresDir, channel)
    return {
      binary: path.join(directory, process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'),
      backup: path.join(directory, 'mihomo.backup'),
      journal: path.join(directory, 'installation.json')
    }
  }

  private async recoverInstallation(channel: CoreChannel): Promise<void> {
    const paths = this.installationPaths(channel)
    if (!fs.existsSync(paths.journal)) return
    const journal = JSON.parse(fs.readFileSync(paths.journal, 'utf8')) as InstallationJournal
    if (!['stable', 'alpha'].includes(journal.previousChannel) || typeof journal.hadBinary !== 'boolean' ||
      typeof journal.committed !== 'boolean' || !journal.metadata || typeof journal.metadata !== 'object') {
      throw new Error(`Invalid ${channel} core installation journal`)
    }
    if (!journal.committed) {
      if (fs.existsSync(paths.backup)) {
        if (fs.existsSync(paths.binary)) await fsPromises.unlink(paths.binary)
        await fsPromises.rename(paths.backup, paths.binary)
      } else if (!journal.hadBinary) {
        if (fs.existsSync(paths.binary)) await fsPromises.unlink(paths.binary)
      } else if (!fs.existsSync(paths.binary)) {
        throw new Error(`Cannot recover the previous ${channel} core: binary and backup are missing`)
      }
      const settings = this.settingService.getSettings()
      await this.settingService.updateSettings({ kernel: { ...settings.kernel, channel: journal.previousChannel } })
      this.writeMetadata(journal.metadata)
      logger.warn(`Recovered interrupted ${channel} core installation`)
    } else if (fs.existsSync(paths.backup)) {
      await fsPromises.unlink(paths.backup)
    }
    await fsPromises.unlink(paths.journal)
  }

  private switchBinary(...args: Parameters<KernelService['switchCoreBinary']>): Promise<void> {
    const action = () => this.kernelService.switchCoreBinary(...args)
    return this.network ? this.network.runExclusive(action) : action()
  }

  async dispose(): Promise<void> {
    this.status = { state: 'idle' }
  }

  getStatus(): CoreUpdateStatus {
    return this.status
  }

  private setStatus(status: CoreUpdateStatus): void {
    this.status = status
    this.broadcast(IPC_CHANNELS.EVENT_CORE_UPDATE_STATUS, status)
  }

  private getMetadataPath(): string {
    return path.join(getAppPaths().coresDir, 'metadata.json')
  }

  private readMetadata(): CoresMetadata {
    const file = this.getMetadataPath()
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as CoresMetadata
      }
    } catch (err) {
      logger.warn(`Failed to parse cores metadata: ${String(err)}`)
    }
    return {
      activeChannel: this.settingService.getSettings().kernel.channel ?? 'stable'
    }
  }

  private writeMetadata(metadata: CoresMetadata): void {
    const file = this.getMetadataPath()
    try {
      fs.writeFileSync(file, JSON.stringify(metadata, null, 2), 'utf8')
    } catch (err) {
      logger.error('Failed to write cores metadata', err)
    }
  }

  async inspectBinary(binaryPath: string): Promise<{ version: string; build?: string; raw: string }> {
    try {
      if (!fs.existsSync(binaryPath)) return { version: 'unknown', raw: '' }
      const { stdout } = await runFile(binaryPath, ['-v'], { windowsHide: true, timeout: 5000 })
      const raw = stdout.trim()
      const match = /Mihomo\s+(?:Meta\s+)?([^\s]+)(?:.*?((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[^\r\n]+))?/i.exec(raw)
      const version = match?.[1] || raw.split('\n')[0].trim()
      const build = match?.[2] ? extractBuildIdentifier(raw) : undefined
      return { version, build: build ?? extractBuildIdentifier(version), raw }
    } catch (err) {
      logger.warn(`Failed to inspect binary at ${binaryPath}: ${String(err)}`)
      return { version: 'unknown', raw: '' }
    }
  }

  async getInfo(): Promise<CoreVersionInfo> {
    const paths = getAppPaths()
    const ext = process.platform === 'win32' ? '.exe' : ''
    const currentChannel = this.settingService.getSettings().kernel.channel ?? 'stable'
    const metadata = this.readMetadata()

    const stableCustomPath = path.join(paths.coresDir, 'stable', `mihomo${ext}`)
    const alphaPath = path.join(paths.coresDir, 'alpha', `mihomo${ext}`)

    const hasAlpha = fs.existsSync(alphaPath)
    const hasCustomStable = fs.existsSync(stableCustomPath)

    const bundledInfo = await this.inspectBinary(paths.coreBinaryPath)
    const stableInfo = hasCustomStable
      ? await this.inspectBinary(stableCustomPath)
      : bundledInfo
    const alphaInfo = hasAlpha ? await this.inspectBinary(alphaPath) : undefined

    const activePath = resolveCoreBinaryPath(currentChannel)
    const activeInfo = currentChannel === 'alpha'
      ? (alphaInfo ?? bundledInfo)
      : stableInfo

    const isBundled = activePath === paths.coreBinaryPath

    return {
      channel: currentChannel,
      installedVersion: activeInfo.version,
      installedBuild: activeInfo.build ?? (currentChannel === 'alpha' ? metadata.alpha?.build : metadata.stable?.build),
      installedPath: activePath,
      isBundled,
      alphaInstalled: hasAlpha,
      alphaVersion: alphaInfo?.version,
      alphaBuild: alphaInfo?.build ?? metadata.alpha?.build,
      stableInstalled: true,
      stableVersion: stableInfo.version,
      stableBuild: stableInfo.build ?? metadata.stable?.build
    }
  }

  private resolveUrl(rawUrl: string): string {
    const mirror = this.settingService.getSettings().kernel.coreDownloadMirror?.trim().replace(/\/+$/, '')
    if (!mirror) return rawUrl
    return `${mirror}/${rawUrl}`
  }

  private async fetchGithub<T>(endpoint: string): Promise<T> {
    const { owner, repo } = MIHOMO_REPOSITORY
    const url = `https://api.github.com/repos/${owner}/${repo}${endpoint}`
    const targetUrl = this.resolveUrl(url)
    const options = {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'QzyriumVPN'
      },
      timeout: 15_000
    }
    try {
      const response = await axios.get<T>(targetUrl, options)
      return response.data
    } catch (directError) {
      if (this.kernelService.getStatus() === 'running') {
        const port = this.settingService.getSettings().kernel.mixedPort
        try {
          const response = await axios.get<T>(url, {
            ...options,
            proxy: { host: '127.0.0.1', port, protocol: 'http' }
          })
          return response.data
        } catch {}
      }
      throw directError
    }
  }

  private async fetchText(url: string, timeout = 10_000): Promise<string> {
    const targetUrl = this.resolveUrl(url)
    const options = { responseType: 'text' as const, timeout }
    try {
      const res = await axios.get<string>(targetUrl, options)
      return res.data
    } catch (err) {
      if (this.kernelService.getStatus() === 'running') {
        const port = this.settingService.getSettings().kernel.mixedPort
        try {
          const res = await axios.get<string>(url, {
            ...options,
            proxy: { host: '127.0.0.1', port, protocol: 'http' }
          })
          return res.data
        } catch {}
      }
      throw err
    }
  }

  async checkUpdate(channel?: CoreChannel): Promise<CoreUpdateStatus> {
    const targetChannel = channel ?? this.settingService.getSettings().kernel.channel ?? 'stable'
    const pending = this.checking.get(targetChannel)
    if (pending) return pending

    this.setStatus({ state: 'checking' })

    const checking = (async (): Promise<CoreUpdateStatus> => {
      try {
        const info = await this.getInfo()
        let release: GithubReleasePayload

        if (targetChannel === 'alpha') {
          release = await this.fetchGithub<GithubReleasePayload>('/releases/tags/Prerelease-Alpha')
        } else {
          release = await this.fetchGithub<GithubReleasePayload>('/releases/latest')
        }

        const asset = matchMihomoAsset(release.assets, process.platform, process.arch)
        if (!asset) {
          throw new Error(`No compatible Mihomo binary found in ${release.tag_name} for ${process.platform}-${process.arch}`)
        }

        let sha256 = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest ?? '')?.[1].toLowerCase()
        // Try checksums.txt asset
        const checksumsAsset = release.assets.find((a) => a.name === 'checksums.txt')
        if (!sha256 && checksumsAsset) {
          try {
            const checksumsData = await this.fetchText(checksumsAsset.browser_download_url, 10_000)
            const parsed = parseChecksumsTxt(checksumsData)
            sha256 = parsed.get(asset.name)
          } catch (checksumErr) {
            logger.warn(`Failed to fetch checksums.txt: ${String(checksumErr)}`)
          }
        }

        if (!sha256 && release.body) {
          sha256 = parseChecksumFromBody(release.body, asset.name) ?? undefined
        }

        // Determine release version and build
        let remoteVersion = release.tag_name
        let remoteBuild: string | undefined

        if (targetChannel === 'alpha') {
          const versionAsset = release.assets.find((a) => a.name === 'version.txt')
          if (versionAsset) {
            try {
              const versionData = await this.fetchText(versionAsset.browser_download_url, 5000)
              const txt = versionData.trim()
              if (txt) {
                remoteVersion = txt
                remoteBuild = extractBuildIdentifier(txt, asset.name)
              }
            } catch {
              // fallback to asset name
            }
          }
          if (!remoteBuild) {
            remoteBuild = extractBuildIdentifier(asset.name, asset.name)
          }
        }

        const currentInstalledVersion = targetChannel === 'alpha' ? info.alphaVersion : info.stableVersion
        const currentInstalledBuild = targetChannel === 'alpha' ? info.alphaBuild : info.stableBuild

        const isInstalled = targetChannel === 'alpha' ? info.alphaInstalled : true
        const isSameVersion = isInstalled && currentInstalledVersion === remoteVersion
        const isSameBuild = !remoteBuild || (isInstalled && currentInstalledBuild === remoteBuild)

        let status: CoreUpdateStatus
        if (isInstalled && isSameVersion && isSameBuild) {
          status = {
            state: 'up-to-date',
            version: remoteVersion,
            build: remoteBuild
          }
        } else {
          status = {
            state: 'available',
            version: remoteVersion,
            build: remoteBuild,
            releaseName: release.name || release.tag_name,
            downloadUrl: asset.browser_download_url,
            sha256,
            releaseDate: release.published_at || release.created_at
          }
        }

        this.setStatus(status)
        return status
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('Core update check failed', err)
        const errorStatus: CoreUpdateStatus = { state: 'error', message }
        this.setStatus(errorStatus)
        return errorStatus
      }
    })().finally(() => {
      this.checking.delete(targetChannel)
    })

    this.checking.set(targetChannel, checking)
    return checking
  }

  private enqueueOperation(action: () => Promise<CoreVersionInfo>): Promise<CoreVersionInfo> {
    const task = this.operation.then(action).catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      const rolledBack = error instanceof Error && 'rolledBack' in error && error.rolledBack === true
      this.setStatus({ state: 'error', message, rolledBack })
      throw error
    })
    this.operation = task.catch(() => {})
    return task
  }

  installCore(channel: CoreChannel): Promise<CoreVersionInfo> {
    return this.enqueueOperation(() => this.installCoreNow(channel))
  }

  private async installCoreNow(channel: CoreChannel): Promise<CoreVersionInfo> {
    const updateCheck = await this.checkUpdate(channel)
    if (updateCheck.state === 'error') {
      throw new Error(updateCheck.message)
    }

    const paths = getAppPaths()
    const ext = process.platform === 'win32' ? '.exe' : ''
    const channelDir = path.join(paths.coresDir, channel)
    const targetBinary = path.join(channelDir, `mihomo${ext}`)

    // Reuse an installed or bundled binary when this channel is already current.
    if (updateCheck.state === 'up-to-date') {
      return this.switchChannelNow(channel)
    }

    if (updateCheck.state !== 'available') {
      throw new Error('No core update available for download')
    }

    const { downloadUrl, sha256: expectedSha256, version: remoteVersion, build: remoteBuild } = updateCheck

    if (!expectedSha256 || !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
      throw new Error('No trusted SHA-256 checksum available for the core archive')
    }

    this.setStatus({ state: 'downloading', percent: 0, version: remoteVersion, build: remoteBuild })
    logger.info(`Downloading Mihomo core for channel ${channel} from ${downloadUrl}...`)

    const targetDownloadUrl = this.resolveUrl(downloadUrl)
    let response: { data: ArrayBuffer }
    const downloadOptions = {
      responseType: 'arraybuffer' as const,
      timeout: 120_000,
      onDownloadProgress: (progress: { loaded: number; total?: number }) => {
        if (progress.total) {
          const percent = Math.min(100, Math.max(0, Math.round((progress.loaded / progress.total) * 100)))
          this.setStatus({ state: 'downloading', percent, version: remoteVersion, build: remoteBuild })
        }
      }
    }
    try {
      response = await axios.get<ArrayBuffer>(targetDownloadUrl, downloadOptions)
    } catch (downloadErr) {
      if (this.kernelService.getStatus() === 'running') {
        const port = this.settingService.getSettings().kernel.mixedPort
        response = await axios.get<ArrayBuffer>(downloadUrl, {
          ...downloadOptions,
          proxy: { host: '127.0.0.1', port, protocol: 'http' }
        })
      } else {
        throw downloadErr
      }
    }

    const archiveBuffer = Buffer.from(response.data)

    // Verify SHA-256 of downloaded archive
    const actualSha256 = createHash('sha256').update(archiveBuffer).digest('hex')
    if (expectedSha256.toLowerCase() !== actualSha256.toLowerCase()) {
      const error = new Error(`SHA-256 verification mismatch for ${path.basename(downloadUrl)}: expected ${expectedSha256}, got ${actualSha256}`)
      logger.error(error.message)
      this.setStatus({ state: 'error', message: error.message })
      throw error
    }

    // Unpack executable
    let executableBytes: Buffer
    if (downloadUrl.endsWith('.zip')) {
      const zip = new AdmZip(archiveBuffer)
      const exeEntry = zip.getEntries().find((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.exe'))
      if (!exeEntry) {
        throw new Error('Downloaded zip archive does not contain a Mihomo executable')
      }
      executableBytes = exeEntry.getData()
    } else if (downloadUrl.endsWith('.gz')) {
      executableBytes = zlib.gunzipSync(archiveBuffer)
    } else {
      throw new Error(`Unsupported archive format: ${downloadUrl}`)
    }

    // Prepare target directory and temporary file
    await fsPromises.mkdir(channelDir, { recursive: true })
    const tempPath = path.join(channelDir, `mihomo-${randomUUID()}.tmp`)

    try {
      await fsPromises.writeFile(tempPath, executableBytes, {
        mode: process.platform === 'win32' ? 0o644 : 0o755
      })
      await grantLinuxCoreCapabilities(tempPath)

      // Test candidate binary before overwriting current installation
      this.setStatus({ state: 'testing', version: remoteVersion })

      const installation = this.installationPaths(channel)
      let journal: InstallationJournal | undefined
      await this.switchBinary(channel, tempPath, {
        promote: async () => {
          // Write intent before either rename so startup can recover every crash window.
          await this.recoverInstallation(channel)
          journal = {
            previousChannel: this.settingService.getSettings().kernel.channel ?? 'stable',
            hadBinary: fs.existsSync(targetBinary),
            metadata: this.readMetadata(),
            committed: false
          }
          await writeFileAtomicAsync(installation.journal, JSON.stringify(journal))
          if (fs.existsSync(targetBinary)) {
            await fsPromises.rename(targetBinary, installation.backup)
          }
          await fsPromises.rename(tempPath, targetBinary)
          return targetBinary
        },
        rollback: () => this.recoverInstallation(channel),
        commit: async () => {
          if (!journal) throw new Error('Core installation journal is missing')
          const metadata = this.readMetadata()
          metadata.activeChannel = channel
          metadata[channel] = {
            version: remoteVersion, build: remoteBuild, sha256: actualSha256,
            installedAt: new Date().toISOString()
          }
          this.writeMetadata(metadata)
          await writeFileAtomicAsync(installation.journal, JSON.stringify({ ...journal, committed: true }))
        }
      })
      await this.recoverInstallation(channel).catch(error => logger.warn(`Core installed; cleanup will retry at startup: ${String(error)}`))

      this.setStatus({ state: 'installed', version: remoteVersion, build: remoteBuild })
      return await this.getInfo()
    } catch (switchError) {
      if (fs.existsSync(tempPath)) {
        await fsPromises.unlink(tempPath).catch(() => {})
      }
      const message = switchError instanceof Error ? switchError.message : String(switchError)
      const rolledBack = switchError instanceof Error && 'rolledBack' in switchError && switchError.rolledBack === true
      this.setStatus({ state: 'error', message, rolledBack })
      throw switchError
    }
  }

  switchChannel(channel: CoreChannel): Promise<CoreVersionInfo> {
    return this.enqueueOperation(() => this.switchChannelNow(channel))
  }

  private async switchChannelNow(channel: CoreChannel): Promise<CoreVersionInfo> {
    const paths = getAppPaths()
    const ext = process.platform === 'win32' ? '.exe' : ''
    const targetBinary = channel === 'alpha'
      ? path.join(paths.coresDir, 'alpha', `mihomo${ext}`)
      : path.join(paths.coresDir, 'stable', `mihomo${ext}`)

    const hasBinary = fs.existsSync(targetBinary)
    const effectiveBinary = hasBinary
      ? targetBinary
      : (channel === 'stable' ? paths.coreBinaryPath : null)

    if (!effectiveBinary || !fs.existsSync(effectiveBinary)) {
      // Binary for this channel is not installed yet: download and install it!
      logger.info(`Core binary for channel ${channel} not found locally; initiating download...`)
      return await this.installCoreNow(channel)
    }

    this.setStatus({ state: 'testing' })
    try {
      await this.switchBinary(channel, effectiveBinary)
      const metadata = this.readMetadata()
      metadata.activeChannel = channel
      this.writeMetadata(metadata)
      const info = await this.getInfo()
      this.setStatus({ state: 'installed', version: info.installedVersion, build: info.installedBuild })
      return info
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const rolledBack = err instanceof Error && 'rolledBack' in err && err.rolledBack === true
      this.setStatus({ state: 'error', message, rolledBack })
      throw err
    }
  }
}
