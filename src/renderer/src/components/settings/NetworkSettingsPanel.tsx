import { NativeSelect } from '../ui/native-select'
import { type SettingsSection } from '@shared/settings-config'
import { SETTINGS_SECTIONS } from '../../lib/settings-sections'
import { useTranslations } from '../../i18n'
import { SettingsDisclosure } from '../SettingsDisclosure'
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
import { EffectiveCoreSummary } from './EffectiveCoreSummary'
import { AdminElevationNotice } from './AdminElevationNotice'
import { CoreVersionSection } from './CoreVersionSection'

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
            <AdminElevationNotice
              className="mb-4 p-3.5"
              restartingAdmin={restartingAdmin}
              onRestartAsAdmin={handleRestartAsAdmin}
            />
          )}
          <SettingRow
            title={t('enableTUN')}
            description={
              window.api?.platform === 'win32' && isElevated === false
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
                if (enable && window.api?.platform === 'win32' && isElevated === false) {
                  setTunAdminPrompt(true)
                  setMessage('tunRequiresAdmin')
                  return
                }
                updateTun({ enable })
              }}
            />
          </SettingRow>
          <SettingRow title={t('networkStack')} description={t('chooseHowTheVirtualInterfaceHandlesPackets')}><NativeSelect aria-label={t('networkStack')} value={form.kernel.tun.stack} onChange={(event) => updateTun({ stack: event.target.value as AppConfig['kernel']['tun']['stack'] })}><option value="system">{t('system')}</option><option value="gvisor">gVisor</option><option value="mixed">{t('mixed')}</option></NativeSelect></SettingRow>
          <SettingRow title={t('automaticRouting')} description={t('createRoutesForTheVirtualInterface')}><Switch aria-label={t('automaticRouting')} checked={form.kernel.tun.autoRoute} onCheckedChange={(autoRoute) => updateTun({ autoRoute })} /></SettingRow>
          <SettingRow title={t('strictRouting')} description={t('restrictTrafficThatCouldBypassTheVirtualInterface')}><Switch aria-label={t('strictRouting')} checked={form.kernel.tun.strictRoute} onCheckedChange={(strictRoute) => updateTun({ strictRoute })} /></SettingRow>
          <SettingRow title={t('tunIpv6Routing')} description={t('tunIpv6RoutingDescription')}><Switch aria-label={t('tunIpv6Routing')} checked={form.kernel.tun.ipv6 ?? false} onCheckedChange={(ipv6) => updateTun({ ipv6 })} /></SettingRow>
          <SettingRow title={t('resilientDnsFallback')} description={t('resilientDnsFallbackDescription')}><Switch aria-label={t('resilientDnsFallback')} checked={form.kernel.tun.resilientDns ?? true} onCheckedChange={(resilientDns) => updateTun({ resilientDns })} /></SettingRow>
          <label className="mt-4 flex flex-col gap-2 text-xs font-medium">{t('dNSHijackDestinations')}<span className="font-normal text-muted-foreground">{t('oneEntryPerLineForExampleAny53')}</span><Textarea value={dnsHijack} onChange={(event) => { setDnsHijack(event.target.value); setDirty(true) }} rows={3} /></label>
          <SettingsDisclosure title={t('advancedTun')}><SettingsFields prefix="tun-options" fields={tunFields} value={form.kernel.tun.options ?? {}} onChange={(options) => updateTun({ options })} /></SettingsDisclosure>
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
          <SettingRow title={t('proxyMode')}><NativeSelect aria-label={t('proxyMode')} value={form.sysProxy.mode ?? 'manual'} onChange={(event) => updateSysProxy({ mode: event.target.value as 'manual' | 'pac' })}><option value="manual">{t('manualProxy')}</option><option value="pac">PAC</option></NativeSelect></SettingRow>
          <label className="mt-4 flex flex-col gap-2 text-xs font-medium">{t('proxyHost')}<Input aria-label={t('proxyHost')} value={form.sysProxy.host ?? '127.0.0.1'} onChange={(event) => updateSysProxy({ host: event.target.value })} /></label>
          {form.sysProxy.mode === 'pac' && <label className="mt-4 flex flex-col gap-2 text-xs font-medium">{t('pacScript')}<Textarea aria-label={t('pacScript')} rows={7} className="font-mono text-xs" value={form.sysProxy.pacScript ?? ''} placeholder={t('pacScriptHint')} onChange={(event) => updateSysProxy({ pacScript: event.target.value })} /></label>}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t('applicationsThatHonorWindowsProxySettingsWillUseThisEndpointTUNCanCaptureTrafficFromOtherApplications')}</p>
          <label className="mt-5 flex flex-col gap-2 text-xs font-medium">{t('bypassList')}<span className="font-normal text-muted-foreground">{t('oneHostOrWildcardPerLineLocalDestinationsAreExcludedByDefault')}</span><Textarea value={bypass} onChange={(event) => { setBypass(event.target.value); setDirty(true) }} rows={9} className="font-mono" /></label>
        </>}
        {section === 'mihomo' && <>
          <CoreVersionSection
            channel={form.kernel.channel ?? 'stable'}
            onChannelChange={(channel) => draft.setForm(previous => ({ ...previous, kernel: { ...previous.kernel, channel } }))}
          />
          <SettingRow title={t('mixedPortSource')}>
            <NativeSelect aria-label={t('mixedPortSource')} value={form.kernel.inheritMixedPort ? 'profile' : 'override'}
              onChange={event => updateKernel({ inheritMixedPort: event.target.value === 'profile' })}>
              <option value="profile">{t('valueFromProfile')}</option><option value="override">{t('valueOverride')}</option>
            </NativeSelect>
          </SettingRow>
          <div className="adaptive-grid mt-4 mb-3">
            <label className="flex flex-col gap-2 text-xs font-medium">{t('mixedPortHTTPSOCKS5')}<Input type="number" min={1} max={65535} required disabled={!!form.kernel.inheritMixedPort} value={form.kernel.mixedPort || ''} onChange={(event) => updateKernel({ mixedPort: Number(event.target.value) })} /></label>
            <label className="flex flex-col gap-2 text-xs font-medium">{t('controllerPort')}<Input type="number" min={1} max={65535} required value={form.kernel.controllerPort || ''} onChange={(event) => updateKernel({ controllerPort: Number(event.target.value) })} /></label>
          </div>
          <label className="mb-4 flex flex-col gap-2 text-xs font-medium">{t('controllerSecret')}<Input type="password" autoComplete="off" value={form.kernel.controllerSecret} onChange={(event) => updateKernel({ controllerSecret: event.target.value })} /></label>
          <SettingRow title={t('allowLANAccess')} description={t('letOtherDevicesConnectToTheLocalProxy')}><Switch aria-label={t('allowLANAccess')} checked={form.kernel.allowLan} onCheckedChange={(allowLan) => updateKernel({ allowLan })} /></SettingRow>
          <SettingRow title={t('logLevelSource')}>
            <NativeSelect aria-label={t('logLevelSource')} value={form.kernel.inheritLogLevel ? 'profile' : 'override'}
              onChange={event => updateKernel({ inheritLogLevel: event.target.value === 'profile' })}>
              <option value="profile">{t('valueFromProfile')}</option><option value="override">{t('valueOverride')}</option>
            </NativeSelect>
          </SettingRow>
          <SettingRow title={t('logLevel')} description={t('controlsTheVerbosityOfTheCoreLogStream')}><NativeSelect aria-label={t('logLevel')} disabled={!!form.kernel.inheritLogLevel} value={form.kernel.logLevel} onChange={(event) => updateKernel({ logLevel: event.target.value as LogLevel })}>{['debug', 'info', 'warning', 'error', 'silent'].map((level) => <option key={level} value={level}>{common(level as 'debug' | 'info' | 'warning' | 'error' | 'silent')}</option>)}</NativeSelect></SettingRow>
          <p className="mt-4 text-xs text-muted-foreground">{t('savingCoreSettingsRestartsMihomoExistingSessionsWillReconnect')}</p>
          <SettingsDisclosure title={t('advancedCore')}><SettingsFields prefix="core-options" fields={coreFields} value={form.kernel.options ?? {}} onChange={(options) => updateKernel({ options })} /></SettingsDisclosure>
          <EffectiveCoreSummary kernel={form.kernel} />
        </>}
      </CardContent></Card>
}
