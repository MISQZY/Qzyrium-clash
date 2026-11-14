import { useEffect, useRef } from 'react'
import type { AppConfig } from '@shared/app-config'
import { selectedLocalization } from '@shared/custom-localization'
import { translate } from '../i18n/catalogs'
import type { NavigationStore, KernelStore } from './domains'
import { kernelFailureMessage } from '@shared/kernel-failure'

export function useWorkspaceEvents(nav: NavigationStore, kernel: KernelStore,
  general: AppConfig['general'], refreshAll: () => Promise<void>) {
  const { mounted, actionInProgress, statusRevision, setVisible, reportError } = nav
  const { setCoreStatus, setSessionStartedAt } = kernel
  const preferences = useRef(general)
  preferences.current = general

  useEffect(() => {
    mounted.current = true
    const visibility = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', visibility)
    void refreshAll().catch((err) => {
      if (mounted.current) reportError(err)
    })
    if (!window.api) {
      return () => {
        mounted.current = false
        document.removeEventListener('visibilitychange', visibility)
      }
    }

    const unsubStatus = window.api.events.onCoreStatus((status) => {
      statusRevision.current++
      setCoreStatus(status)
      if (status === 'error' && window.api.kernel.getFailure) {
        const revision = statusRevision.current
        void window.api.kernel.getFailure().then(failure => {
          if (mounted.current && revision === statusRevision.current && failure) reportError(kernelFailureMessage(failure, preferences.current))
        }).catch(() => {})
      } else if (status === 'error' && !window.api.events.onCoreFailure) {
        reportError(
          translate(
            preferences.current.language,
            'app',
            'coreUnexpectedError',
            {},
            selectedLocalization(preferences.current)
          )
        )
      }
      if (status !== 'running') setSessionStartedAt(null)
      else {
        const revision = statusRevision.current
        void (window.api.kernel.getSessionStartedAt?.() ?? Promise.resolve(Date.now()))
          .then((startedAt) => {
            if (mounted.current && revision === statusRevision.current) {
              setSessionStartedAt(startedAt)
            }
          })
          .catch(reportError)
      }
      if (status === 'running' && !actionInProgress.current) {
        void refreshAll().catch(reportError)
      }
    })

    const unsubSettings = window.api.events.onSettingsChanged?.(() => {
      void refreshAll().catch(reportError)
    })

    const unsubFailure = window.api.events.onCoreFailure?.(failure => {
      reportError(kernelFailureMessage(failure, preferences.current))
    })

    const unsubTunError = window.api.events.onTunError?.(() => {
      if (window.api.events.onCoreFailure) return
      reportError(
        translate(
          preferences.current.language,
          'app',
          'tunStartRequiresAdmin',
          {},
          selectedLocalization(preferences.current)
        )
      )
    })

    const unsubVisibility = window.api.events.onWindowVisibility?.((isWinVisible) => {
      setVisible(isWinVisible)
      if (isWinVisible) {
        void refreshAll().catch(reportError)
      }
    })

    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', visibility)
      unsubStatus()
      unsubFailure?.()
      unsubSettings?.()
      unsubTunError?.()
      unsubVisibility?.()
    }
  }, [refreshAll, reportError, actionInProgress, mounted, statusRevision, setCoreStatus, setSessionStartedAt, setVisible])
}
