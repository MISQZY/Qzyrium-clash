export type LocalizedMessage = string | Partial<Record<Intl.LDMLPluralRule, string>>

export interface CustomLocalizationPack {
  id: string
  name: string
  locale: string
  baseLanguage: 'en' | 'ru'
  messages: Record<string, Record<string, LocalizedMessage>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateLocalizationPack(value: unknown): asserts value is CustomLocalizationPack {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value.id)
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120
    || typeof value.locale !== 'string' || !['en', 'ru'].includes(String(value.baseLanguage))
    || !isRecord(value.messages) || !Object.keys(value.messages).length) throw new Error('Invalid localization pack')
  new Intl.PluralRules(value.locale)
  const validText = (text: unknown) => typeof text === 'string' && text.trim().length > 0
  for (const messages of Object.values(value.messages)) {
    if (!isRecord(messages)) throw new Error('Invalid localization namespace')
    for (const message of Object.values(messages)) {
      if (validText(message)) continue
      if (!isRecord(message) || !validText(message.other)
        || Object.entries(message).some(([key, text]) => !['zero', 'one', 'two', 'few', 'many', 'other'].includes(key) || !validText(text))) {
        throw new Error('Invalid localization message')
      }
    }
  }
}

export function selectedLocalization(general: { customLocalizations?: CustomLocalizationPack[]; customLocalization?: string | null }): CustomLocalizationPack | undefined {
  return general.customLocalizations?.find(pack => pack.id === general.customLocalization)
}
