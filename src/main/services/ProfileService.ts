import { ProfileRepository, type ProfileSelectionChange } from './ProfileRepository'
import { SubscriptionClient } from '../core/SubscriptionClient'
import { sanitizeUrl } from '../utils/subscription-url'
import { isDeepStrictEqual } from 'node:util'
import { AddProfileDto } from '@shared/ipc'
import { ProfileItem, CustomRuleItem, ProfileUserInfo, ProfileInfoPatch } from '@shared/profile'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { parseSubscriptionImportUrl } from '@shared/clash-url'
import type { SettingService } from './SettingService'
import { DEFAULT_APP_CONFIG } from '@shared/app-config'
import { prepareProfileContent, validateProfileContent } from '../utils/profile-validator'
import { SubscriptionDownloadError } from '../utils/subscription-error'
import { convertSubscriptionToClashYaml } from '@shared/subscription-converter'

const sameSubscription = (current: ProfileItem | undefined, requested: ProfileItem): boolean =>
  !!current && current.type === requested.type && current.url === requested.url && current.customUA === requested.customUA &&
  !!current.updateViaProxy === !!requested.updateViaProxy && !!current.sendHwid === !!requested.sendHwid

export class ProfileService implements BaseService {
  private activeProfileId: string | null = null
  private updates = new Map<string, Promise<boolean>>()
  private isCoreRunning?: () => boolean
  private proxyPort?: () => Promise<number>
  private repository: ProfileRepository
  private subscriptions: Pick<SubscriptionClient, 'download'>

  constructor(private settingService?: SettingService, subscriptions?: Pick<SubscriptionClient, 'download'>, repository = new ProfileRepository()) {
    this.subscriptions = subscriptions ?? new SubscriptionClient(
      () => this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG,
      () => this.isCoreRunning?.() ?? false, { proxyPort: () => this.proxyPort?.() ?? Promise.resolve((this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG).kernel.mixedPort) })
    this.repository = repository
  }

  setCoreStatusProvider(provider: () => boolean, proxyPort?: () => Promise<number>): void {
    this.isCoreRunning = provider
    this.proxyPort = proxyPort
  }

  async initialize(): Promise<void> {
    await this.repository.initialize()
    this.activeProfileId = this.settingService?.getSettings().activeProfileId ?? null
  }

  async dispose(): Promise<void> { await this.repository.flush() }

  getProfiles(): ProfileItem[] { return this.repository.list() }
  exportProfiles(): Promise<{ profile: ProfileItem; content: string }[]> { return this.repository.snapshot() }

  getActiveProfile(): ProfileItem | null {
    return this.repository.active(this.activeProfileId)
  }

  async setActiveProfile(id: string): Promise<void> {
    await this.repository.use(id, async profile => {
      const content = await this.repository.content(id)
      if (content === null) throw new Error(`Profile file is missing: ${id}`)
      await validateProfileContent(content, this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG, profile.customRules)
      await this.settingService?.updateSettings({ activeProfileId: id })
      this.activeProfileId = id
      logger.info(`Active profile switched to: ${profile.name} (${id})`)
    })
  }

  async setSelectedProxy(id: string, group: string, node: string): Promise<void> {
    await this.repository.update(id, profile => {
      profile.selectedGroupProxies = { ...profile.selectedGroupProxies, [group]: node }
    })
  }

  getProfileContent(id: string): Promise<string | null> { return this.repository.content(id) }

  getCustomRules(id: string): CustomRuleItem[] { return this.repository.get(id)?.customRules ?? [] }

  async setRuleValidation(id: string, rules: CustomRuleItem[]): Promise<void> {
    const found = this.repository.get(id)
    if (!found || isDeepStrictEqual(found.customRules || [], rules)) return
    await this.repository.update(id, profile => { profile.customRules = structuredClone(rules) })
  }

  async validateCustomRules(id: string, rules: CustomRuleItem[]): Promise<CustomRuleItem[]> {
    const content = await this.getProfileContent(id)
    if (content === null) throw new Error(`Profile file is missing: ${id}`)
    return (await prepareProfileContent(content, this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG, rules)).rules
  }

  async saveCustomRules(id: string, rules: CustomRuleItem[]): Promise<boolean> {
    const found = this.repository.get(id)
    if (!found) throw new Error(`Profile ${id} not found`)
    if (isDeepStrictEqual(found.customRules ?? [], rules)) return false
    await this.repository.update(id, async profile => {
      const content = await this.repository.content(id)
      if (content === null) throw new Error(`Profile file is missing: ${id}`)
      profile.customRules = (await prepareProfileContent(content, this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG, rules)).rules
      profile.updatedAt = Date.now()
    })
    logger.info(`Saved ${rules.length} custom rules for profile ${found.name} (${id})`)
    return true
  }

  async saveProfileContent(id: string, content: string, downloaded = false, requested?: ProfileItem): Promise<boolean> {
    const normalized = convertSubscriptionToClashYaml(content)
    return this.repository.saveContent(id, normalized, profile =>
      this.validateContent(normalized, profile.customRules, downloaded),
      profile => !requested || sameSubscription(profile, requested))
  }

  private async validateContent(content: string, rules?: CustomRuleItem[], downloaded = false): Promise<void> {
    const settings = this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG
    try { await validateProfileContent(content, settings, rules) }
    catch (error) {
      if (downloaded) {
        const cause = (error as { cause?: { code?: string; killed?: boolean } } | null)?.cause
        const unavailable = cause?.killed || ['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT'].includes(cause?.code ?? '')
        throw new SubscriptionDownloadError(unavailable ? 'validation' : 'format', settings.general)
      }
      throw error
    }
  }

