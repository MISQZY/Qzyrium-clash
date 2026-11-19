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
  lastFetchedAt?: number
  selectedGroupProxies?: Record<string, string>
  customRules?: CustomRuleItem[]
  autoUpdate?: boolean
  updateViaProxy?: boolean
  interval?: number
  serverInterval?: number
  sendHwid?: boolean
  deviceStatus?: 'limit' | 'required'
  customUA?: string
  userInfo?: ProfileUserInfo
  profileLogo?: string
  announce?: string
  supportUrl?: string
  serverDisplayMode?: 'single' | 'full'
  displayMode?: 'single' | 'full'
}

/** Fields editable through profile information; identity and rule state are separate commands. */
export type ProfileInfoPatch = Partial<Pick<ProfileItem,
  'name' | 'url' | 'autoUpdate' | 'updateViaProxy' | 'customUA' | 'sendHwid' | 'displayMode'>> & { interval?: number | null }

export function canToggleProfileDisplayMode(profile?: Pick<ProfileItem, 'serverDisplayMode'> | null): boolean {
  return Boolean(profile?.serverDisplayMode)
}

export function subscriptionUpdateInterval(profile: Pick<ProfileItem, 'interval' | 'serverInterval'>, fallback = 60): number {
  return profile.interval ?? profile.serverInterval ?? fallback
}
