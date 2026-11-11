import { type AddProfileDto, IPC_CHANNELS } from '@shared/ipc'
import type { CustomRuleItem, ProfileInfoPatch } from '@shared/profile'
import type { ServiceManager } from '../services/ServiceManager'
import type { TrustedRegistrar } from './trusted-handler'

export function registerProfileHandlers(
  handle: TrustedRegistrar,
  services: Pick<ServiceManager, 'kernelService' | 'profileService'>
): void {
  const profileUpdates = new Map<string, Promise<void>>()

  const restartActiveProfile = async (id: string | undefined): Promise<void> => {
    const status = services.kernelService.getStatus()
    if (id && services.profileService.getActiveProfile()?.id === id && (status === 'running' || status === 'starting')) {
      await services.kernelService.restart()
    }
  }

  handle(IPC_CHANNELS.PROFILE_GET_LIST, () => {
    return services.profileService.getProfiles()
  })

  handle(IPC_CHANNELS.PROFILE_GET_ACTIVE, () => {
    return services.profileService.getActiveProfile()
  })

  handle(IPC_CHANNELS.PROFILE_SET_ACTIVE, async (_, id: string) => {
    const previousId = services.profileService.getActiveProfile()?.id
    await services.profileService.setActiveProfile(id)
    if (previousId !== id) await restartActiveProfile(id)
  })

  handle(IPC_CHANNELS.PROFILE_ADD, async (_, dto: AddProfileDto) => {
    const item = await services.profileService.addProfile(dto)
    await restartActiveProfile(item.id)
    return item
  })

  handle(IPC_CHANNELS.PROFILE_DELETE, async (_, id: string) => {
    const active = services.profileService.getActiveProfile()?.id === id
    await services.profileService.deleteProfile(id)
    // Removing the final active profile also requires a default kernel configuration.
    if (active && ['running', 'starting'].includes(services.kernelService.getStatus())) {
      await services.kernelService.restart()
    }
  })

  handle(IPC_CHANNELS.PROFILE_GET_CUSTOM_RULES, (_, id: string) => {
    return services.profileService.getCustomRules(id)
  })

  handle(IPC_CHANNELS.PROFILE_VALIDATE_CUSTOM_RULES, (_, id: string, rules: CustomRuleItem[]) => {
    return services.profileService.validateCustomRules(id, rules)
  })

  handle(
    IPC_CHANNELS.PROFILE_SAVE_CUSTOM_RULES,
    async (_, id: string, rules: CustomRuleItem[]) => {
      if (await services.profileService.saveCustomRules(id, rules)) await restartActiveProfile(id)
    }
  )

  handle(IPC_CHANNELS.PROFILE_GET_RAW_CONFIG, (_, id: string) => {
    return services.profileService.getProfileContent(id)
  })

  handle(IPC_CHANNELS.PROFILE_SAVE_RAW_CONFIG, async (_, id: string, content: string) => {
    if (await services.profileService.saveProfileContent(id, content)) await restartActiveProfile(id)
  })

  handle(IPC_CHANNELS.PROFILE_UPDATE_INFO, async (_, id: string, patch: ProfileInfoPatch) => {
    return services.profileService.updateProfileInfo(id, patch)
  })

  handle(IPC_CHANNELS.PROFILE_UPDATE, (_, id: string) => {
    const pending = profileUpdates.get(id)
    if (pending) return pending
    const update = (async () => {
      if (await services.profileService.updateProfile(id)) await restartActiveProfile(id)
    })().finally(() => profileUpdates.delete(id))
    profileUpdates.set(id, update)
    return update
  })
}
