import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Save } from 'lucide-react'
import { Button } from '../ui/button'
import { useTranslations } from '../../i18n'
import { cn } from '../../lib/utils'

export interface SaveBarProps {
  /** The form element ID this button submits (e.g. `settings-${section}`) */
  formId?: string
  /** Whether there are unsaved modifications */
  dirty: boolean
  /** Whether an asynchronous save or reload action is running */
  busy?: boolean
  /** Whether saving should be disabled even if dirty */
  disabled?: boolean
  /** Status or error message key/text */
  message?: string | null
  /** Discard unsaved changes handler */
  onDiscard?: () => void
  /** Optional reset to defaults handler */
  onReset?: () => void
  /** Optional direct submit callback */
  onSave?: () => void
  /** Additional container classes */
  className?: string
  /** Custom override for save button text */
  saveLabel?: string
  /** Custom override for discard button text */
  discardLabel?: string
}

/**
 * Floating save bar with acrylic frosted glass.
 * Only visible when there are active modifications, an error, or saving is in progress.
 * Compact typography and balanced padding.
 */
export function SaveBar({
  formId,
  dirty,
  busy = false,
  disabled = false,
  message,
  onDiscard,
  onReset,
  onSave,
  className,
  saveLabel,
  discardLabel
}: SaveBarProps) {
  const t = useTranslations('networksettings')

  const isSuccess = message === 'changesSaved' || message?.toLowerCase().includes('saved') || message?.toLowerCase().includes('сохранен')
  const isError = Boolean(message && !isSuccess)

  // Visible ONLY when there are active modifications, ongoing save, or an error
  const isVisible = Boolean(dirty || busy || isError)

  const getStatusContent = () => {
    if (busy) {
      return {
        icon: <Loader2 className="size-4 shrink-0 animate-spin text-primary" />,
        text: t('saving'),
        variant: 'busy' as const
      }
    }
    if (isError) {
      const errorText = message && (message in t ? t(message as Parameters<typeof t>[0]) : message)
      return {
        icon: <AlertTriangle className="size-4 shrink-0 text-destructive drop-shadow-sm" />,
        text: errorText ?? t('changesCouldNotBeAppliedCheckTheErrorAbove'),
        variant: 'error' as const
      }
    }
    if (dirty) {
      return {
        icon: <AlertTriangle className="size-4 shrink-0 text-amber-500 dark:text-amber-400 drop-shadow-sm" />,
        text: t('unsavedChangesNotice'),
        variant: 'dirty' as const
      }
    }
    if (isSuccess) {
      return {
        icon: <CheckCircle2 className="size-4 shrink-0 text-emerald-500 drop-shadow-sm" />,
        text: t('changesSaved'),
        variant: 'success' as const
      }
    }
    return {
      icon: <CheckCircle2 className="size-4 shrink-0 text-muted-foreground/50" />,
      text: t('allChangesSaved'),
      variant: 'clean' as const
    }
  }

  const status = getStatusContent()

  return (
    <div
      role="region"
      aria-label={t('unsavedChangesNotice')}
      className={cn(
        'sticky bottom-5 z-30 w-full max-w-4xl mx-auto px-1 select-none transition-all duration-300 ease-out',
        isVisible
          ? 'opacity-100 translate-y-0 max-h-32 pointer-events-auto mt-6'
          : 'opacity-0 translate-y-6 max-h-0 pointer-events-none mt-0 overflow-hidden',
        className
      )}
    >
      <div
        data-variant={status.variant}
        className={cn(
          'floating-save-bar flex flex-wrap items-center justify-between gap-3 sm:gap-5 rounded-2xl px-5 py-3 sm:px-6 sm:py-3.5 min-h-[52px] transition-all duration-200'
        )}
      >
        <div role="status" aria-live="polite" className="flex min-w-0 flex-1 items-center gap-2.5">
          {status.icon}
          <div className="min-w-0">
            <p
              className={cn(
                'truncate text-xs font-semibold sm:text-[13px]',
                status.variant === 'dirty' && 'text-foreground',
                status.variant === 'error' && 'text-destructive',
                status.variant === 'success' && 'text-emerald-600 dark:text-emerald-400',
                status.variant === 'clean' && 'text-muted-foreground font-normal'
              )}
            >
              {status.text}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {onReset && !dirty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={busy}
              className="h-8 px-3 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg"
            >
              <RotateCcw className="size-3.5" />
              <span>{t('resetSection')}</span>
            </Button>
          )}

          {dirty && onDiscard && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDiscard}
              disabled={busy}
              className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              {discardLabel ?? t('discard')}
            </Button>
          )}

          <Button
            type={onSave ? 'button' : 'submit'}
            form={onSave ? undefined : formId}
            onClick={onSave}
            size="sm"
            disabled={disabled || busy || !dirty}
            variant={dirty && !disabled ? 'default' : 'secondary'}
            className={cn(
              'h-8 px-4 gap-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer',
              dirty && !disabled
                ? 'bg-[#23a55a] hover:bg-[#1f9250] text-white shadow-sm hover:shadow active:scale-[0.98]'
                : 'opacity-50'
            )}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            <span>{saveLabel ?? (busy ? t('saving') : t('saveChanges'))}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
