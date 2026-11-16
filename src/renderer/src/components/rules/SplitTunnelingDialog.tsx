import { useState, useMemo, useEffect } from 'react'
import { Sliders, Plus, Trash2, LoaderCircle, AppWindow, Search, Activity } from 'lucide-react'
import type { CustomRuleItem } from '@shared/profile'
import type { ConnectionItem } from '@shared/mihomo'
import { createRuleId } from '@shared/rule-editor'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { NativeSelect } from '../ui/native-select'
import { ProcessIcon } from '../ProcessIcon'
import { useTranslations } from '../../i18n'
import { useProfiles, useProxies } from '../../stores/useAppStore'
import { getProcessDisplayName } from '../../lib/connections'

export interface SplitTunnelingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

// Subscription overrides belong to the full editor; removing one may restore a source rule.
const isAppRule = (rule: CustomRuleItem) =>
  (rule.type === 'PROCESS-NAME' || rule.type === 'PROCESS-PATH') &&
  rule.sourceRule === undefined && !rule.isDeleted

function normalizeApp(value: string) {
  const payload = value.trim().replace(/^"(.*)"$/, '$1').trim()
  return { payload, type: /[/\\]/.test(payload) ? 'PROCESS-PATH' : 'PROCESS-NAME' }
}

export function SplitTunnelingDialog({ open, onOpenChange, onSaved }: SplitTunnelingDialogProps) {
  const t = useTranslations('rules')
  const common = useTranslations('common')
  const { activeProfile } = useProfiles()
  const { proxies } = useProxies()
  const availableGroups = useMemo(() => Object.entries(proxies)
    .filter(([, node]) => 'all' in node)
    .map(([name]) => name)
    .filter((name) => !['DIRECT', 'GLOBAL', 'PROXY'].includes(name)), [proxies])
  const [connections, setConnections] = useState<ConnectionItem[]>([])
  const profileId = activeProfile?.id
  const [customApp, setCustomApp] = useState('')
  const [route, setRoute] = useState('DIRECT')
  const [query, setQuery] = useState('')
  const [appRules, setAppRules] = useState<CustomRuleItem[]>([])
  const [initialRules, setInitialRules] = useState<CustomRuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !window.api) return
    let cancelled = false
    setConnections([])
    // The shared connection store is intentionally cleared on the Rules page.
    void window.api.mihomo.getConnections().then((snapshot) => {
      if (!cancelled) setConnections(snapshot.connections)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setReady(false)
    setError(null)
    setCustomApp('')
    setQuery('')
    setRoute('DIRECT')
    setAppRules([])
    setInitialRules([])
    if (!profileId || !window.api) {
      setLoading(false)
      return
    }
    void window.api.profiles.getCustomRules(profileId).then((rules) => {
      if (cancelled) return
      const apps = rules.filter(isAppRule)
      setAppRules(apps)
      setInitialRules(apps)
      setReady(true)
      setLoading(false)
    }).catch((err: unknown) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [open, profileId])

  const activeProcesses = useMemo(() => {
    const processes = new Map<string, { name: string; path?: string }>()
    for (const connection of connections) {
      const { processPath, process } = connection.metadata
      const name = getProcessDisplayName(processPath, process, '')
      if (name && name.toLowerCase() !== 'system' && (!processes.has(name.toLowerCase()) || processPath)) {
        processes.set(name.toLowerCase(), { name, path: processPath })
      }
    }
    return [...processes.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [connections])

  const changed = JSON.stringify(appRules) !== JSON.stringify(initialRules)
  const unavailable = loading || saving || !profileId || !ready
  const search = query.trim().toLowerCase()
  const visibleRules = appRules.filter((rule) => rule.payload.toLowerCase().includes(search))
  const visibleProcesses = activeProcesses.filter((process) => process.name.toLowerCase().includes(search))
  const input = normalizeApp(customApp)
  const duplicate = (type: string, payload: string) => appRules.some(
    (rule) => rule.type === type && rule.payload.toLowerCase() === payload.toLowerCase()
  )
  const validInput = !!input.payload && !/[,\r\n]/.test(input.payload)

  const addProcess = (value: string) => {
    const { payload, type } = normalizeApp(value)
    if (!payload || /[,\r\n]/.test(payload)) return
    setAppRules((rules) => rules.some((rule) => rule.type === type && rule.payload.toLowerCase() === payload.toLowerCase())
      ? rules
      : [...rules, { id: createRuleId(), type, payload, proxy: route, position: 'top' }])
    setCustomApp('')
  }

  const save = async () => {
    if (!window.api || !profileId || unavailable || !changed) return
    setSaving(true)
    setError(null)
    try {
      const allRules = await window.api.profiles.getCustomRules(profileId)
      if (JSON.stringify(allRules.filter(isAppRule)) !== JSON.stringify(initialRules)) {
        throw new Error(t('appsChangedElsewhere'))
      }
      // Preserve other rules and the positions of existing application rules.
      const replacements = new Map(appRules.map((rule) => [rule.id, rule]))
      const existingIds = new Set(initialRules.map((rule) => rule.id))
      const merged = allRules.flatMap((rule) => {
        if (!isAppRule(rule)) return [rule]
        const replacement = replacements.get(rule.id)
        return replacement ? [replacement] : []
      })
      const added = appRules
        .filter((rule) => !existingIds.has(rule.id))
        .map((rule, index) => ({ ...rule, position: 'top' as const, offset: index }))
      const updatedMerged = added.length > 0
        ? merged.map((rule) => rule.position !== 'bottom' && typeof rule.offset === 'number'
            ? { ...rule, offset: rule.offset + added.length }
            : rule)
        : merged
      await window.api.profiles.saveCustomRules(profileId, [...added, ...updatedMerged])
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value) }}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl flex flex-col max-h-[85dvh]">
        <DialogHeader className="p-4 pr-12 border-b border-border/60 shrink-0 text-left">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sliders className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base leading-snug [overflow-wrap:anywhere]">{t('splitTunnelingTitle')}</DialogTitle>
              <DialogDescription className="sr-only">{t('splitTunnelingDescription')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 overflow-y-auto min-h-0 space-y-4 [overflow-wrap:anywhere]">
          {!profileId && <p role="status" className="text-sm text-muted-foreground">{t('selectProfileForApps')}</p>}
          {error && <p role="alert" className="text-xs text-destructive bg-destructive/10 p-3 rounded-lg">{error}</p>}

          <fieldset disabled={unavailable} className="space-y-2 min-w-0">
            <legend className="text-xs font-semibold mb-2">{t('addCustomApp')}</legend>
            <form className="flex flex-wrap gap-2" onSubmit={(event) => {
              event.preventDefault()
              if (!unavailable && validInput && !duplicate(input.type, input.payload)) addProcess(customApp)
            }}>
              <Input aria-label={t('addCustomApp')} value={customApp} onChange={(event) => setCustomApp(event.target.value)}
                placeholder={t('appNamePlaceholder')} className="font-mono text-xs h-9 w-full basis-full" />
              <NativeSelect aria-label={t('newAppRoute')} value={route} onChange={(event) => setRoute(event.target.value)} className="h-9 text-xs flex-1">
                <option value="DIRECT">{t('routeDirect')}</option>
                <option value="PROXY">{t('routeVpn')}</option>
                {availableGroups.map((name) => <option key={name} value={name}>{name}</option>)}
              </NativeSelect>
              <Button type="submit" size="sm" variant="outline" className="h-9 gap-1.5"
                disabled={unavailable || !validInput || duplicate(input.type, input.payload)}>
                <Plus className="size-3.5" />{t('add')}
              </Button>
            </form>
          </fieldset>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-semibold">{t('configuredApps')} <span className="ml-1 text-muted-foreground tabular-nums">{appRules.length}</span></h3>
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
                <Input aria-label={t('searchApps')} placeholder={t('searchApps')} value={query}
                  onChange={(event) => setQuery(event.target.value)} className="h-8 pl-8 text-xs" />
              </div>
            </div>
            {loading ? (
              <div role="status" className="flex justify-center p-6"><LoaderCircle aria-label={t('configuredApps')} className="size-5 animate-spin text-muted-foreground" /></div>
            ) : visibleRules.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed text-center text-xs text-muted-foreground">
                <AppWindow className="size-6 mx-auto mb-2 opacity-50" />
                <p>{search ? t('noMatchingApps') : t('noConfiguredApps')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60 rounded-xl border border-border/70 overflow-hidden">
                {visibleRules.map((rule) => {
                  const processPath = rule.type === 'PROCESS-PATH' ? rule.payload
                    : activeProcesses.find((process) => process.name.toLowerCase() === rule.payload.toLowerCase())?.path
                  return (
                  <div key={rule.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-40">
                      <ProcessIcon processName={getProcessDisplayName(processPath, rule.payload)}
                        processPath={processPath || rule.payload} className="size-5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs whitespace-normal [overflow-wrap:anywhere]" title={rule.payload}>{rule.payload}</p>
                        {rule.enabled === false && <span className="text-[10px] text-muted-foreground">{t('appRuleDisabled')}</span>}
                      </div>
                    </div>
                    <NativeSelect aria-label={t('appRoute', { app: rule.payload })} value={rule.proxy} disabled={unavailable}
                      onChange={(event) => setAppRules((rules) => rules.map((item) => item.id === rule.id ? { ...item, proxy: event.target.value } : item))}
                      className="text-xs h-8 max-w-44">
                      <option value="DIRECT">{t('routeDirect')}</option>
                      <option value="PROXY">{t('routeVpn')}</option>
                      {availableGroups.map((name) => <option key={name} value={name}>{name}</option>)}
                      {!['DIRECT', 'PROXY', ...availableGroups].includes(rule.proxy) && <option value={rule.proxy}>{rule.proxy}</option>}
                    </NativeSelect>
                    <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label={t('removeApp', { app: rule.payload })} disabled={unavailable}
                      onClick={() => setAppRules((rules) => rules.filter((item) => item.id !== rule.id))}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold"><Activity className="size-3.5 text-primary" />{t('activeProcesses')}</h3>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {visibleProcesses.map((process) => {
                const added = duplicate('PROCESS-NAME', process.name) || (!!process.path && duplicate('PROCESS-PATH', process.path))
                return (
                  <Button key={process.name} type="button" variant="outline" size="sm" className="gap-1.5 h-auto min-h-8 py-1.5 text-xs max-w-full min-w-0 whitespace-normal text-left"
                    disabled={unavailable || added} onClick={() => addProcess(process.name)}>
                    <ProcessIcon processName={process.name} processPath={process.path} className="size-3.5 shrink-0" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{process.name}</span>
                    {!added && <Plus className="size-3 shrink-0" />}
                  </Button>
                )
              })}
              {visibleProcesses.length === 0 && <p className="text-xs text-muted-foreground py-1">{search ? t('noMatchingApps') : t('noActiveProcesses')}</p>}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{t('profileRoutingHint')}</p>
        </div>

        <DialogFooter className="p-4 border-t border-border/60 bg-muted/20 flex-row justify-between sm:justify-between shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>{t('cancel')}</Button>
          <Button type="button" size="sm" onClick={save} disabled={unavailable || !changed} className="gap-1.5">
            {saving && <LoaderCircle className="size-3.5 animate-spin" />}{common('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
