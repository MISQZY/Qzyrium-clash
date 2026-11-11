export type ProfileType = 'remote' | 'local'

export interface CustomRuleItem {
  id: string
  type: string
  payload: string
  proxy: string
  position?: 'top' | 'bottom'
  enabled?: boolean
  validationError?: string
  additionalParams?: string[]
  isDeleted?: boolean
  offset?: number
  /** Original subscription rule and its occurrence identify a row across reloads. */
  sourceRule?: string
  sourceOccurrence?: number
  /** Replacement text; absent on legacy move/delete overrides. */
  replacementRule?: string
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

/** Fields editable through profile information; identity and rule state are separate commands. */
export type ProfileInfoPatch = Partial<Pick<ProfileItem,
  'name' | 'url' | 'autoUpdate' | 'updateViaProxy' | 'interval' | 'customUA'>>
