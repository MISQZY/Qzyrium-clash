import { ProfileRepository, type ProfileSelectionChange } from './ProfileRepository'
import { SubscriptionClient } from '../core/SubscriptionClient'
import { sanitizeUrl } from '../utils/subscription-url'
import { isDeepStrictEqual } from 'node:util'
import { AddProfileDto } from '@shared/ipc'
import { ProfileItem, CustomRuleItem, ProfileUserInfo } from '@shared/profile'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { parseSubscriptionImportUrl } from '@shared/clash-url'
import type { SettingService } from './SettingService'
import { DEFAULT_APP_CONFIG } from '@shared/app-config'
import { prepareProfileContent, validateProfileContent } from '../utils/profile-validator'

export class ProfileService implements BaseService {
  private activeProfileId: string | null = null
  private updates = new Map<string, Promise<boolean>>()
  private isCoreRunning?: () => boolean
  private repository: ProfileRepository
  private subscriptions: Pick<SubscriptionClient, 'download'>

  constructor(private settingService?: SettingService, subscriptions?: Pick<SubscriptionClient, 'download'>, repository = new ProfileRepository()) {
    this.subscriptions = subscriptions ?? new SubscriptionClient(
      () => this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG,
      () => this.isCoreRunning?.() ?? false)
    this.repository = repository
  }

  setCoreStatusProvider(provider: () => boolean): void {
    this.isCoreRunning = provider
  }

  async initialize(): Promise<void> {
    await this.repository.initialize()
    this.activeProfileId = this.settingService?.getSettings().activeProfileId ?? null
  }

  async dispose(): Promise<void> { await this.repository.flush() }

  getProfiles(): ProfileItem[] { return this.repository.list() }

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

  async saveProfileContent(id: string, content: string): Promise<boolean> {
    return this.repository.saveContent(id, content, profile =>
      validateProfileContent(content, this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG, profile.customRules))
  }

  async updateProfileInfo(id: string, patch: Partial<ProfileItem>): Promise<ProfileItem> {
    const updated = await this.repository.update(id, found => {
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
      ;({ content, providerName, userInfo, profileLogo, announce, supportUrl } =
        await this.subscriptions.download(targetUrl, undefined, dto.updateViaProxy))
    }

    await validateProfileContent(content, this.settingService?.getSettings() ?? DEFAULT_APP_CONFIG)

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
      const { content, providerName, userInfo, profileLogo, announce, supportUrl } =
        await this.subscriptions.download(item.url, item.customUA, item.updateViaProxy)
      // A subscription can be removed while its download is in flight.
      if (!this.repository.get(id)) return false
      const changed = await this.saveProfileContent(id, content)
      await this.repository.update(id, current => {
        if (userInfo) current.userInfo = userInfo
        current.profileLogo = profileLogo
        current.announce = announce
        current.supportUrl = supportUrl
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
