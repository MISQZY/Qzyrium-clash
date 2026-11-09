import type { ProfileItem } from '@shared/profile'
import { translate, type Locale } from '../i18n/catalogs'

export function profileName(profile: ProfileItem, locale: Locale): string {
  return profile.nameSource === 'fallback' ? translate(locale, 'common', 'unnamedProfile') : profile.name
}
