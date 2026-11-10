export type ProfileType = 'remote' | 'local'

export interface CustomRuleItem {
  id: string
  type: string
  payload: string
  proxy: string
  position?: 'top' | 'bottom'
  enabled?: boolean
  additionalParams?: string[]
  isDeleted?: boolean
  offset?: number
}

export interface ProfileUserInfo {
  upload?: number
  download?: number
  total?: number
  expire?: number
}

export interface ProfileItem {
  id: string
  name: string
  nameSource?: 'manual' | 'subscription' | 'fallback'
  url?: string
  type: ProfileType
  updatedAt: number
  selectedGroupProxies?: Record<string, string>
  customRules?: CustomRuleItem[]
  autoUpdate?: boolean
  updateViaProxy?: boolean
  interval?: number
  customUA?: string
  userInfo?: ProfileUserInfo
  profileLogo?: string
  announce?: string
  supportUrl?: string
}
