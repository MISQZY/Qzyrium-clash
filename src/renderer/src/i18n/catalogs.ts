import { coreFields, tunFields, dnsFields, snifferFields, resourceFields, generalFields, type SettingsField } from '@shared/settings-fields'
import nativeEn from '@shared/locales/en.json'
import nativeRu from '@shared/locales/ru.json'
import { validateLocalizationPack, type CustomLocalizationPack } from '@shared/custom-localization'
import appEn from './messages/en/app.json'
import dashboardEn from './messages/en/dashboard.json'
import connectionsEn from './messages/en/connections.json'
import profilesEn from './messages/en/profiles.json'
import proxiesEn from './messages/en/proxies.json'
import rulesEn from './messages/en/rules.json'
import logsEn from './messages/en/logs.json'
import networksettingsEn from './messages/en/networksettings.json'
import profileconfigEn from './messages/en/profileconfig.json'
import commonEn from './messages/en/common.json'
import appRu from './messages/ru/app.json'
import dashboardRu from './messages/ru/dashboard.json'
import connectionsRu from './messages/ru/connections.json'
import profilesRu from './messages/ru/profiles.json'
import proxiesRu from './messages/ru/proxies.json'
import rulesRu from './messages/ru/rules.json'
import logsRu from './messages/ru/logs.json'
import networksettingsRu from './messages/ru/networksettings.json'
import profileconfigRu from './messages/ru/profileconfig.json'
import commonRu from './messages/ru/common.json'

const fieldKeys = new Map<SettingsField, string>()
const fieldMessages: Record<'en' | 'ru', Record<string, string>> = { en: {}, ru: {} }
for (const [group, fields] of Object.entries({ core: coreFields, tun: tunFields, dns: dnsFields, sniffer: snifferFields, resources: resourceFields, general: generalFields })) {
  for (const field of fields) {
    const key = `${group}.${field.key}`
    fieldKeys.set(field, key)
    for (const locale of ['en', 'ru'] as const) {
      fieldMessages[locale][`${key}.label`] = field.label[locale]
      if (field.description) fieldMessages[locale][`${key}.description`] = field.description[locale]
    }
  }
}
export function settingsFieldKey(field: SettingsField): string {
  return fieldKeys.get(field) ?? field.key
}

export const catalogs = {
  en: { settingsfields: fieldMessages.en, native: nativeEn, app: appEn, dashboard: dashboardEn, connections: connectionsEn, profiles: profilesEn, proxies: proxiesEn, rules: rulesEn, logs: logsEn, networksettings: networksettingsEn, profileconfig: profileconfigEn, common: commonEn },
  ru: { settingsfields: fieldMessages.ru, native: nativeRu, app: appRu, dashboard: dashboardRu, connections: connectionsRu, profiles: profilesRu, proxies: proxiesRu, rules: rulesRu, logs: logsRu, networksettings: networksettingsRu, profileconfig: profileconfigRu, common: commonRu }
}
export type Locale = keyof typeof catalogs
export type Namespace = keyof typeof catalogs.en
export type MessageKey<N extends Namespace> = keyof typeof catalogs.en[N] & string
type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>

/** Translation values stay text, including remote names and error details. */
export function translate<N extends Namespace>(locale: Locale, namespace: N, key: MessageKey<N>, values: Record<string, string | number> = {}, custom?: CustomLocalizationPack): string {
  const messages = catalogs[locale][namespace] as Record<string, Message>
  const fallback = catalogs.en[namespace] as Record<string, Message>
  const customMessage = custom?.messages[namespace]?.[key]
  const message = customMessage ?? messages[key] ?? fallback[key]
  if (!message) return key
  const text = typeof message === 'string' ? message : message[new Intl.PluralRules(customMessage ? custom!.locale : locale).select(Number(values.count))] ?? message.other!
  return text.replace(/(?<!\{)\{(\w+)\}(?!\})/g, (_, name: string) => String(values[name] ?? `{${name}}`))
}

/** Generate from the catalogs so newly added keys are included automatically. */
export function localizationExample(locale: Locale): CustomLocalizationPack {
  return { id: 'custom-localization', name: 'Custom localization', locale, baseLanguage: locale, messages: structuredClone(catalogs[locale]) }
}

export function parseLocalizationPack(content: string): CustomLocalizationPack {
  const pack: unknown = JSON.parse(content)
  validateLocalizationPack(pack)
  let recognized = 0
  const placeholders = (text: string) => [...new Set(Array.from(text.matchAll(/(?<!\{)\{(\w+)\}(?!\})/g), match => match[1]))].sort().join(',')
  for (const [namespace, messages] of Object.entries(pack.messages)) {
    const reference = catalogs.en[namespace as Namespace] as Record<string, Message> | undefined
    if (!reference) continue
    for (const [key, message] of Object.entries(messages)) {
      if (!Object.hasOwn(reference, key)) continue
      recognized++
      const original = reference[key]
      const expected = placeholders(typeof original === 'string' ? original : original.other!)
      const forms = typeof message === 'string' ? [message] : Object.values(message)
      if (typeof original !== typeof message || forms.some(text => placeholders(text) !== expected)) throw new Error('Invalid localization placeholders')
    }
  }
  if (!recognized) throw new Error('No known localization keys')
  return pack
}
