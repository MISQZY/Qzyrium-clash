import fs from 'fs'
import path from 'path'
import axios, { type AxiosResponse } from 'axios'
import { isDeepStrictEqual } from 'node:util'
import { AddProfileDto } from '@shared/ipc'
import { ProfileItem, CustomRuleItem, ProfileUserInfo } from '@shared/profile'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { subscriptionName } from '../utils/subscription-name'
import { parseSubscriptionImportUrl } from '@shared/clash-url'
import type { SettingService } from './SettingService'
import { DEFAULT_APP_CONFIG, subscriptionUserAgent } from '@shared/app-config'
import { writeFileAtomicAsync } from '../utils/atomicWrite'
import { validateProfileContent } from '../utils/profile-validator'

function parseUserInfo(header?: unknown): ProfileUserInfo | undefined {
  if (!header || typeof header !== 'string') return undefined
  const info: ProfileUserInfo = {}
  const pairs = header.split(';')
  for (const pair of pairs) {
    const [k, v] = pair.trim().split('=')
    if (!k || !v) continue
    const key = k.toLowerCase().trim()
    const num = Number(v.trim())
    if (!isNaN(num)) {
      if (key === 'upload') info.upload = num
      else if (key === 'download') info.download = num
      else if (key === 'total') info.total = num
      else if (key === 'expire') info.expire = num
    }
  }
  return Object.keys(info).length > 0 ? info : undefined
}

function getHeader(headers: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!headers) return undefined
  const target = key.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) {
      if (typeof v === 'string') return v
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
    }
  }
  return undefined
}

function parseProfileLogo(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:') return trimmed
  } catch {
    // Invalid URL
  }
  return undefined
}

function parseSupportUrl(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:') return trimmed
  } catch {
    // Invalid URL
  }
  return undefined
}

function parseAnnounce(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined
  let text = raw.trim()
  if (!text) return undefined

  if (/^base64:/i.test(text)) {
    const encoded = text.slice(7).trim()
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8')
      if (decoded && !decoded.includes('\ufffd')) return decoded.trim()
    } catch {
      // fallback
    }
  }

  if (text.includes('%')) {
    try {
      text = decodeURIComponent(text)
    } catch {
      // keep original
    }
  }

  if (/^[A-Za-z0-9+/=]+$/.test(text) && text.length > 8 && text.length % 4 === 0) {
    try {
      const decoded = Buffer.from(text, 'base64').toString('utf-8')
      // eslint-disable-next-line no-control-regex -- Reject binary data while retaining tabs and line breaks.
      if (/[\p{L}\p{N}]/u.test(decoded) && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(decoded)) {
        text = decoded
      }
    } catch {
      // keep original
    }
  }
  return text.trim() || undefined
}

function sanitizeUrl(rawUrl?: string): string {
  if (!rawUrl) return ''
  try {
    const u = new URL(rawUrl)
    for (const key of ['token', 'secret', 'password', 'key', 'auth']) {
      if (u.searchParams.has(key)) u.searchParams.set(key, '[REDACTED]')
    }
    return u.toString()
  } catch {
    return '[REDACTED_URL]'
  }
}

function isValidRemoteSubscriptionUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname.toLowerCase()
    if (hostname === '169.254.169.254') return false
    return true
  } catch {
    return false
  }
}

export class ProfileService implements BaseService {
  private profiles: ProfileItem[] = []
  private activeProfileId: string | null = null
  private profilesFilePath: string
  private profilesDir: string
  private metadataSave: Promise<void> = Promise.resolve()
  private updates = new Map<string, Promise<boolean>>()
  private isCoreRunning?: () => boolean

  constructor(private settingService?: SettingService) {
    const paths = getAppPaths()
    this.profilesFilePath = paths.profilesFilePath
    this.profilesDir = paths.profilesDir
  }

  setCoreStatusProvider(provider: () => boolean): void {
    this.isCoreRunning = provider
  }

