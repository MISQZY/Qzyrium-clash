import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { AppConfig } from '@shared/app-config'
import { createSettingsSectionPatch, resetSettingsSection, type SettingsSection } from '@shared/settings-config'
import type { MessageKey } from '../i18n/catalogs'

export function useSettingsDraft(section: SettingsSection, settings: AppConfig,
  onSave: (patch: Partial<AppConfig>) => Promise<void>) {
  const [form, setForm] = useState(settings)
  const [bypass, setBypass] = useState(settings.sysProxy.bypass.join('\n'))
  const [dnsHijack, setDnsHijack] = useState(settings.kernel.tun.dnsHijack.join('\n'))
  const [fallbackDns, setFallbackDns] = useState((settings.kernel.tun.fallbackDns ?? ['77.88.8.8']).join('\n'))
  const [hasEdits, setHasEdits] = useState(false)
  const [message, setMessage] = useState<MessageKey<'networksettings'> | ''>('')
  const prevSettingsRef = useRef(settings)

  const dirty = useMemo(() => {
    if (!hasEdits) return false
    const formChanged = JSON.stringify(form) !== JSON.stringify(settings) ||
      bypass !== settings.sysProxy.bypass.join('\n') ||
      dnsHijack !== settings.kernel.tun.dnsHijack.join('\n') ||
      fallbackDns !== (settings.kernel.tun.fallbackDns ?? ['77.88.8.8']).join('\n')
    return formChanged
  }, [hasEdits, form, settings, bypass, dnsHijack, fallbackDns])

  useEffect(() => {
    setForm(previous => ({ ...previous, general: { ...previous.general, language: settings.general.language,
      theme: settings.general.theme, customLocalization: settings.general.customLocalization } }))
  }, [settings.general.language, settings.general.theme, settings.general.customLocalization])

  useEffect(() => {
    // General preferences expose capture as an immediate action, outside this draft.
    // Follow saved TUN state without discarding pending preference/override edits.
    if (section === 'settings') {
      setForm(previous => ({ ...previous, kernel: { ...previous.kernel, tun: settings.kernel.tun } }))
    }
  }, [section, settings.kernel.tun])

  useEffect(() => {
    if (prevSettingsRef.current !== settings) {
      prevSettingsRef.current = settings
      if (!hasEdits) {
        setForm(settings)
        setBypass(settings.sysProxy.bypass.join('\n'))
        setDnsHijack(settings.kernel.tun.dnsHijack.join('\n'))
        setFallbackDns((settings.kernel.tun.fallbackDns ?? ['77.88.8.8']).join('\n'))
      }
    }
  }, [settings, hasEdits])

  const setDirty = (val: boolean) => {
    setHasEdits(val)
  }

  const updateKernel = (patch: Partial<AppConfig['kernel']>) => {
    setHasEdits(true); setMessage('')
    setForm(previous => ({ ...previous, kernel: { ...previous.kernel, ...patch } }))
  }
  const updateTun = (patch: Partial<AppConfig['kernel']['tun']>) => {
    setHasEdits(true); setMessage('')
    setForm(previous => ({ ...previous, kernel: { ...previous.kernel, tun: { ...previous.kernel.tun, ...patch } } }))
  }
  const updateGeneral = (patch: Partial<AppConfig['general']>) => {
    setHasEdits(true); setMessage('')
    setForm(previous => ({ ...previous, general: { ...previous.general, ...patch } }))
  }
  const updateSysProxy = (patch: Partial<AppConfig['sysProxy']>) => {
    setHasEdits(true); setMessage('')
    setForm(previous => ({ ...previous, sysProxy: { ...previous.sysProxy, ...patch } }))
  }
  const discard = () => {
    setForm(settings); setBypass(settings.sysProxy.bypass.join('\n'))
    setDnsHijack(settings.kernel.tun.dnsHijack.join('\n'))
    setFallbackDns((settings.kernel.tun.fallbackDns ?? ['77.88.8.8']).join('\n'))
    setHasEdits(false); setMessage('')
  }
  const resetToDefaults = () => {
    const reset = resetSettingsSection(form, section)
    setForm(reset)
    setBypass(reset.sysProxy.bypass.join('\n'))
    setDnsHijack(reset.kernel.tun.dnsHijack.join('\n'))
    setFallbackDns((reset.kernel.tun.fallbackDns ?? ['77.88.8.8']).join('\n'))
    setHasEdits(true)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setMessage('')
    if (section === 'mihomo' && !form.kernel.inheritMixedPort && form.kernel.mixedPort === form.kernel.controllerPort) {
      setMessage('mixedAndControllerPortsMustBeDifferent'); return
    }
    try {
      await onSave(createSettingsSectionPatch(section, { form, bypass, dnsHijack, fallbackDns }, settings))
      setHasEdits(false); setMessage('changesSaved')
    } catch { setMessage('changesCouldNotBeAppliedCheckTheErrorAbove') }
  }
  return { form, setForm, bypass, setBypass, dnsHijack, setDnsHijack, fallbackDns, setFallbackDns, dirty, setDirty, message, setMessage,
    updateKernel, updateTun, updateGeneral, updateSysProxy, discard, resetToDefaults, save }
}

export type SettingsDraft = ReturnType<typeof useSettingsDraft>