  async updateProfileInfo(id: string, patch: ProfileInfoPatch): Promise<ProfileItem> {
    const updated = await this.repository.update(id, found => {
      if (patch.interval != null && (!Number.isInteger(patch.interval) || patch.interval < 15 || patch.interval > 43200)) throw new Error('Profile update interval must be between 15 and 43200 minutes')
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
        found.interval = patch.interval ?? undefined
      }
      if (patch.customUA !== undefined) {
        found.customUA = patch.customUA.trim() || undefined
      }
      if (patch.updateViaProxy !== undefined) {
        found.updateViaProxy = Boolean(patch.updateViaProxy)
      }
      if (patch.sendHwid !== undefined) found.sendHwid = patch.sendHwid
      found.updatedAt = Date.now()
    })
    logger.info(`Updated info for profile ${updated.name} (${id})`)
    return updated
  }

  async addProfile(dto: AddProfileDto): Promise<ProfileItem> {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
    let content = dto.content || ''
    let providerName: string | undefined
    let userInfo: ProfileUserInfo | undefined
    let profileLogo: string | undefined
    let announce: string | undefined
    let supportUrl: string | undefined
    let serverInterval: number | undefined
    let deviceStatus: ProfileItem['deviceStatus']
    let sendHwid = dto.sendHwid

    let targetUrl = dto.url?.trim()
    if (targetUrl) {
      const parsed = parseSubscriptionImportUrl(targetUrl)
      targetUrl = parsed.url
      if (!dto.name?.trim() && parsed.name) {
        dto.name = parsed.name
      }
    }

    if (dto.type === 'remote' && targetUrl) {
      logger.info(`Fetching remote subscription from: ${sanitizeUrl(targetUrl)}`)
      ;({ content, providerName, userInfo, profileLogo, announce, supportUrl, serverInterval, deviceStatus, sendHwid } =
        await this.subscriptions.download(targetUrl, undefined, dto.updateViaProxy, dto.sendHwid))
      if (deviceStatus) throw new SubscriptionDownloadError(deviceStatus === 'limit' ? 'device-limit' : 'hwid-required', (this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG).general)
    }

    content = convertSubscriptionToClashYaml(content)
    await this.validateContent(content, undefined, dto.type === 'remote')

    const defaultName = (this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG).general?.language === 'ru' ? 'Без названия' : 'Untitled'
    const item: ProfileItem = {
      id,
      name: dto.name?.trim() || providerName || defaultName,
      nameSource: dto.name?.trim() ? 'manual' : providerName ? 'subscription' : 'fallback',
      url: targetUrl,
      type: dto.type,
      updatedAt: Date.now(),
      lastFetchedAt: dto.type === 'remote' ? Date.now() : undefined,
      updateViaProxy: dto.updateViaProxy ? true : undefined,
      userInfo,
      profileLogo,
      announce,
      supportUrl,
      serverInterval,
      sendHwid: dto.type === 'remote' ? sendHwid : undefined
    }

    await this.repository.add(item, content, this.selectionChange(() =>
      this.getActiveProfile() ? this.activeProfileId : item.id))

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
    const item = this.repository.get(id)
    if (!item) throw new Error(`Profile not found: ${id}`)

    if (item.type === 'remote' && item.url) {
      logger.info(`Updating remote profile ${item.name} from ${sanitizeUrl(item.url)}`)
      const { content, providerName, userInfo, profileLogo, announce, supportUrl, serverInterval, deviceStatus, sendHwid } =
        await this.subscriptions.download(item.url, item.customUA, item.updateViaProxy, item.sendHwid)
      // Discard responses after deletion or a change to the request parameters.
      if (!sameSubscription(this.repository.get(id), item)) return false
      if (deviceStatus) {
        let applied = false
        await this.repository.update(id, current => {
          if (!sameSubscription(current, item)) return
          applied = true
          current.deviceStatus = deviceStatus
          if (sendHwid) current.sendHwid = true
          if (supportUrl) current.supportUrl = supportUrl
          if (announce) current.announce = announce
        })
        if (!applied) return false
        throw new SubscriptionDownloadError(deviceStatus === 'limit' ? 'device-limit' : 'hwid-required', (this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG).general)
      }
      const changed = await this.saveProfileContent(id, content, true, item)
      await this.repository.update(id, current => {
        if (!sameSubscription(current, item)) return
        current.lastFetchedAt = Date.now()
        if (userInfo) current.userInfo = userInfo
        current.profileLogo = profileLogo
        current.announce = announce
        current.supportUrl = supportUrl
        current.serverInterval = serverInterval
        current.deviceStatus = undefined
        if (sendHwid) current.sendHwid = true
        if (providerName && current.nameSource && current.nameSource !== 'manual') {
          current.name = providerName
          current.nameSource = 'subscription'
        }
      })
      return changed
    }
    return false
  }

  async deleteProfile(id: string): Promise<void> {
    await this.repository.remove(id, this.selectionChange(profiles =>
      this.activeProfileId === id ? profiles[0]?.id ?? null : this.activeProfileId))
    logger.info(`Deleted profile: ${id}`)
  }

  private selectionChange(select: (profiles: readonly ProfileItem[]) => string | null): ProfileSelectionChange {
    let previous: string | null = null
    let changed = false
    return {
      apply: async profiles => {
        previous = this.activeProfileId
        const next = select(profiles)
        if (previous === next) return
        changed = true
        await this.settingService?.updateSettings({ activeProfileId: next })
        this.activeProfileId = next
      },
      rollback: async () => {
        if (!changed) return
        await this.settingService?.updateSettings({ activeProfileId: previous })
        this.activeProfileId = previous
      }
    }
  }
}
