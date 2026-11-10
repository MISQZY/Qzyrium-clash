import { createContext, useContext, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { translate, type Locale, type Namespace, type MessageKey } from './catalogs'
import type { CustomLocalizationPack } from '@shared/custom-localization'

const LocaleContext = createContext<{ locale: Locale; custom?: CustomLocalizationPack }>({ locale: 'en' })

export function I18nProvider({ locale, custom, children }: { locale: Locale; custom?: CustomLocalizationPack; children: ReactNode }) {
  useEffect(() => { document.documentElement.lang = custom?.locale ?? locale }, [locale, custom])
  const value = useMemo(() => ({ locale, custom }), [locale, custom])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export const useLocale = () => {
  return useContext(LocaleContext).locale
}

export const useCustomLocalization = () => useContext(LocaleContext).custom

export function useTranslations<N extends Namespace>(namespace: N) {
  const { locale, custom } = useContext(LocaleContext)
  return useCallback(
    (key: MessageKey<N>, values?: Record<string, string | number>) => translate(locale, namespace, key, values, custom),
    [locale, namespace, custom]
  )
}
