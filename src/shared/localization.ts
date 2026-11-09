import en from './locales/en.json'
import ru from './locales/ru.json'

export function nativeMessage(locale: 'en' | 'ru', key: keyof typeof en): string {
  return (locale === 'ru' ? ru : en)[key]
}
