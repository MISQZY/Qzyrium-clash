
import { type SettingsSection } from '@shared/settings-config'
import { SETTINGS_SECTIONS } from '../../lib/settings-sections'
import { useTranslations } from '../../i18n'

import druseSvg from '../../assets/brand/druse.svg'

import type { AppConfig } from '@shared/app-config'
import type { SysProxyStatus } from '@shared/ipc'
import type { LogLevel } from '@shared/types'

import { SettingRow } from '../Page'
import { Card, CardContent } from '../ui/card'

import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Switch } from '../ui/switch'
import { SettingsFields } from '../SettingsFields'

import { coreFields, tunFields } from '@shared/settings-fields'

import type { SettingsDraft } from '../../hooks/useSettingsDraft'

export function NetworkSettingsPanel({ section, draft, settings, sysProxy, busy, onToggleSysProxy,
  isElevated, restartingAdmin, handleRestartAsAdmin, setTunAdminPrompt }: {
  section: Exclude<SettingsSection, 'settings'>; draft: SettingsDraft; settings: AppConfig; sysProxy: SysProxyStatus
  busy: boolean; onToggleSysProxy: () => void; isElevated: boolean | null; restartingAdmin: boolean
  handleRestartAsAdmin: () => Promise<void>; setTunAdminPrompt: (value: boolean) => void
}) {
  const t = useTranslations('networksettings')
  const common = useTranslations('common')
  const { form, bypass, setBypass, dnsHijack, setDnsHijack, setDirty, setMessage, updateKernel, updateTun, updateSysProxy } = draft
  const { title: titleKey, icon: Icon } = SETTINGS_SECTIONS[section]
  const title = t(titleKey)
  return <Card><CardContent className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-primary" />{title}</h2>
        {section === 'tun' && <>
          {isElevated === false && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3.5 text-xs text-warning">
              <span className="min-w-0 flex-1 leading-relaxed">
                {t('tunAdminExplanation')}
              </span>
              <button
                type="button"
                disabled={restartingAdmin}
                onClick={() => void handleRestartAsAdmin()}
                className="shrink-0 rounded bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-black transition-transform hover:opacity-90 active:scale-95"
              >
                {restartingAdmin ? common('restarting') || 'Restarting...' : common('restartAsAdministrator')}
              </button>
            </div>
          )}
          <SettingRow
            title={t('enableTUN')}
            description={
              isElevated === false
                ? t('tunAdminExplanation')
                : sysProxy.enabled
                ? t('tunDisabledDueToSysProxy')
                : t('capturesTrafficFromApplicationsThatDoNotUseTheSystemProxy')
            }
          >
            <Switch
              aria-label={t('enableTUN')}
              checked={form.kernel.tun.enable}
              disabled={busy || sysProxy.enabled}
              onCheckedChange={(enable) => {
                if (enable && isElevated === false) {
                  setTunAdminPrompt(true)
                  setMessage('tunRequiresAdmin')
                  return
                }
                updateTun({ enable })
              }}
            />
          </SettingRow>
          <SettingRow title={t('networkStack')} description={t('chooseHowTheVirtualInterfaceHandlesPackets')}><select aria-label={t('networkStack')} value={form.kernel.tun.stack} onChange={(event) => updateTun({ stack: event.target.value as AppConfig['kernel']['tun']['stack'] })}><option value="system">{t('system')}</option><option value="gvisor">gVisor</option><option value="mixed">{t('mixed')}</option></select></SettingRow>
          <SettingRow title={t('automaticRouting')} description={t('createRoutesForTheVirtualInterface')}><Switch aria-label={t('automaticRouting')} checked={form.kernel.tun.autoRoute} onCheckedChange={(autoRoute) => updateTun({ autoRoute })} /></SettingRow>
          <SettingRow title={t('strictRouting')} description={t('restrictTrafficThatCouldBypassTheVirtualInterface')}><Switch aria-label={t('strictRouting')} checked={form.kernel.tun.strictRoute} onCheckedChange={(strictRoute) => updateTun({ strictRoute })} /></SettingRow>
          <label className="mt-4 flex flex-col gap-2 text-xs font-medium">{t('dNSHijackDestinations')}<span className="font-normal text-muted-foreground">{t('oneEntryPerLineForExampleAny53')}</span><Textarea value={dnsHijack} onChange={(event) => { setDnsHijack(event.target.value); setDirty(true) }} rows={3} /></label>
          <div className="mt-5"><SettingsFields prefix="tun-options" fields={tunFields} value={form.kernel.tun.options ?? {}} onChange={(options) => updateTun({ options })} /></div>
        </>}
        {section === 'sysproxy' && <>
          <SettingRow
            title={t('systemProxy')}
            description={
              form.kernel.tun.enable || settings.kernel.tun.enable
                ? t('sysProxyDisabledDueToTun')
                : t('endpoint', { host: sysProxy.host ?? '127.0.0.1', port: sysProxy.port })
            }
          >
            <Switch
              aria-label={t('systemProxyEnabled')}
              checked={sysProxy.enabled}
              disabled={busy || form.kernel.tun.enable || settings.kernel.tun.enable}
              onCheckedChange={onToggleSysProxy}
            />
          </SettingRow>
          <SettingRow title={t('proxyMode')}><select aria-label={t('proxyMode')} value={form.sysProxy.mode ?? 'manual'} onChange={(event) => updateSysProxy({ mode: event.target.value as 'manual' | 'pac' })}><option value="manual">{t('manualProxy')}</option><option value="pac">PAC</option></select></SettingRow>
          <label className="mt-4 flex flex-col gap-2 text-xs font-medium">{t('proxyHost')}<Input aria-label={t('proxyHost')} value={form.sysProxy.host ?? '127.0.0.1'} onChange={(event) => updateSysProxy({ host: event.target.value })} /></label>
          {form.sysProxy.mode === 'pac' && <label className="mt-4 flex flex-col gap-2 text-xs font-medium">{t('pacScript')}<Textarea aria-label={t('pacScript')} rows={7} className="font-mono text-xs" value={form.sysProxy.pacScript ?? ''} placeholder={t('pacScriptHint')} onChange={(event) => updateSysProxy({ pacScript: event.target.value })} /></label>}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t('applicationsThatHonorWindowsProxySettingsWillUseThisEndpointTUNCanCaptureTrafficFromOtherApplications')}</p>
          <label className="mt-5 flex flex-col gap-2 text-xs font-medium">{t('bypassList')}<span className="font-normal text-muted-foreground">{t('oneHostOrWildcardPerLineLocalDestinationsAreExcludedByDefault')}</span><Textarea value={bypass} onChange={(event) => { setBypass(event.target.value); setDirty(true) }} rows={9} className="font-mono" /></label>
        </>}
        {section === 'mihomo' && <>
          <div className="adaptive-grid mb-3">
            <label className="flex flex-col gap-2 text-xs font-medium">{t('mixedPortHTTPSOCKS5')}<Input type="number" min={1} max={65535} required value={form.kernel.mixedPort || ''} onChange={(event) => updateKernel({ mixedPort: Number(event.target.value) })} /></label>
            <label className="flex flex-col gap-2 text-xs font-medium">{t('controllerPort')}<Input type="number" min={1} max={65535} required value={form.kernel.controllerPort || ''} onChange={(event) => updateKernel({ controllerPort: Number(event.target.value) })} /></label>
          </div>
          <label className="mb-4 flex flex-col gap-2 text-xs font-medium">{t('controllerSecret')}<Input type="password" autoComplete="off" value={form.kernel.controllerSecret} onChange={(event) => updateKernel({ controllerSecret: event.target.value })} /></label>
          <SettingRow title={t('allowLANAccess')} description={t('letOtherDevicesConnectToTheLocalProxy')}><Switch aria-label={t('allowLANAccess')} checked={form.kernel.allowLan} onCheckedChange={(allowLan) => updateKernel({ allowLan })} /></SettingRow>
          <SettingRow title={t('logLevel')} description={t('controlsTheVerbosityOfTheCoreLogStream')}><select aria-label={t('logLevel')} value={form.kernel.logLevel} onChange={(event) => updateKernel({ logLevel: event.target.value as LogLevel })}>{['debug', 'info', 'warning', 'error', 'silent'].map((level) => <option key={level} value={level}>{common(level as 'debug' | 'info' | 'warning' | 'error' | 'silent')}</option>)}</select></SettingRow>
          <p className="mt-4 text-xs text-muted-foreground">{t('savingCoreSettingsRestartsMihomoExistingSessionsWillReconnect')}</p>
          <div className="mt-5"><SettingsFields prefix="core-options" fields={coreFields} value={form.kernel.options ?? {}} onChange={(options) => updateKernel({ options })} /></div>
        </>}
      </CardContent></Card>
}
