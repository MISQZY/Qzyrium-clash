import { type ProcessGroup } from '../lib/connections'
import { useTranslations } from '../i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ConnectionItem } from '@shared/mihomo'

export function useConnectionActions(onRefresh: () => void) {
  const t = useTranslations('connections')
  const [selectedConnection, setSelectedConnection] = useState<ConnectionItem | null>(null)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState('')
  const isMounted = useRef(true)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const close = useCallback(async (id?: string) => {
    if (!window.api || closing || (!id && !confirm(t('terminateAllActiveSessions')))) return
    setClosing(true)
    setError('')
    try {
      if (id) {
        await window.api.mihomo.closeConnection(id)
        if (isMounted.current) {
          setSelectedConnection((prev) => (prev?.id === id ? null : prev))
        }
      } else {
        await window.api.mihomo.closeAllConnections()
        if (isMounted.current) {
          setSelectedConnection(null)
        }
      }
      if (isMounted.current) onRefreshRef.current()
    } catch (err) {
      if (isMounted.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (isMounted.current) setClosing(false)
    }
  }, [closing, t])

  const closeProcessConnections = useCallback(async (group: ProcessGroup) => {
    if (!window.api || closing) return
    setClosing(true)
    setError('')
    try {
      await Promise.all(group.connections.map((item) => window.api.mihomo.closeConnection(item.id)))
      if (isMounted.current) {
        setSelectedConnection((prev) => (prev && group.connections.some((c) => c.id === prev.id) ? null : prev))
      }
      if (isMounted.current) onRefreshRef.current()
    } catch (err) {
      if (isMounted.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (isMounted.current) setClosing(false)
    }
  }, [closing])

  return useMemo(
    () => ({ selectedConnection, setSelectedConnection, closing, error, close, closeProcessConnections }),
    [selectedConnection, closing, error, close, closeProcessConnections]
  )
}

export type ConnectionActions = ReturnType<typeof useConnectionActions>
