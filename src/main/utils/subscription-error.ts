import type { AppConfig } from '@shared/app-config'
import { nativeMessage } from '@shared/localization'

const messages = {
  dns: 'subscriptionDnsFailed', tls: 'subscriptionTlsFailed', timeout: 'subscriptionTimedOut',
  http: 'subscriptionHttpFailed', blocked: 'subscriptionAddressBlocked', redirect: 'subscriptionRedirectFailed',
  size: 'subscriptionTooLarge', format: 'subscriptionInvalidFormat', network: 'subscriptionNetworkFailed',
  proxy: 'subscriptionProxyStopped', url: 'subscriptionInvalidUrl', validation: 'subscriptionValidationUnavailable'
} as const

export type SubscriptionFailure = keyof typeof messages

/** Never retain the original request, response body or error cause: all can contain credentials. */
export class SubscriptionDownloadError extends Error {
  constructor(readonly code: SubscriptionFailure, general: AppConfig['general'], readonly httpStatus?: number) {
    const key = code === 'http' && (httpStatus === 401 || httpStatus === 403) ? 'subscriptionAccessDenied' : messages[code]
    super(nativeMessage(general.language, key, general) + (httpStatus ? ` (HTTP ${httpStatus})` : ''))
    this.name = 'SubscriptionDownloadError'
  }
}
