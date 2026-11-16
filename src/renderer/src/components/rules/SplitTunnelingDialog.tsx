import { useState, useMemo, useEffect } from 'react'
import {
  Sliders,
  Plus,
  Trash2,
  Check,
  LoaderCircle,
  AppWindow,
  Flame,
  Activity,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react'
import type { CustomRuleItem } from '@shared/profile'
import { createRuleId } from '@shared/rule-editor'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { ScrollArea } from '../ui/scroll-area'
import { ProcessIcon } from '../ProcessIcon'
import { useTranslations } from '../../i18n'
import { useProfiles, useConnections } from '../../stores/useAppStore'
import { getProcessDisplayName } from '../../lib/connections'

export interface SplitTunnelingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

interface PopularPreset {
  name: string
  processes: string[]
}

const POPULAR_PRESETS: PopularPreset[] = [
  { name: 'Discord', processes: ['Discord.exe'] },
  { name: 'Telegram', processes: ['Telegram.exe'] },
  { name: 'Steam', processes: ['steam.exe', 'steamwebhelper.exe'] },
  { name: 'Chrome', processes: ['chrome.exe'] },
  { name: 'Firefox', processes: ['firefox.exe'] },
  { name: 'Edge', processes: ['msedge.exe'] },
  { name: 'qBittorrent', processes: ['qbittorrent.exe'] },
  { name: 'Spotify', processes: ['Spotify.exe'] }
]

export function SplitTunnelingDialog({ open, onOpenChange, onSaved }: SplitTunnelingDialogProps) {
  const t = useTranslations('rules')
  const common = useTranslations('common')
  const { activeProfile } = useProfiles()
  const { connections } = useConnections()

  const [mode, setMode] = useState<'blacklist' | 'whitelist'>('blacklist')
  const [customExe, setCustomExe] = useState('')
  const [appRules, setAppRules] = useState<CustomRuleItem[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load existing PROCESS-NAME rules from activeProfile
  useEffect(() => {
    if (open && activeProfile?.customRules) {
      const processRules = activeProfile.customRules.filter(
        (r) => r.type === 'PROCESS-NAME' || r.type === 'PROCESS-PATH'
      )
      setAppRules(processRules)
      // Infer mode: if majority are DIRECT, blacklist. If PROXY, whitelist.
      const directCount = processRules.filter((r) => r.proxy === 'DIRECT').length
      const proxyCount = processRules.length - directCount
      if (proxyCount > directCount) {
        setMode('whitelist')
      } else {
        setMode('blacklist')
      }
      setSaved(false)
      setError(null)
    } else if (open && activeProfile) {
      void window.api?.profiles.getCustomRules(activeProfile.id).then((allRules) => {
        const processRules = allRules.filter(
          (r) => r.type === 'PROCESS-NAME' || r.type === 'PROCESS-PATH'
        )
        setAppRules(processRules)
      }).catch(() => {})
      setSaved(false)
      setError(null)
    }
  }, [open, activeProfile])

  // Extract currently running processes from active connections
  const activeProcesses = useMemo(() => {
    const procs = new Map<string, string | undefined>()
    if (connections?.connections) {
      for (const conn of connections.connections) {
        const name = getProcessDisplayName(conn.metadata.processPath, conn.metadata.process, '')
        if (name && !name.toLowerCase().includes('system') && !procs.has(name.toLowerCase())) {
          procs.set(name.toLowerCase(), conn.metadata.processPath)
        }
      }
    }
    return Array.from(procs.entries()).map(([lower, path]) => {
      // Find original casing
      const original = connections?.connections.find(
        (c) => getProcessDisplayName(c.metadata.processPath, c.metadata.process, '').toLowerCase() === lower
      )
      return {
        name: getProcessDisplayName(original?.metadata.processPath, original?.metadata.process, lower),
        path
      }
    })
  }, [connections])

  const configuredProcessNames = useMemo(() => {
    return new Set(appRules.map((r) => r.payload.toLowerCase()))
  }, [appRules])

  const handleAddProcess = (processName: string) => {
    const trimmed = processName.trim()
    if (!trimmed) return
    const formatted = trimmed.endsWith('.exe') ? trimmed : `${trimmed}.exe`
    if (configuredProcessNames.has(formatted.toLowerCase())) return

    const defaultProxy = mode === 'blacklist' ? 'DIRECT' : 'GLOBAL'
    const newRule: CustomRuleItem = {
      id: createRuleId(),
      type: 'PROCESS-NAME',
      payload: formatted,
      proxy: defaultProxy,
      position: 'top'
    }

    setAppRules((prev) => [newRule, ...prev])
    setCustomExe('')
  }

  const handleRemoveProcess = (id: string) => {
    setAppRules((prev) => prev.filter((r) => r.id !== id))
  }

  const handleToggleRuleProxy = (id: string) => {
    setAppRules((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const nextProxy = r.proxy === 'DIRECT' ? 'GLOBAL' : 'DIRECT'
        return { ...r, proxy: nextProxy }
      })
    )
  }

  const handleModeChange = (newMode: 'blacklist' | 'whitelist') => {
    setMode(newMode)
    const targetProxy = newMode === 'blacklist' ? 'DIRECT' : 'GLOBAL'
    // Update all process rules to match the new mode
    setAppRules((prev) => prev.map((r) => ({ ...r, proxy: targetProxy })))
  }

  const handleSave = async () => {
    if (!window.api || !activeProfile || saving) return

    setSaving(true)
    setError(null)
    try {
      const allRules = await window.api.profiles.getCustomRules(activeProfile.id)
      // Keep non-process rules
      const otherRules = allRules.filter(
        (r) => r.type !== 'PROCESS-NAME' && r.type !== 'PROCESS-PATH'
      )
      // Merge: appRules on top + other rules
      const updated = [...appRules, ...otherRules]
      await window.api.profiles.saveCustomRules(activeProfile.id, updated)
      setSaved(true)
      onSaved?.()
      setTimeout(() => {
        onOpenChange(false)
        setSaved(false)
      }, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
              <Sliders className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">{t('splitTunnelingTitle')}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {t('splitTunnelingDescription')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 p-5 max-h-[75dvh] overflow-y-auto">
          {/* Mode Selector */}
          <div className="flex flex-col gap-2 p-3 rounded-xl border border-border/70 bg-muted/20">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              {mode === 'blacklist' ? (
                <ShieldCheck className="size-3.5 text-emerald-500" />
              ) : (
                <ShieldAlert className="size-3.5 text-blue-500" />
              )}
              {t('splitMode')}
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleModeChange('blacklist')}
                className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  mode === 'blacklist'
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-foreground shadow-xs'
                    : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                  <span>{t('blacklistMode')}</span>
                </div>
                <span className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {t('blacklistDesc')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('whitelist')}
                className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  mode === 'whitelist'
                    ? 'border-blue-500/60 bg-blue-500/10 text-foreground shadow-xs'
                    : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-blue-600 dark:text-blue-400">
                  <span>{t('whitelistMode')}</span>
                </div>
                <span className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {t('whitelistDesc')}
                </span>
              </button>
            </div>
          </div>

          {/* Quick Add Custom App */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{t('addCustomApp')}</span>
            <div className="flex items-center gap-2">
              <Input
                value={customExe}
                onChange={(e) => setCustomExe(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddProcess(customExe))}
                placeholder={t('appNamePlaceholder')}
                className="font-mono text-xs h-8 flex-1"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleAddProcess(customExe)}
                disabled={!customExe.trim()}
                className="gap-1 h-8 text-xs shrink-0"
              >
                <Plus className="size-3.5" />
                <span>{t('add')}</span>
              </Button>
            </div>
          </div>

          {/* Running Applications Quick Chips */}
          {activeProcesses.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Activity className="size-3 text-emerald-500" />
                <span>{t('activeProcesses')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeProcesses.map((proc) => {
                  const isAdded = configuredProcessNames.has(proc.name.toLowerCase())
                  return (
                    <button
                      key={proc.name}
                      type="button"
                      disabled={isAdded}
                      onClick={() => handleAddProcess(proc.name)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono border transition-all cursor-pointer ${
                        isAdded
                          ? 'border-border/40 bg-muted/30 text-muted-foreground/50 cursor-default'
                          : 'border-border/70 bg-card hover:bg-primary/10 hover:border-primary/40 text-foreground'
                      }`}
                    >
                      <ProcessIcon processName={proc.name} processPath={proc.path} className="size-3.5" />
                      <span>{proc.name}</span>
                      {!isAdded && <Plus className="size-3 text-primary opacity-60 ml-0.5" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Popular Presets */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Flame className="size-3 text-amber-500" />
              <span>{t('popularPresets')}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_PRESETS.map((preset) => {
                const allAdded = preset.processes.every((p) => configuredProcessNames.has(p.toLowerCase()))
                return (
                  <button
                    key={preset.name}
                    type="button"
                    disabled={allAdded}
                    onClick={() => preset.processes.forEach(handleAddProcess)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] border transition-all cursor-pointer ${
                      allAdded
                        ? 'border-border/40 bg-muted/30 text-muted-foreground/50 cursor-default'
                        : 'border-border/70 bg-card hover:bg-primary/10 hover:border-primary/40 text-foreground font-medium'
                    }`}
                  >
                    <ProcessIcon processName={preset.processes[0]} className="size-3.5" />
                    <span>{preset.name}</span>
                    {allAdded ? (
                      <Check className="size-3 text-success ml-0.5" />
                    ) : (
                      <Plus className="size-3 text-primary opacity-60 ml-0.5" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Configured Apps List */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>{t('configuredApps')}</span>
              <span className="tabular-nums font-mono text-[11px]">{appRules.length}</span>
            </div>

            {appRules.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-border/80 text-center text-xs text-muted-foreground">
                <AppWindow className="size-6 mx-auto mb-2 opacity-40" />
                <p>{t('noConfiguredApps')}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {appRules.map((rule) => {
                  const isDirect = rule.proxy === 'DIRECT'
                  return (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border/70 bg-card/60 hover:border-border transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <ProcessIcon processName={rule.payload} className="size-4 shrink-0" />
                        <span className="font-mono text-foreground font-medium truncate">{rule.payload}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleRuleProxy(rule.id)}
                          title={t('toggleRouting')}
                          aria-label={t('toggleRouting')}
                          className="cursor-pointer"
                        >
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-mono px-2 py-0.5 transition-colors ${
                              isDirect
                                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {rule.proxy}
                          </Badge>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveProcess(rule.id)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">{error}</p>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border/60 bg-muted/20 flex flex-row items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('cancel')}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving || saved}
            className="gap-1.5"
          >
            {saving ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : saved ? (
              <Check className="size-3.5 text-success" />
            ) : (
              <Sliders className="size-3.5" />
            )}
            <span>{saved ? t('appliedSuccessfully') : common('save')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
