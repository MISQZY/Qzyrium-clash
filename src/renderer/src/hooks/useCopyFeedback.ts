import { useCallback, useEffect, useRef, useState } from 'react'
import { copyToClipboard } from '../lib/clipboard'

/** Copy feedback belongs to the control that initiated the copy. */
export function useCopyFeedback() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const revision = useRef(0)

  useEffect(() => () => {
    revision.current++
    clearTimeout(timer.current)
  }, [])

  const handleCopy = useCallback(async (text: string, key: string) => {
    const request = ++revision.current
    const ok = await copyToClipboard(text)
    if (!ok || request !== revision.current) return
    clearTimeout(timer.current)
    setCopiedKey(key)
    timer.current = setTimeout(() => setCopiedKey(null), 1800)
  }, [])

  return { copiedKey, handleCopy }
}
