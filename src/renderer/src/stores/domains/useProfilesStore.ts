import { useState, useCallback } from 'react'
import type { ProfileItem, CustomRuleItem } from '@shared/profile'
import type { StoreCoordinator } from './types'

export interface ProfilesStore {
  profiles: ProfileItem[]
  setProfiles: React.Dispatch<React.SetStateAction<ProfileItem[]>>
  activeProfile: ProfileItem | null
  setActiveProfile: React.Dispatch<React.SetStateAction<ProfileItem | null>>
  switchActiveProfile: (id: string) => Promise<boolean>
  updateActiveProfile: () => Promise<boolean>
  saveCustomRules: (rules: CustomRuleItem[]) => Promise<boolean>
  saveRawConfig: (content: string) => Promise<boolean>
}

export function useProfilesStore(coord: StoreCoordinator): ProfilesStore {
  const [profiles, setProfiles] = useState<ProfileItem[]>([])
  const [activeProfile, setActiveProfile] = useState<ProfileItem | null>(null)

  const switchActiveProfile = useCallback(
    (id: string) => {
      return coord.perform(() => window.api.profiles.setActive(id))
    },
    [coord]
  )

  const updateActiveProfile = useCallback(() => {
    return coord.perform(async () => {
      if (activeProfile?.url) {
        await window.api.profiles.update(activeProfile.id)
      }
    })
  }, [activeProfile, coord])

  const saveCustomRules = useCallback(
    (rules: CustomRuleItem[]) => {
      return coord.perform(async () => {
        if (!activeProfile) return
        await window.api.profiles.saveCustomRules(activeProfile.id, rules)
      })
    },
    [activeProfile, coord]
  )

  const saveRawConfig = useCallback(
    (content: string) => {
      return coord.perform(async () => {
        if (!activeProfile) return
        await window.api.profiles.saveRawConfig(activeProfile.id, content)
      })
    },
    [activeProfile, coord]
  )

  return {
    profiles,
    setProfiles,
    activeProfile,
    setActiveProfile,
    switchActiveProfile,
    updateActiveProfile,
    saveCustomRules,
    saveRawConfig
  }
}
