import { NativeSelect } from '../ui/native-select'

import { useTranslations } from '../../i18n'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Download, Upload, Trash2, Palette, Power, Gauge, Keyboard, FileText, Activity, RefreshCw } from 'lucide-react'

import type { AppConfig } from '@shared/app-config'

import { SettingRow } from '../Page'

import { Button } from '../ui/button'

import { Switch } from '../ui/switch'
import { SettingsFields } from '../SettingsFields'
import { ShortcutSettings } from '../ShortcutSettings'
import { ThemeSelect } from '../ThemeSelect'
import { SettingsDisclosure } from '../SettingsDisclosure'
import { CustomLocalizationSettings } from '../CustomLocalizationSettings'
import { useCustomThemes, type ThemeImportChoice } from '../../providers/CustomThemesProvider'
import { ScrollArea } from '../ui/scroll-area'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog'
import { generalFields } from '@shared/settings-fields'
import { DEFAULT_APP_CONFIG } from '@shared/app-config'

import type { SettingsDraft } from '../../hooks/useSettingsDraft'
import { SettingsGroup } from './SettingsGroup'

export function GeneralPreferencesPanel({ draft, busy }: { draft: SettingsDraft; busy: boolean }) {
  const t = useTranslations('networksettings')
  const common = useTranslations('common')
  const { form, dirty, updateGeneral } = draft
  const { customThemes, uploadTheme, deleteCustomTheme, downloadExampleTheme, loadFailed, skippedThemes } = useCustomThemes()
  const [uploadingTheme, setUploadingTheme] = useState(false)
  const [themeBusy, setThemeBusy] = useState(false)
  const [themeError, setThemeError] = useState(false)
  const [invalidFileNotice, setInvalidFileNotice] = useState<'theme' | null>(null)
  const [conflictingTheme, setConflictingTheme] = useState<string | null>(null)
  const resolveImport = useRef<((choice: ThemeImportChoice) => void) | null>(null)
  useEffect(() => () => { resolveImport.current?.('cancel') }, [])
  const finishImportChoice = (choice: ThemeImportChoice): void => {
    resolveImport.current?.(choice)
    resolveImport.current = null
    setConflictingTheme(null)
  }
  const handleUploadTheme = async (): Promise<void> => {
    setUploadingTheme(true)
    setThemeBusy(true)
    setThemeError(false)
    try {
      const result = await uploadTheme(theme => new Promise<ThemeImportChoice>(resolve => {
        resolveImport.current = resolve
        setConflictingTheme(theme.name ?? theme.id)
      }))
      if (result === 'invalid') setInvalidFileNotice('theme')
    } catch {
      setThemeError(true)
    } finally {
      setUploadingTheme(false)
      setThemeBusy(false)
    }
  }
  const handleDeleteTheme = async (id: string): Promise<void> => {
    setThemeBusy(true)
    setThemeError(false)
    try {
      await deleteCustomTheme(id)
      if (form.general.theme === id) updateGeneral({ theme: 'dark' })
    } catch { setThemeError(true) }
    finally { setThemeBusy(false) }
  }
  const handleDownloadTheme = async (): Promise<void> => {
    setThemeBusy(true)
    setThemeError(false)
    try { await downloadExampleTheme() }
    catch { setThemeError(true) }
    finally { setThemeBusy(false) }
  }
  const renderGeneralFields = (keys: string[]) => <SettingsFields
    prefix="general" inherit={false}
    fields={keys.flatMap((key) => generalFields.filter((field) => field.key === key))}
    value={{ ...DEFAULT_APP_CONFIG.general, ...form.general }}
    onChange={(values) => updateGeneral(values as Partial<AppConfig['general']>)}
  />
  return <>
    <>
        <SettingsGroup title={t('interfaceGroup')} description={t('interfaceDescription')} icon={<Palette />}>
          <SettingRow title={t('language')} description={t('languageHint')}>
            <NativeSelect aria-label={t('language')} value={form.general.customLocalization ? `custom:${form.general.customLocalization}` : form.general.language} onChange={(event) => {
              const pack = form.general.customLocalizations?.find(item => `custom:${item.id}` === event.target.value)
              updateGeneral(pack ? { language: pack.baseLanguage, customLocalization: pack.id } : { language: event.target.value as AppConfig['general']['language'], customLocalization: null })
            }}>
              <option value="ru">{common('languageRussian')}</option>
              <option value="en">{common('languageEnglish')}</option>
              {(form.general.customLocalizations ?? []).map(pack => <option key={pack.id} value={`custom:${pack.id}`}>{pack.name}</option>)}
            </NativeSelect>
          </SettingRow>
          <SettingRow title={t('appearance')} description={t('followYourSystemThemeOrChooseOneExplicitly')}>
            <ThemeSelect value={form.general.theme} onValueChange={(theme) => updateGeneral({ theme })} />
          </SettingRow>
          <CustomLocalizationSettings general={form.general} onChange={updateGeneral} />
          <SettingsDisclosure title={t('customThemesTitle')}>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleDownloadTheme()}
                disabled={themeBusy}
              >
                <Download className="size-3.5" />
                {t('downloadExample')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUploadTheme}
                disabled={themeBusy}
              >
                <Upload className="size-3.5" />
                {uploadingTheme ? t('uploading') : t('upload')}
              </Button>
            </div>
            {themeError && <p role="alert" className="text-xs text-destructive">{t('themeFileError')}</p>}
            {loadFailed && <p role="alert" className="text-xs text-destructive">{t('themeLoadError')}</p>}
            {skippedThemes && <p role="alert" className="text-xs text-destructive">{t('themeSkippedWarning')}</p>}
            {customThemes.length > 0 && (
              <ScrollArea className="max-h-48">
                <ul className="flex flex-col gap-1.5 pr-2">
                  {customThemes.map((theme) => (
                    <li
                      key={theme.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/80 bg-card px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{theme.name ?? theme.id}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          role="img"
                          aria-label={t('themePalette', { name: theme.name ?? theme.id })}
                          className="flex shrink-0 items-center gap-1"
                          style={{ ...theme.colors, colorScheme: theme.mode } as CSSProperties}
                        >
                          {([
                            ['--background', 'themeColorBackground'],
                            ['--card', 'themeColorSurface'],
                            ['--primary', 'themeColorAccent'],
                            ['--foreground', 'themeColorText']
                          ] as const).map(([key, label]) => (
                            <span
                              key={key}
                              aria-hidden="true"
                              title={`${t(label)}: ${theme.colors[key]}`}
                              className="size-3.5 shrink-0 rounded-full border border-black/20 shadow-[0_0_0_1px_#ffffff40]"
                              style={{ backgroundColor: theme.colors[key] }}
                            />
                          ))}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase px-1.5 py-0.5 rounded bg-muted/80">
                          {theme.mode}
                        </span>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('deleteCustom')}
                              disabled={themeBusy}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogTitle>
                              {t('deleteConfirm', { name: theme.name ?? theme.id })}
                            </AlertDialogTitle>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                disabled={themeBusy}
                                onClick={() => void handleDeleteTheme(theme.id)}
                              >
                                {t('deleteCustom')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </SettingsDisclosure>

        </SettingsGroup>
        <SettingsGroup title={t('startupGroup')} description={t('startupDescription')} icon={<Power />}>
          {renderGeneralFields(['autoStart', 'autoStartAsAdmin'])}
          <SettingRow title={t('startCoreOnLaunch')} description={t('automaticallyStartMihomoWhenQzyriumOpens')} id="general-autoConnect"><Switch id="general-autoConnect" aria-label={t('startCoreOnLaunch')} checked={form.general.autoConnect} onCheckedChange={(autoConnect) => updateGeneral({ autoConnect })} /></SettingRow>
          <SettingRow title={t('closeAction')} description={t('closeActionDescription')} id="general-closeAction">
            <NativeSelect id="general-closeAction" aria-label={t('closeAction')} value={form.general.closeAction ?? (form.general.minimizeToTray ? 'tray' : 'quit')}
              onChange={event => updateGeneral({ closeAction: event.target.value as AppConfig['general']['closeAction'], minimizeToTray: event.target.value !== 'quit' })}>
              <option value="tray">{t('closeToTray')}</option><option value="quit">{t('closeQuit')}</option><option value="core-only">{t('closeCoreOnly')}</option>
            </NativeSelect>
          </SettingRow>
          <SettingRow title={t('silentStart')} description={t('silentStartDescription')} id="general-silentStart"><Switch id="general-silentStart" aria-label={t('silentStart')} checked={form.general.silentStart} onCheckedChange={(silentStart) => updateGeneral({ silentStart })} /></SettingRow>

        </SettingsGroup>
        <SettingsGroup title={t('subscriptionsGroup')} description={t('subscriptionsDescription')} icon={<FileText />} collapsible>
          {renderGeneralFields(['autoUpdateProfiles', 'profileUpdateInterval', 'updateProfilesOnStart', 'profileStartupMaxAgeHours', 'subscriptionNotifications', 'userAgent'])}
        </SettingsGroup>
        <SettingsGroup title={t('connectionGroup')} description={t('connectionDescription')} icon={<Activity />} collapsible>
          {renderGeneralFields(['onlyVpnTraffic', 'autoCloseConnection', 'reconnectAfterSleep', 'resumeDelaySeconds', 'autoRestartCore', 'coreRestartDelaySeconds', 'coreRestartMaxAttempts'])}
        </SettingsGroup>
        <SettingsGroup title={t('latencyGroup')} description={t('latencyDescription')} icon={<Gauge />} collapsible>
          {renderGeneralFields(['delayTestUrl', 'delayTestTimeout', 'delayTestConcurrency'])}
        </SettingsGroup>
        <SettingsGroup title={t('performanceGroup')} description={t('performanceDescription')} icon={<Gauge />} collapsible>
          {renderGeneralFields(['lowMemoryMode', 'disableGpu', 'liteDashboard', 'autoReleaseWindow', 'autoReleaseWindowMinutes', 'connectionInterval', 'maxLogs'])}
          <SettingRow title={t('coreOnlyMode')} description={t('coreOnlyDescription')}>
            <Button type="button" variant="outline" disabled={busy || dirty} onClick={() => { void window.api.app.enterCoreOnly() }}>{t('enableCoreOnly')}</Button>
          </SettingRow>

        </SettingsGroup>
        <SettingsGroup title={t('updatesGroup')} description={t('updatesDescription')} icon={<RefreshCw />} collapsible>
          {renderGeneralFields(['autoCheckUpdates'])}
        </SettingsGroup>
        <SettingsGroup title={t('logStorageGroup')} description={t('logStorageDescription')} icon={<FileText />} collapsible>
          {renderGeneralFields(['appLogEnabled', 'appLogMaxSizeMb', 'appLogArchives', 'appLogRetentionDays', 'connectionLogEnabled', 'connectionLogMaxSizeMb', 'connectionLogArchives', 'connectionLogRetentionDays'])}
        </SettingsGroup>
        <SettingsGroup title={t('shortcutsGroup')} description={t('shortcutsDescription')} icon={<Keyboard />} collapsible>
          <ShortcutSettings value={form.general.shortcuts ?? {}} disabled={busy} onChange={(shortcuts) => updateGeneral({ shortcuts })} />

        </SettingsGroup>
      </>
    <AlertDialog open={conflictingTheme !== null} onOpenChange={open => { if (!open) finishImportChoice('cancel') }}>
      <AlertDialogContent>
        <AlertDialogTitle>{t('themeImportConflictTitle')}</AlertDialogTitle>
        <AlertDialogDescription>{t('themeImportConflictDescription', { name: conflictingTheme ?? '' })}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finishImportChoice('cancel')}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="outline" onClick={() => finishImportChoice('copy')}>{t('themeImportCopy')}</AlertDialogAction>
          <AlertDialogAction onClick={() => finishImportChoice('replace')}>{t('themeImportReplace')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={invalidFileNotice !== null} onOpenChange={(open) => !open && setInvalidFileNotice(null)}>
      <AlertDialogContent>
        <AlertDialogTitle>
          {t('invalidThemeFile')}
        </AlertDialogTitle>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setInvalidFileNotice(null)}>
            {common('close')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
