import { useEffect, useState, type FormEvent } from 'react'
import type { AppConfig } from '@shared/app-config'
import { createSettingsSectionPatch, resetSettingsSection, type SettingsSection } from '@shared/settings-config'
import type { MessageKey } from '../i18n/catalogs'

export function useSettingsDraft(section: SettingsSection, settings: AppConfig,
  onSave: (patch: Partial<AppConfig>) => Promise<void>) {
  const [form, setForm] = useState(settings)
  const [bypass, setBypass] = useState(settings.sysProxy.bypass.join('\n'))
  const [dnsHijack, setDnsHijack] = useState(settings.kernel.tun.dnsHijack.join('\n'))
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<MessageKey<'networksettings'> | ''>('')

  useEffect(() => {
    setForm(previous => ({ ...previous, general: { ...previous.general, language: settings.general.language,
      theme: settings.general.theme, customLocalization: settings.general.customLocalization } }))
  }, [settings.general.language, settings.general.theme, settings.general.customLocalization])
  useEffect(() => {
    if (dirty) return
    setForm(settings)
    setBypass(settings.sysProxy.bypass.join('\n'))
    setDnsHijack(settings.kernel.tun.dnsHijack.join('\n'))
  }, [settings, dirty])

  const updateKernel = (patch: Partial<AppConfig['kernel']>) => {
    setDirty(true); setMessage('')
    setForm(previous => ({ ...previous, kernel: { ...previous.kernel, ...patch } }))
  }
  const updateTun = (patch: Partial<AppConfig['kernel']['tun']>) => {
    setDirty(true); setMessage('')
    setForm(previous => ({ ...previous, kernel: { ...previous.kernel, tun: { ...previous.kernel.tun, ...patch } } }))
  }
  const updateGeneral = (patch: Partial<AppConfig['general']>) => {
    setDirty(true); setMessage('')
    setForm(previous => ({ ...previous, general: { ...previous.general, ...patch } }))
  }
  const updateSysProxy = (patch: Partial<AppConfig['sysProxy']>) => {
    setDirty(true); setMessage('')
    setForm(previous => ({ ...previous, sysProxy: { ...previous.sysProxy, ...patch } }))
  }
  const discard = () => {
    setForm(settings); setBypass(settings.sysProxy.bypass.join('\n'))
    setDnsHijack(settings.kernel.tun.dnsHijack.join('\n')); setDirty(false); setMessage('')
  }
  const resetToDefaults = () => {
    const reset = resetSettingsSection(form, section)
    setForm(reset)
    setBypass(reset.sysProxy.bypass.join('\n'))
    setDnsHijack(reset.kernel.tun.dnsHijack.join('\n'))
    setDirty(true)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setMessage('')
    if (section === 'mihomo' && form.kernel.mixedPort === form.kernel.controllerPort) {
      setMessage('mixedAndControllerPortsMustBeDifferent'); return
    }
    try {
      await onSave(createSettingsSectionPatch(section, { form, bypass, dnsHijack }, settings))
      setDirty(false); setMessage('changesSaved')
    } catch { setMessage('changesCouldNotBeAppliedCheckTheErrorAbove') }
  }
  return { form, setForm, bypass, setBypass, dnsHijack, setDnsHijack, dirty, setDirty, message, setMessage,
    updateKernel, updateTun, updateGeneral, updateSysProxy, discard, resetToDefaults, save }
}

export type SettingsDraft = ReturnType<typeof useSettingsDraft>
