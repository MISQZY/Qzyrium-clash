import type { ProfileService } from '../services/ProfileService'
import type { KernelService } from '../services/KernelService'
import { logger } from './logger'

const pending = new WeakMap<ProfileService, Promise<void>>()

/** Tray and IPC activation share one transaction and one queue. */
export function activateProfile(profiles: ProfileService, kernel: Pick<KernelService, 'getStatus' | 'reloadConfig'>, id: string): Promise<void> {
  const task = (pending.get(profiles) ?? Promise.resolve()).then(async () => {
    const previousId = profiles.getActiveProfile()?.id
    if (previousId === id) return
    await profiles.setActiveProfile(id)
    try {
      if (['running', 'starting'].includes(kernel.getStatus())) await kernel.reloadConfig()
    } catch (error) {
      if (previousId && profiles.getActiveProfile()?.id === id) {
        await profiles.setActiveProfile(previousId)
          .catch(recoveryError => logger.error('Failed to restore the active profile after rejected reload', recoveryError))
      }
      throw error
    }
  })
  pending.set(profiles, task.catch(() => {}))
  return task
}
