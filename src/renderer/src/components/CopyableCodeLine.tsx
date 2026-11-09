import { useState } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { useTranslations } from '../i18n'
import { Badge } from './ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'

interface CopyableCodeLineProps {
  label?: string
  value: string
  copyValue?: string
  truncate?: boolean
  clashRuleOptions?: { label: string; value: string }[]
  onCopy?: (text: string) => void
}

export function CopyableCodeLine({
  label,
  value,
  copyValue,
  truncate = true,
  clashRuleOptions,
  onCopy
}: CopyableCodeLineProps) {
  const t = useTranslations('connections')
  const [copied, setCopied] = useState(false)
  const textToCopy = copyValue ?? value

  const handleCopy = (text: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(true)
    onCopy?.(text)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex flex-col gap-1 w-full min-w-0">
      {label && (
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      )}
      <div
        className="group/codeline relative flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-border/70 bg-muted/40 dark:bg-zinc-950/40 font-mono text-xs text-foreground/90 transition-all hover:border-primary/40 hover:bg-muted/60"
        onClick={(e) => handleCopy(textToCopy, e)}
        title={value}
      >
        <code
          className={`font-mono select-all text-xs leading-relaxed text-foreground/90 min-w-0 flex-1 ${
            truncate ? 'truncate' : 'break-all'
          }`}
        >
          {value}
        </code>

        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {clashRuleOptions && clashRuleOptions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title={t('copyAsRule')}
                  aria-label={t('copyAsRule')}
                  className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-background/80 transition-colors"
                >
                  <ChevronDown className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {clashRuleOptions.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => handleCopy(opt.value)}
                    className="font-mono text-xs flex items-center justify-between gap-2"
                  >
                    <span className="truncate flex-1">{opt.value}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase shrink-0 font-mono">
                      {opt.label}
                    </Badge>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <button
            type="button"
            onClick={(e) => handleCopy(textToCopy, e)}
            title={copied ? t('copied') : t('copy')}
            aria-label={copied ? t('copied') : t('copy')}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 transition-all focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-500 animate-in zoom-in-75 duration-150" />
            ) : (
              <Copy className="size-3.5 opacity-60 group-hover/codeline:opacity-100 transition-opacity" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
