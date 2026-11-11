import { useState, useCallback } from 'react'
import { AppConfig, DEFAULT_APP_CONFIG } from '@shared/app-config'
import type { SysProxyStatus } from '@shared/ipc'
import { selectedLocalization } from '@shared/custom-localization'
import { translate } from '../../i18n/catalogs'
import type { StoreCoordinator } from './types'

export interface SettingsStore {
  settings: AppConfig
  setSettings: React.Dispatch<React.SetStateAction<AppConfig>>
  sysProxy: SysProxyStatus
  setSysProxy: React.Dispatch<React.SetStateAction<SysProxyStatus>>
  saveSettings: (patch: Partial<AppConfig>) => Promise<void>
  toggleSysProxy: () => Promise<boolean>
}

export function useSettingsStore(coord: StoreCoordinator): SettingsStore {
  const [settings, setSettings] = useState<AppConfig>(() => {
    const boot = window.api?.bootAppearance
    return boot
      ? {
          ...DEFAULT_APP_CONFIG,
          general: {
            ...DEFAULT_APP_CONFIG.general,
            theme: boot.preference,
            language: boot.language
          }
        }
      : DEFAULT_APP_CONFIG
  })

  const [sysProxy, setSysProxy] = useState<SysProxyStatus>({
    enabled: false,
    mode: 'manual',
    port: 7895
  })

  const saveSettings = useCallback(
    async (patch: Partial<AppConfig>) => {
      const success = await coord.perform(async () => {
        const updated = await window.api.settings.update(patch)
        setSettings(updated)
      })
      if (!success) {
        throw new Error(
          translate(
            settings.general.language,
            'common',
            'saveError',
            {},
            selectedLocalization(settings.general)
          )
        )
      }
    },
    [coord, settings.general]
  )

  const toggleSysProxy = useCallback(() => {
    return coord.perform(() => window.api.sysproxy.set(!sysProxy.enabled))
  }, [coord, sysProxy.enabled])

  return {
    settings,
    setSettings,
    sysProxy,
    setSysProxy,
    saveSettings,
    toggleSysProxy
  }
}