  private async downloadSubscription(url: string, userAgent?: string, updateViaProxy?: boolean): Promise<AxiosResponse<unknown>> {
    const ua = userAgent || subscriptionUserAgent(this.settingService?.getSettings().general.userAgent)
    const requestOptions = {
      timeout: 15000,
      headers: {
        'User-Agent': ua
      }
    }
    const mixedPort = this.settingService?.getSettings().kernel.mixedPort || 7895
    if (updateViaProxy && this.isCoreRunning?.()) {
      try {
        return await axios.get(url, {
          ...requestOptions,
          proxy: { host: '127.0.0.1', port: mixedPort, protocol: 'http' }
        })
      } catch (err) {
        logger.warn(`Failed to fetch subscription through proxy: ${String(err)}. Falling back to direct connection.`)
      }
    }
    return axios.get(url, requestOptions)
  }

  private validateProfileId(id: string): string {
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      throw new Error(`Invalid profile id format: ${id}`)
    }
    const resolved = path.resolve(this.profilesDir, `${id}.yaml`)
    const boundary = path.resolve(this.profilesDir)
    if (!resolved.startsWith(boundary + path.sep) && resolved !== boundary) {
      throw new Error(`Directory traversal detected: ${id}`)
    }
    return resolved
  }

  private parseProfiles(raw: string): ProfileItem[] {
    const profiles: unknown = JSON.parse(raw)
    if (!Array.isArray(profiles)) throw new Error('Invalid profiles metadata: expected an array')
    const ids = new Set<string>()
    for (const item of profiles) {
      if (!item || typeof item.name !== 'string' || !['remote', 'local'].includes(item.type)) throw new Error('Invalid profile metadata')
      this.validateProfileId(item.id)
      if (ids.has(item.id)) throw new Error(`Duplicate profile id: ${item.id}`)
      ids.add(item.id)
    }
    return profiles
  }

  async initialize(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.profilesFilePath, 'utf-8')
      this.profiles = this.parseProfiles(raw)
      this.activeProfileId = this.settingService?.getSettings().activeProfileId ?? null
      logger.info(`Loaded ${this.profiles.length} profiles from disk`)
    } catch (err) {
      try {
        const bak = await fs.promises.readFile(`${this.profilesFilePath}.bak`, 'utf-8')
        this.profiles = this.parseProfiles(bak)
        this.activeProfileId = this.settingService?.getSettings().activeProfileId ?? null
        await writeFileAtomicAsync(this.profilesFilePath, JSON.stringify(this.profiles, null, 2)).catch((error) => logger.error('Failed to restore primary profiles file', error))
        logger.warn('Recovered profiles metadata from backup file (.bak)')
      } catch {
        this.profiles = []
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') await this.saveProfilesList()
        else logger.error('Failed to load profiles metadata', err)
      }
    }
  }

  async dispose(): Promise<void> {
    await this.saveProfilesList()
  }

  getProfiles(): ProfileItem[] {
    return [...this.profiles]
  }

  getActiveProfile(): ProfileItem | null {
    if (!this.activeProfileId) return this.profiles[0] || null
    return this.profiles.find((p) => p.id === this.activeProfileId) || this.profiles[0] || null
  }

  async setActiveProfile(id: string): Promise<void> {
    const found = this.profiles.find((p) => p.id === id)
    if (!found) {
      throw new Error(`Profile ${id} not found`)
    }
    const content = await this.getProfileContent(id)
    if (content === null) throw new Error(`Profile file is missing: ${id}`)
    await validateProfileContent(content, this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG, found.customRules)
    await this.settingService?.updateSettings({ activeProfileId: id })
    this.activeProfileId = id
    logger.info(`Active profile switched to: ${found.name} (${id})`)
  }

  async setSelectedProxy(id: string, group: string, node: string): Promise<void> {
    const profile = this.profiles.find(item => item.id === id)
    if (!profile) throw new Error(`Profile ${id} not found`)
    const previous = profile.selectedGroupProxies
    profile.selectedGroupProxies = { ...previous, [group]: node }
    try { await this.saveProfilesList() }
    catch (error) { profile.selectedGroupProxies = previous; throw error }
  }

  async getProfileContent(id: string): Promise<string | null> {
    const filePath = this.validateProfileId(id)
    try {
      return await fs.promises.readFile(filePath, 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      return null
    }
  }

  getCustomRules(id: string): CustomRuleItem[] {
    const found = this.profiles.find((p) => p.id === id)
    return found?.customRules || []
  }

  async saveCustomRules(id: string, rules: CustomRuleItem[]): Promise<boolean> {
    const found = this.profiles.find((p) => p.id === id)
    if (!found) throw new Error(`Profile ${id} not found`)
    if (isDeepStrictEqual(found.customRules || [], rules)) return false
    const content = await this.getProfileContent(id)
    if (content === null) throw new Error(`Profile file is missing: ${id}`)
    await validateProfileContent(content, this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG, rules)
    found.customRules = rules
    found.updatedAt = Date.now()
    await this.saveProfilesList()
    logger.info(`Saved ${rules.length} custom rules for profile ${found.name} (${id})`)
    return true
  }

  async saveProfileContent(id: string, content: string): Promise<boolean> {
    const filePath = this.validateProfileId(id)
    if (await this.getProfileContent(id) === content) return false
    await validateProfileContent(content, this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG, this.getCustomRules(id))
    await writeFileAtomicAsync(filePath, content, 'utf-8', true)
    const found = this.profiles.find((p) => p.id === id)
    if (found) {
      found.updatedAt = Date.now()
      await this.saveProfilesList()
    }
    logger.info(`Saved raw YAML content for profile ${id}`)
    return true
  }

  async updateProfileInfo(id: string, patch: Partial<ProfileItem>): Promise<ProfileItem> {
    const found = this.profiles.find((p) => p.id === id)
    if (!found) throw new Error(`Profile ${id} not found`)
    if (patch.interval !== undefined && (!Number.isInteger(patch.interval) || patch.interval < 15 || patch.interval > 43200)) throw new Error('Profile update interval must be between 15 and 43200 minutes')
    if (patch.name !== undefined) {
      found.name = patch.name.trim()
      found.nameSource = 'manual'
    }
    if (patch.url !== undefined) {
      found.url = patch.url.trim()
    }
    if (patch.autoUpdate !== undefined) {
      found.autoUpdate = patch.autoUpdate
    }
    if (patch.interval !== undefined) {
      found.interval = patch.interval
    }
    if (patch.customUA !== undefined) {
      found.customUA = patch.customUA.trim() || undefined
    }
    if (patch.updateViaProxy !== undefined) {
      found.updateViaProxy = Boolean(patch.updateViaProxy)
    }
    found.updatedAt = Date.now()
    await this.saveProfilesList()
    logger.info(`Updated info for profile ${found.name} (${id})`)
    return found
  }

  async addProfile(dto: AddProfileDto): Promise<ProfileItem> {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
    let content = dto.content || ''
    let providerName: string | undefined
    let userInfo: ProfileUserInfo | undefined
    let profileLogo: string | undefined
    let announce: string | undefined
    let supportUrl: string | undefined

    let targetUrl = dto.url?.trim()
    if (targetUrl) {
      const parsed = parseSubscriptionImportUrl(targetUrl)
      targetUrl = parsed.url
      if (!dto.name?.trim() && parsed.name) {
        dto.name = parsed.name
      }
    }

    if (dto.type === 'remote' && targetUrl) {
      if (!isValidRemoteSubscriptionUrl(targetUrl)) {
        throw new Error('Invalid remote subscription URL scheme')
      }
      logger.info(`Fetching remote subscription from: ${sanitizeUrl(targetUrl)}`)
      const res = await this.downloadSubscription(targetUrl, undefined, dto.updateViaProxy)
      content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
      providerName = subscriptionName(res.headers, content)
      userInfo = parseUserInfo(res.headers?.['subscription-userinfo'])
      profileLogo = parseProfileLogo(getHeader(res.headers, 'profile-logo'))
      announce = parseAnnounce(getHeader(res.headers, 'announce') || getHeader(res.headers, 'profile-announce'))
      supportUrl = parseSupportUrl(getHeader(res.headers, 'support-url'))
    }

    const filePath = this.validateProfileId(id)
    await validateProfileContent(content, this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG)
    await writeFileAtomicAsync(filePath, content, 'utf-8', true)

    const item: ProfileItem = {
      id,
      name: dto.name?.trim() || providerName || 'Без названия',
      nameSource: dto.name?.trim() ? 'manual' : providerName ? 'subscription' : 'fallback',
      url: targetUrl,
      type: dto.type,
      updatedAt: Date.now(),
      updateViaProxy: dto.updateViaProxy ? true : undefined,
      userInfo,
      profileLogo,
      announce,
      supportUrl
    }

    if (!this.getActiveProfile()) {
      this.activeProfileId = id
      await this.settingService?.updateSettings({ activeProfileId: id })
    }
    this.profiles.push(item)
    await this.saveProfilesList()

    logger.info(`Added profile: ${item.name} (${id})`)
    return item
  }

  updateProfile(id: string): Promise<boolean> {
    const pending = this.updates.get(id)
    if (pending) return pending
    const update = this.fetchProfileUpdate(id).finally(() => this.updates.delete(id))
    this.updates.set(id, update)
    return update
  }

  private async fetchProfileUpdate(id: string): Promise<boolean> {
    const item = this.profiles.find((p) => p.id === id)
    if (!item) throw new Error(`Profile not found: ${id}`)

    if (item.type === 'remote' && item.url) {
      if (!isValidRemoteSubscriptionUrl(item.url)) {
        throw new Error('Invalid remote subscription URL scheme')
      }
      logger.info(`Updating remote profile ${item.name} from ${sanitizeUrl(item.url)}`)
      const res = await this.downloadSubscription(item.url, item.customUA, item.updateViaProxy)
      const content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
      // A subscription can be removed while its download is in flight.
      if (!this.profiles.includes(item)) return false
      const changed = await this.saveProfileContent(id, content)
      const providerName = subscriptionName(res.headers, content)
      const userInfo = parseUserInfo(res.headers?.['subscription-userinfo'])
      const profileLogo = parseProfileLogo(getHeader(res.headers, 'profile-logo'))
      const announce = parseAnnounce(getHeader(res.headers, 'announce') || getHeader(res.headers, 'profile-announce'))
      const supportUrl = parseSupportUrl(getHeader(res.headers, 'support-url'))
      let metadataChanged = false
      if (userInfo && !isDeepStrictEqual(item.userInfo, userInfo)) {
        item.userInfo = userInfo
        metadataChanged = true
      }
      if (profileLogo !== item.profileLogo) {
        item.profileLogo = profileLogo
        metadataChanged = true
      }
      if (announce !== item.announce) {
        item.announce = announce
        metadataChanged = true
      }
      if (supportUrl !== item.supportUrl) {
        item.supportUrl = supportUrl
        metadataChanged = true
      }
      // Existing profiles without provenance retain their user-chosen names.
      if (providerName && item.nameSource && item.nameSource !== 'manual' && (item.name !== providerName || item.nameSource === 'fallback')) {
        item.name = providerName
        item.nameSource = 'subscription'
        metadataChanged = true
      }
      if (metadataChanged) {
        await this.saveProfilesList()
      }
      return changed
    }
    return false
  }

  async deleteProfile(id: string): Promise<void> {
    const filePath = this.validateProfileId(id)
    this.profiles = this.profiles.filter((p) => p.id !== id)
    try {
      await fs.promises.unlink(filePath)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    if (this.activeProfileId === id) {
      this.activeProfileId = this.profiles[0]?.id || null
      await this.settingService?.updateSettings({ activeProfileId: this.activeProfileId })
    }
    await this.saveProfilesList()
    logger.info(`Deleted profile: ${id}`)
  }

  private saveProfilesList(): Promise<void> {
    const content = JSON.stringify(this.profiles, null, 2)
    // Preserve write order so a slower earlier save cannot overwrite newer metadata.
    const save = this.metadataSave.then(() => writeFileAtomicAsync(this.profilesFilePath, content, 'utf-8', true))
    this.metadataSave = save.catch((err) => logger.error('Failed to save profiles list', err))
    return save
  }
}
