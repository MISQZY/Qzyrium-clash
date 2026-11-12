import fs from 'fs'
import path from 'path'
import { isDeepStrictEqual } from 'node:util'
import type { ProfileItem } from '@shared/profile'
import { getAppPaths, type AppPaths } from '../utils/paths'
import { writeFileAtomicAsync } from '../utils/atomicWrite'
import { logger } from '../utils/logger'

export class ProfileRepository {
  private profiles: ProfileItem[] = []
  private pending: Promise<unknown> = Promise.resolve()

  constructor(private paths: Pick<AppPaths, 'profilesFilePath' | 'profilesDir'> = getAppPaths()) {}

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const task = this.pending.then(action)
    this.pending = task.catch(() => {})
    return task
  }

  private filename(id: string): string {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error(`Invalid profile id format: ${id}`)
    return path.resolve(this.paths.profilesDir, `${id}.yaml`)
  }

  private parse(raw: string): ProfileItem[] {
    const profiles: unknown = JSON.parse(raw)
    if (!Array.isArray(profiles)) throw new Error('Invalid profiles metadata: expected an array')
    const ids = new Set<string>()
    for (const item of profiles) {
      if (!item || typeof item.name !== 'string' || !['remote', 'local'].includes(item.type)) throw new Error('Invalid profile metadata')
      this.filename(item.id)
      if (ids.has(item.id)) throw new Error(`Duplicate profile id: ${item.id}`)
      ids.add(item.id)
    }
    return profiles
  }

  private write(profiles: ProfileItem[], backup = true): Promise<void> {
    return writeFileAtomicAsync(this.paths.profilesFilePath, JSON.stringify(profiles, null, 2), 'utf-8', backup)
  }

  async initialize(): Promise<void> {
    try {
      this.profiles = this.parse(await fs.promises.readFile(this.paths.profilesFilePath, 'utf-8'))
      logger.info(`Loaded ${this.profiles.length} profiles from disk`)
    } catch (error) {
      try {
        this.profiles = this.parse(await fs.promises.readFile(`${this.paths.profilesFilePath}.bak`, 'utf-8'))
        await this.write(this.profiles, false).catch(restoreError => logger.error('Failed to restore primary profiles file', restoreError))
        logger.warn('Recovered profiles metadata from backup file (.bak)')
      } catch {
        this.profiles = []
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') await this.write([])
        else logger.error('Failed to load profiles metadata', error)
      }
    }
  }

  list(): ProfileItem[] { return structuredClone(this.profiles) }
  snapshot(): Promise<{ profile: ProfileItem; content: string }[]> {
    return this.enqueue(async () => Promise.all(this.list().map(async profile => {
      const content = await this.content(profile.id)
      if (content === null) throw new Error(`Profile file is missing: ${profile.id}`)
      return { profile, content }
    })))
  }
  get(id: string): ProfileItem | undefined {
    const found = this.profiles.find(profile => profile.id === id)
    return found ? structuredClone(found) : undefined
  }
  active(id: string | null): ProfileItem | null {
    const profile = this.profiles.find(item => item.id === id) ?? this.profiles[0]
    return profile ? structuredClone(profile) : null
  }

  async content(id: string): Promise<string | null> {
    try { return await fs.promises.readFile(this.filename(id), 'utf-8') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return null
    }
  }

  use<T>(id: string, action: (profile: ProfileItem) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const profile = this.get(id)
      if (!profile) throw new Error(`Profile ${id} not found`)
      return action(profile)
    })
  }

  update(id: string, mutate: (profile: ProfileItem) => void | Promise<void>): Promise<ProfileItem> {
    return this.enqueue(async () => {
      const current = this.profiles.find(profile => profile.id === id)
      if (!current) throw new Error(`Profile ${id} not found`)
      const candidate = structuredClone(current)
      await mutate(candidate)
      if (!isDeepStrictEqual(current, candidate)) {
        const next = this.profiles.map(profile => profile === current ? candidate : profile)
        await this.write(next)
        this.profiles = next
      }
      return structuredClone(candidate)
    })
  }

  saveContent(id: string, content: string, validate: (profile: ProfileItem) => Promise<void>): Promise<boolean> {
    return this.enqueue(async () => {
      const current = this.profiles.find(profile => profile.id === id)
      if (!current) throw new Error(`Profile ${id} not found`)
      const original = await this.content(id)
      if (original === content) return false
      await validate(structuredClone(current))
      const file = this.filename(id)
      await writeFileAtomicAsync(file, content, 'utf-8', true)
      const next = this.profiles.map(profile => profile === current ? { ...current, updatedAt: Date.now() } : profile)
      try { await this.write(next) }
      catch (error) {
        await this.restoreContent(file, original)
        throw error
      }
      this.profiles = next
      return true
    })
  }

  add(item: ProfileItem, content: string, selection: ProfileSelectionChange): Promise<void> {
    return this.enqueue(async () => {
      if (this.get(item.id) || await this.content(item.id) !== null) throw new Error(`Profile ${item.id} already exists`)
      const file = this.filename(item.id)
      const next = [...this.profiles, structuredClone(item)]
      await writeFileAtomicAsync(file, content, 'utf-8', true)
      let metadataSaved = false
      let selectionStarted = false
      try {
        await this.write(next)
        metadataSaved = true
        selectionStarted = true
        await selection.apply(next)
        this.profiles = next
      } catch (error) {
        if (selectionStarted) await selection.rollback().catch(restoreError => logger.error('Failed to restore active profile', restoreError))
        if (metadataSaved) await this.write(this.profiles, false).catch(restoreError => logger.error('Failed to restore profiles metadata', restoreError))
        await this.restoreContent(file, null)
        throw error
      }
    })
  }

  remove(id: string, selection: ProfileSelectionChange): Promise<void> {
    return this.enqueue(async () => {
      const file = this.filename(id)
      const next = this.profiles.filter(profile => profile.id !== id)
      await this.write(next)
      let selectionStarted = false
      try {
        selectionStarted = true
        await selection.apply(next)
        try { await fs.promises.unlink(file) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        this.profiles = next
      } catch (error) {
        if (selectionStarted) await selection.rollback().catch(restoreError => logger.error('Failed to restore active profile', restoreError))
        await this.write(this.profiles, false).catch(restoreError => logger.error('Failed to restore profiles metadata', restoreError))
        throw error
      }
    })
  }

  private async restoreContent(file: string, content: string | null): Promise<void> {
    try {
      if (content === null) await fs.promises.unlink(file)
      else await writeFileAtomicAsync(file, content)
    } catch (error) { logger.error('Failed to restore profile content', error) }
  }

  async flush(): Promise<void> { await this.pending }
}

export interface ProfileSelectionChange {
  apply(profiles: readonly ProfileItem[]): Promise<void>
  rollback(): Promise<void>
}
