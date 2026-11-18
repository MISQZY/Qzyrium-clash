import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, Sparkles } from 'lucide-react'
import { parseSubscriptionImportUrl } from '@shared/clash-url'
import { Button } from './ui/button'
import { useTranslations } from '../i18n'
import { useProfiles } from '../stores/useAppStore'
import { readClipboard } from '../lib/clipboard'

export interface SmartClipboardBannerProps {
  onImport: (request: { url: string; name?: string }) => void
}

function isProbableSubscriptionUrl(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length < 10 || trimmed.length > 2048) return false

  // Custom protocol subscription scheme
  if (/^(clash|qzyrium|mihomo):\/\//i.test(trimmed)) {
    return true
  }

  // HTTP/HTTPS URL
  if (!/^https?:\/\//i.test(trimmed)) {
    return false
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return false

    const fullLower = trimmed.toLowerCase()
    const hostLower = parsed.hostname.toLowerCase()
    const pathLower = parsed.pathname.toLowerCase()
    const searchLower = parsed.search.toLowerCase()

    // Common indicators of subscription URLs
    const hasSubKeyword =
      hostLower.startsWith('sub.') ||
      hostLower.includes('.sub.') ||
      hostLower.includes('subscribe') ||
      pathLower.includes('/sub') ||
      pathLower.includes('/subscription') ||
      pathLower.includes('/link') ||
      pathLower.includes('/clash') ||
      pathLower.includes('/api/v1/client') ||
      pathLower.endsWith('.yaml') ||
      pathLower.endsWith('.yml') ||
      pathLower.endsWith('.txt') ||
      searchLower.includes('token=') ||
      searchLower.includes('key=') ||
      searchLower.includes('sub=') ||
      searchLower.includes('clash=') ||
      searchLower.includes('auth=') ||
      fullLower.includes('subscribe')

    return hasSubKeyword
  } catch {
    return false
  }
}

export function SmartClipboardBanner({ onImport }: SmartClipboardBannerProps) {
  const t = useTranslations('profiles')
  const { profiles } = useProfiles()

  const [detected, setDetected] = useState<{ url: string; name?: string } | null>(null)
  const dismissedUrls = useRef<Set<string>>(new Set())
  const lastCheckedText = useRef<string>('')

  const checkClipboard = useCallback(async () => {
    try {
      const text = (await readClipboard()).trim()
      if (!text || text === lastCheckedText.current) return
      lastCheckedText.current = text

      if (!isProbableSubscriptionUrl(text)) return

      const parsed = parseSubscriptionImportUrl(text)
      const targetUrl = parsed.url.trim()
      if (!targetUrl) return

      // Don't show if already dismissed in this session
      if (dismissedUrls.current.has(targetUrl) || dismissedUrls.current.has(text)) return

      // Don't show if already exists in active profiles
      const alreadyExists = profiles.some(
        (p) => p.url && (p.url.trim() === targetUrl || p.url.trim() === text)
      )
      if (alreadyExists) return

      // If Add Profile dialog is currently open, immediately insert the link and do not show popup
      const isAddModalOpen = Boolean(document.getElementById('profile-url'))
      if (isAddModalOpen) {
        dismissedUrls.current.add(targetUrl)
        dismissedUrls.current.add(text)
        setDetected(null)
        onImport({ url: targetUrl, name: parsed.name })
        window.dispatchEvent(
          new CustomEvent('qzyrium:insert-profile-url', {
            detail: { url: targetUrl, name: parsed.name }
          })
        )
        const input = document.getElementById('profile-url') as HTMLInputElement | null
        if (input) {
          input.focus()
        }
        return
      }

      setDetected({
        url: targetUrl,
        name: parsed.name
      })
    } catch {
      // Ignore errors
    }
  }, [profiles, onImport])

  useEffect(() => {
    if (!detected) return
    // If Add Profile modal opens while banner is displayed, auto-insert into modal and dismiss banner
    const checkModal = () => {
      if (document.getElementById('profile-url')) {
        const toInsert = detected
        dismissedUrls.current.add(toInsert.url)
        setDetected(null)
        onImport(toInsert)
        window.dispatchEvent(
          new CustomEvent('qzyrium:insert-profile-url', {
            detail: toInsert
          })
        )
        const input = document.getElementById('profile-url') as HTMLInputElement | null
        if (input) {
          input.focus()
        }
      }
    }
    const interval = setInterval(checkModal, 150)
    return () => clearInterval(interval)
  }, [detected, onImport])

  useEffect(() => {
    const handleCheck = () => {
      void checkClipboard()
    }

    window.addEventListener('focus', handleCheck)
    window.addEventListener('copy', () => setTimeout(handleCheck, 100))
    const handleVisibility = () => {
      if (!document.hidden) handleCheck()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    const timer = setTimeout(handleCheck, 500)

    return () => {
      window.removeEventListener('focus', handleCheck)
      window.removeEventListener('copy', handleCheck)
      document.removeEventListener('visibilitychange', handleVisibility)
      clearTimeout(timer)
    }
  }, [checkClipboard])

  const handleDismiss = () => {
    if (detected) {
      dismissedUrls.current.add(detected.url)
    }
    setDetected(null)
  }

  const handleAccept = () => {
    if (!detected) return
    onImport(detected)
    dismissedUrls.current.add(detected.url)
    setDetected(null)
  }

  if (!detected) return null

  return (
    <div className="fixed top-12 right-6 z-50 max-w-md w-[calc(100%-3rem)] animate-toast-top">
      <div className="flex items-start gap-3 p-3.5 rounded-xl border border-primary/40 bg-card/95 backdrop-blur-md shadow-xl text-foreground">
        <div className="size-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 border border-primary/25 mt-0.5">
          <Sparkles className="size-4" />
        </div>

        <div className="flex flex-col min-w-0 flex-1 gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold leading-tight text-foreground truncate">
              {t('subscriptionDetected')}
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={t('dismiss')}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground font-mono truncate leading-normal">
            {detected.name ? `${detected.name} • ` : ''}
            {detected.url}
          </p>

          <div className="flex items-center gap-2 mt-1.5">
            <Button
              type="button"
              size="sm"
              onClick={handleAccept}
              className="h-7 text-xs gap-1.5 px-3 bg-primary text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-3.5" />
              <span>{t('importSubscription')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <span>{t('dismiss')}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
