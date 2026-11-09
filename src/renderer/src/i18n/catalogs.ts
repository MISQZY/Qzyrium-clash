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

export const catalogs = {
  en: { app: appEn, dashboard: dashboardEn, connections: connectionsEn, profiles: profilesEn, proxies: proxiesEn, rules: rulesEn, logs: logsEn, networksettings: networksettingsEn, profileconfig: profileconfigEn, common: commonEn },
  ru: { app: appRu, dashboard: dashboardRu, connections: connectionsRu, profiles: profilesRu, proxies: proxiesRu, rules: rulesRu, logs: logsRu, networksettings: networksettingsRu, profileconfig: profileconfigRu, common: commonRu }
}
export type Locale = keyof typeof catalogs
export type Namespace = keyof typeof catalogs.en
export type MessageKey<N extends Namespace> = keyof typeof catalogs.en[N] & string
type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>

/** Translation values stay text, including remote names and error details. */
export function translate<N extends Namespace>(locale: Locale, namespace: N, key: MessageKey<N>, values: Record<string, string | number> = {}): string {
  const messages = catalogs[locale][namespace] as Record<string, Message>
  const fallback = catalogs.en[namespace] as Record<string, Message>
  const message = messages[key] ?? fallback[key]
  if (!message) return key
  const text = typeof message === 'string' ? message : message[new Intl.PluralRules(locale).select(Number(values.count))] ?? message.other!
  return text.replace(/(?<!\{)\{(\w+)\}(?!\})/g, (_, name: string) => String(values[name] ?? `{${name}}`))
}
