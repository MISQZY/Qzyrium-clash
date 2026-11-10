import en from './locales/en.json'
import ru from './locales/ru.json'
import { selectedLocalization } from './custom-localization'
import type { AppConfig } from './app-config'

export function nativeMessages(general: AppConfig['general']): typeof en {
  const messages = { ...(general.language === 'ru' ? ru : en) }
  const custom = selectedLocalization(general)?.messages.native
  for (const key of Object.keys(messages) as (keyof typeof en)[]) {
    if (typeof custom?.[key] === 'string') messages[key] = custom[key]
  }
  return messages
}

export function nativeMessage(locale: 'en' | 'ru', key: keyof typeof en, general?: AppConfig['general']): string {
  return general ? nativeMessages(general)[key] : (locale === 'ru' ? ru : en)[key]
}
