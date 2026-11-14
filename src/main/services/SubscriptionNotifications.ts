import { Notification } from 'electron'
import type { AppConfig } from '@shared/app-config'
import type { ProfileItem } from '@shared/profile'
import { subscriptionHealth } from '@shared/subscription-health'
import { nativeMessage } from '@shared/localization'

const messages = { near: 'subscriptionTrafficLow', exhausted: 'subscriptionTrafficExhausted',
  soon: 'subscriptionExpiresSoon', expired: 'subscriptionExpired' } as const

export class SubscriptionNotifications {
  private shown = new Map<string, Set<string>>()
  constructor(private onClick: () => void,
    private send = (title: string, body: string) => {
      const notification = new Notification({ title, body })
      notification.on('click', this.onClick)
      notification.show()
    }, private supported = () => Notification?.isSupported() ?? false) {}

  isSupported(): boolean { return this.supported() }

  check(profiles: ProfileItem[], general: AppConfig['general'], now = Date.now()): void {
    if (general.subscriptionNotifications === false || !this.isSupported()) return
    const ids = new Set(profiles.map(profile => profile.id))
    for (const id of this.shown.keys()) if (!ids.has(id)) this.shown.delete(id)
    for (const profile of profiles) {
      if (profile.type !== 'remote') continue
      const health = subscriptionHealth(profile.userInfo, now)
      const warnings = [
        ...(health.traffic ? [{ key: `traffic:${health.traffic}:${profile.userInfo?.total}`, message: messages[health.traffic] }] : []),
        ...(health.expiry ? [{ key: `expiry:${health.expiry}:${profile.userInfo?.expire}`, message: messages[health.expiry] }] : [])
      ]
      const previous = this.shown.get(profile.id) ?? new Set()
      const fresh = warnings.filter(warning => !previous.has(warning.key))
      if (fresh.length) {
        this.send('Qzyrium-clash', `${profile.name.slice(0, 120)}\n${fresh.map(warning => nativeMessage(general.language, warning.message, general)).join('\n')}`)
      }
      this.shown.set(profile.id, new Set(warnings.map(warning => warning.key)))
    }
  }
}
