import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { AddProfileDto } from '@shared/ipc'
import { ProfileItem } from '@shared/profile'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'

export class ProfileService implements BaseService {
  private profiles: ProfileItem[] = []
  private activeProfileId: string | null = null
  private profilesFilePath: string
  private profilesDir: string

  constructor() {
    const paths = getAppPaths()
    this.profilesFilePath = paths.profilesFilePath
    this.profilesDir = paths.profilesDir
  }

  async initialize(): Promise<void> {
    try {
      if (fs.existsSync(this.profilesFilePath)) {
        const raw = fs.readFileSync(this.profilesFilePath, 'utf-8')
        this.profiles = JSON.parse(raw)
        logger.info(`Loaded ${this.profiles.length} profiles from disk`)
      } else {
        this.profiles = []
        this.saveProfilesList()
      }
    } catch (err) {
      logger.error('Failed to load profiles metadata', err)
      this.profiles = []
    }
  }

  async dispose(): Promise<void> {
    this.saveProfilesList()
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
    this.activeProfileId = id
    logger.info(`Active profile switched to: ${found.name} (${id})`)
  }

  getProfileContent(id: string): string | null {
    const filePath = path.join(this.profilesDir, `${id}.yaml`)
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8')
    }
    return null
  }

  async addProfile(dto: AddProfileDto): Promise<ProfileItem> {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
    let content = dto.content || ''

    if (dto.type === 'remote' && dto.url) {
      logger.info(`Fetching remote subscription from: ${dto.url}`)
      const res = await axios.get(dto.url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'clash.meta / QzyriumVPN'
        }
      })
      content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    }

    const filePath = path.join(this.profilesDir, `${id}.yaml`)
    fs.writeFileSync(filePath, content, 'utf-8')

    const item: ProfileItem = {
      id,
      name: dto.name,
      url: dto.url,
      type: dto.type,
      updatedAt: Date.now()
    }

    this.profiles.push(item)
    this.saveProfilesList()

    if (!this.activeProfileId) {
      this.activeProfileId = id
    }

    logger.info(`Added profile: ${dto.name} (${id})`)
    return item
  }

  async updateProfile(id: string): Promise<void> {
    const item = this.profiles.find((p) => p.id === id)
    if (!item) throw new Error(`Profile not found: ${id}`)

    if (item.type === 'remote' && item.url) {
      logger.info(`Updating remote profile ${item.name} from ${item.url}`)
      const res = await axios.get(item.url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'clash.meta / QzyriumVPN'
        }
      })
      const content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
      const filePath = path.join(this.profilesDir, `${id}.yaml`)
      fs.writeFileSync(filePath, content, 'utf-8')
      item.updatedAt = Date.now()
      this.saveProfilesList()
    }
  }

  async deleteProfile(id: string): Promise<void> {
    this.profiles = this.profiles.filter((p) => p.id !== id)
    const filePath = path.join(this.profilesDir, `${id}.yaml`)
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch {
        // ignore
      }
    }
    if (this.activeProfileId === id) {
      this.activeProfileId = this.profiles[0]?.id || null
    }
    this.saveProfilesList()
    logger.info(`Deleted profile: ${id}`)
  }

  private saveProfilesList(): void {
    try {
      fs.writeFileSync(this.profilesFilePath, JSON.stringify(this.profiles, null, 2), 'utf-8')
    } catch (err) {
      logger.error('Failed to save profiles list', err)
    }
  }
}
