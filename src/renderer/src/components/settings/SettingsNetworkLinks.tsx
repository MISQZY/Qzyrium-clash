import { ChevronRight, HelpCircle } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import { SystemProxyIcon, TunIcon, DnsIcon, SnifferIcon, ResourcesIcon } from '../../lib/icons'
import type { AppConfig } from '@shared/app-config'
import { DEFAULT_APP_CONFIG } from '@shared/app-config'
import { createSettingsSectionPatch } from '@shared/settings-config'
import type { SysProxyStatus } from '@shared/ipc'
import type { NavTab } from '../../lib/navigation'
import { useTranslations } from '../../i18n'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Switch } from '../ui/switch'
import type { SettingsDraft } from '../../hooks/useSettingsDraft'

export function SettingsNetworkLinks({ draft, settings, sysProxy, busy, onSaveSettings, onNavigate }: {
  draft: SettingsDraft; settings: AppConfig; sysProxy: SysProxyStatus; busy: boolean
  onSaveSettings: (patch: Partial<AppConfig>) => Promise<void>; onNavigate?: (tab: NavTab) => void
}) {
  const t = useTranslations('networksettings')
  const common = useTranslations('common')
  const { form } = draft

  const toggleOverride = (section: 'dns' | 'sniffer' | 'resources', enabled: boolean) => {
    draft.updateKernel({ [section]: enabled ? (form.kernel[section] ?? settings.kernel[section] ?? {}) : null })
  }

  const links = [
    { target: 'sysproxy', icon: SystemProxyIcon, label: t('systemProxy'), description: `${sysProxy.enabled ? t('enabledValue') : t('disabledValue')} • ${sysProxy.host ?? DEFAULT_APP_CONFIG.sysProxy.host}:${sysProxy.port ?? DEFAULT_APP_CONFIG.kernel.mixedPort}` },
    { target: 'tun', icon: TunIcon, label: t('tUNInterface'), description: `${form.kernel.tun.enable ? t('enabledValue') : t('disabledValue')} • ${form.kernel.tun.stack}` },
    { target: 'dns', icon: DnsIcon, label: common('dns'), description: form.kernel.dns ? t('overridden') : t('fromSubscription') },
    { target: 'sniffer', icon: SnifferIcon, label: common('sniffer'), description: form.kernel.sniffer ? t('overridden') : t('fromSubscription') },
    { target: 'resources', icon: ResourcesIcon, label: common('resources'), description: form.kernel.resources ? t('overridden') : t('fromSubscription') }
  ] as const
  return (
    <Card>
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <SystemProxyIcon className="size-4 text-primary" />
              {t('networkSection')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('networkSectionDescription')}
            </p>
          </div>
        </div>

        <Tooltip.Provider delayDuration={200}>
          <div className="divide-y divide-border/50 flex flex-col">
            {links.map(({ target, icon: Icon, label, description }) => {
              const overrideSection = target === 'dns' || target === 'sniffer' || target === 'resources' ? target : null
              const enabled = overrideSection === null || form.kernel[overrideSection] != null
              return (
                <div key={target} className="py-3 flex items-center justify-between gap-3 first:pt-1 last:pb-1">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-8 rounded-md bg-muted/60 text-muted-foreground flex items-center justify-center shrink-0"><Icon className="size-4" /></div>
                    <div className="flex flex-col min-w-0"><span className="text-xs font-medium text-foreground">{label}</span><span className="text-[11px] text-muted-foreground truncate">{description}</span></div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {overrideSection && <>
                      {!enabled && (
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <button type="button" data-inherit-hint={target} aria-label={t('subscriptionSettingsHint')} className="text-muted-foreground hover:text-foreground">
                              <HelpCircle className="size-4" />
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Portal><Tooltip.Content side="top" sideOffset={6} className="sidebar-tooltip max-w-72 break-words">
                            {t('subscriptionSettingsHint')}<Tooltip.Arrow className="fill-popover" />
                          </Tooltip.Content></Tooltip.Portal>
                        </Tooltip.Root>
                      )}
                      <Switch data-override-section={target} aria-label={t('overrideSection', { name: label })} checked={enabled} disabled={busy} onCheckedChange={(next) => toggleOverride(overrideSection, next)} />
                    </>}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-nav-target={target}
                      disabled={!enabled || busy}
                      onClick={async () => {
                        if (draft.dirty) {
                          try {
                            await onSaveSettings(createSettingsSectionPatch('settings', { form, bypass: draft.bypass, dnsHijack: draft.dnsHijack, fallbackDns: draft.fallbackDns }, settings))
                            draft.setDirty(false)
                          } catch {
                            draft.setMessage('changesCouldNotBeAppliedCheckTheErrorAbove')
                            return
                          }
                        }
                        onNavigate?.(target)
                      }}
                      className="gap-1 h-7 text-xs shrink-0"
                    >
                      <span>{t('configure')}</span><ChevronRight className="size-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Tooltip.Provider>
      </CardContent>
    </Card>
  )
}
