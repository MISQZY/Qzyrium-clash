import { useState, type ReactNode } from 'react'
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, Info, X, type LucideIcon } from 'lucide-react'
import { Alert } from './ui/alert'
import { useTranslations } from '../i18n'
import { cn } from '../lib/utils'

export type ToastVariant = 'destructive' | 'warning' | 'info'

export interface ToastNotificationProps {
  variant: ToastVariant
  message: string
  title?: string
  icon?: LucideIcon
  onClose: () => void
  closeLabel?: string
  children?: ReactNode
  className?: string
}

export function ToastNotification({
  variant,
  message,
  title,
  icon: CustomIcon,
  onClose,
  closeLabel,
  children,
  className
}: ToastNotificationProps) {
  const common = useTranslations('common')
  const [expanded, setExpanded] = useState(false)

  // Clean raw technical IPC and Error prefixes if present
  const cleanMessage = message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()

  const isLong = cleanMessage.length > 120 || cleanMessage.includes('\n')

  const defaultTitle =
    variant === 'warning'
      ? common('attention')
      : variant === 'info'
        ? common('info')
        : common('error')

  const displayTitle = title || defaultTitle

  const IconComponent =
    CustomIcon ||
    (variant === 'warning'
      ? AlertTriangle
      : variant === 'info'
        ? Info
        : AlertCircle)

  const headerColorClass =
    variant === 'warning'
      ? 'text-warning'
      : variant === 'info'
        ? 'text-primary'
        : 'text-destructive'

  return (
    <Alert
      variant={variant === 'info' ? 'default' : variant}
      className={cn(
        'fixed right-4 bottom-4 z-[100] flex max-h-[calc(100dvh-96px)] w-[calc(100%-32px)] max-w-sm flex-col gap-2 overflow-hidden text-xs shadow-xl animate-toast-bottom border p-3.5 backdrop-blur-md',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5 w-full">
        <div className={cn('flex items-center gap-1.5 font-semibold text-xs tracking-wide', headerColorClass)}>
          <IconComponent className="size-4 shrink-0" />
          <span>{displayTitle}</span>
        </div>
        <button
          type="button"
          aria-label={closeLabel || common('close')}
          onClick={onClose}
          className="shrink-0 rounded-md p-1 -mr-1 -my-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 text-foreground w-full">
        {isLong && !expanded ? (
          <div className="w-full">
            <p className="line-clamp-2 leading-relaxed font-medium text-foreground [overflow-wrap:anywhere]">
              {cleanMessage}
            </p>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer mt-1"
            >
              <span>{common('details')}</span>
              <ChevronDown className="size-3" />
            </button>
          </div>
        ) : (
          <div className="w-full">
            <p
              className={cn(
                'whitespace-pre-wrap leading-relaxed font-medium text-foreground [overflow-wrap:anywhere]',
                isLong && 'max-h-48 overflow-y-auto pr-1 text-[11px] font-mono bg-muted/40 p-2 rounded border border-border/50 select-text'
              )}
            >
              {cleanMessage}
            </p>
            {isLong && expanded && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer mt-1"
              >
                <span>{common('hideDetails')}</span>
                <ChevronUp className="size-3" />
              </button>
            )}
          </div>
        )}

        {children}
      </div>
    </Alert>
  )
}
