export type ProfileType = 'remote' | 'local'

export interface ProfileItem {
  id: string
  name: string
  url?: string
  type: ProfileType
  updatedAt: number
  selectedGroupProxies?: Record<string, string>
}
