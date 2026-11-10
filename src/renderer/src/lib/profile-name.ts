import type { ProfileItem } from '@shared/profile'
import { translate, type Locale } from '../i18n/catalogs'
import type { CustomLocalizationPack } from '@shared/custom-localization'

export function profileName(profile: ProfileItem, locale: Locale, custom?: CustomLocalizationPack): string {
  return profile.nameSource === 'fallback' ? translate(locale, 'common', 'unnamedProfile', {}, custom) : profile.name
}
