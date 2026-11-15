import type { ProfileItem } from '@shared/profile'
import { subscriptionTrafficKey } from '@shared/subscription-health'

/** Lives with the application, independently of renderer pages and core sessions. */
export class SubscriptionTrafficAccounting {
  private profiles = new Map<string, { key: string; runtimeDeltaBytes: number }>()
  private currentKey: string | null = null
  private lastBytes = 0

  beginSession(profile?: ProfileItem | null): void {
    this.currentKey = profile ? subscriptionTrafficKey(profile) : null
    this.lastBytes = 0
  }

  sample(profile: ProfileItem | null, observedBytes: number): { key: string; runtimeDeltaBytes: number } | undefined {
    if (!profile) { this.currentKey = null; this.lastBytes = observedBytes; return undefined }
    const key = subscriptionTrafficKey(profile)
    let entry = this.profiles.get(profile.id)
    if (!entry || entry.key !== key) {
      entry = { key, runtimeDeltaBytes: 0 }
      this.profiles.set(profile.id, entry)
    }
    // A newly fetched server snapshot or profile switch establishes a fresh baseline.
    if (key === this.currentKey) {
      const delta = observedBytes >= this.lastBytes ? observedBytes - this.lastBytes : observedBytes
      entry.runtimeDeltaBytes = Math.min(Number.MAX_SAFE_INTEGER, entry.runtimeDeltaBytes + Math.max(0, delta))
    }
    this.currentKey = key
    this.lastBytes = observedBytes
    return { ...entry }
  }
}
