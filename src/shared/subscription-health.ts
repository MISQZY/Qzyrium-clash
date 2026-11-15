import type { ProfileItem, ProfileUserInfo } from './profile'

export function subscriptionTrafficKey(profile: Pick<ProfileItem, 'id' | 'lastFetchedAt' | 'userInfo'>): string {
  const info = profile.userInfo
  return JSON.stringify([profile.id, profile.lastFetchedAt ?? 0, info?.upload, info?.download, info?.total, info?.expire])
}

const validBytes = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER

export function subscriptionUsage(info?: ProfileUserInfo, runtimeDeltaBytes = 0) {
  if (!validBytes(info?.total) || info.total <= 0 || ![info.upload, info.download].some(validBytes)) return null
  const baseUsed = (validBytes(info.upload) ? info.upload : 0) + (validBytes(info.download) ? info.download : 0)
  const delta = validBytes(runtimeDeltaBytes) && runtimeDeltaBytes > 0 ? runtimeDeltaBytes : 0
  const used = Math.min(Number.MAX_SAFE_INTEGER, baseUsed + delta)
  const percent = Math.min(1, used / info.total) * 100
  return {
    total: info.total,
    used,
    baseUsed,
    runtimeDelta: delta,
    remaining: Math.max(0, info.total - used),
    percent,
    status: used >= info.total ? 'exhausted' as const : percent >= 90 ? 'near' as const : 'normal' as const
  }
}

export function subscriptionHealth(info?: ProfileUserInfo, now = Date.now()) {
  const usage = subscriptionUsage(info)
  const expiry = info?.expire && Number.isFinite(info.expire) && info.expire > 0 ? info.expire * 1000 : undefined
  return {
    traffic: usage?.status === 'normal' ? undefined : usage?.status,
    expiry: expiry !== undefined && Number.isFinite(expiry) && expiry <= now + 3 * 86_400_000
      ? expiry <= now ? 'expired' as const : 'soon' as const : undefined
  }
}
