import fs from 'fs'
import { createHash } from 'node:crypto'
import type { AppConfig } from '@shared/app-config'
import type { CustomRuleItem, ProfileItem } from '@shared/profile'
import { getAppPaths } from '../utils/paths'
import { prepareProfileContent } from '../utils/profile-validator'
import { MihomoConfigFactory } from './MihomoConfigFactory'

export interface ProfileConfigSource {
  getActiveProfile(): ProfileItem | null
  getProfileContent(id: string): Promise<string | null>
  getCustomRules(id: string): CustomRuleItem[]
  setRuleValidation(id: string, rules: CustomRuleItem[]): Promise<void>
}

/** Owns configuration preparation and caching; process lifecycle stays with the kernel. */
export class ActiveConfigBuilder {
  private cached: { digest: string; key: string; yaml: string } | null = null

  constructor(private profiles: ProfileConfigSource) {}

  async prepare(content: string | null, settings: AppConfig, profileId?: string): Promise<string> {
    const rules = profileId ? this.profiles.getCustomRules(profileId) : []
    if (!rules.some(rule => rule.enabled !== false && !rule.isDeleted)) {
      return MihomoConfigFactory.synthesize(content, settings, rules)
    }
    const prepared = await prepareProfileContent(content, settings, rules)
    if (profileId) await this.profiles.setRuleValidation(profileId, prepared.rules)
    return prepared.config
  }

  async build(settings: AppConfig, force = false): Promise<ProfileItem | null> {
    const profile = this.profiles.getActiveProfile()
    const content = profile ? await this.profiles.getProfileContent(profile.id) : null
    if (profile && content === null) throw new Error(`Profile file is missing: ${profile.name}`)
    const rules = profile ? this.profiles.getCustomRules(profile.id) : []
    const key = JSON.stringify([settings.kernel, rules])
    const digest = createHash('sha256').update(content === null ? 'no-profile:' : 'profile:').update(content ?? '').digest('hex')
    if (force || rules.some(rule => rule.enabled !== false && !rule.isDeleted) ||
      !this.cached || this.cached.digest !== digest || this.cached.key !== key) {
      this.cached = { digest, key, yaml: await this.prepare(content, settings, profile?.id) }
    }
    await fs.promises.writeFile(getAppPaths().activeConfigPath, this.cached.yaml, 'utf-8')
    return profile
  }
}
