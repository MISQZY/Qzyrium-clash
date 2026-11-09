import { createContext, useContext, useEffect, useCallback, type ReactNode } from 'react'
import { translate, type Locale, type Namespace, type MessageKey } from './catalogs'

const LocaleContext = createContext<Locale>('en')

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => { document.documentElement.lang = locale }, [locale])
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export const useLocale = () => useContext(LocaleContext)

export function useTranslations<N extends Namespace>(namespace: N) {
  const locale = useLocale()
  return useCallback(
    (key: MessageKey<N>, values?: Record<string, string | number>) => translate(locale, namespace, key, values),
    [locale, namespace]
  )
}
