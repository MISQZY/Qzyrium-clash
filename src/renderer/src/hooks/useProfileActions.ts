import { useEffect, useRef, useState } from 'react'
import type { ProfileItem } from '@shared/profile'
import { useTranslations } from '../i18n'

export function useProfileActions(onRefreshAll: () => void) {
  const t = useTranslations('profiles')
  const [error, setError] = useState('')
  const pendingUpdates = useRef(new Set<string>())
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [profileToDelete, setProfileToDelete] = useState<ProfileItem | null>(null)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const confirmDelete = async () => {
    if (!window.api || !profileToDelete) return
    const id = profileToDelete.id
    setProfileToDelete(null)
    setError('')
    try {
      await window.api.profiles.delete(id)
      if (isMounted.current) onRefreshAll()
    } catch (err) {
      if (isMounted.current) setError(t('deleteFailed', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  const handleUpdate = async (id: string) => {
    if (!window.api || pendingUpdates.current.has(id)) return
    pendingUpdates.current.add(id)
    setUpdating(new Set(pendingUpdates.current))
    setError('')
    try {
      await window.api.profiles.update(id)
      if (isMounted.current) onRefreshAll()
    } catch (err) {
      if (isMounted.current) {
        setError(t('updateFailed', { error: err instanceof Error ? err.message : String(err) }))
        onRefreshAll()
      }
    } finally {
      pendingUpdates.current.delete(id)
      if (isMounted.current) setUpdating(new Set(pendingUpdates.current))
    }
  }

  return { error, setError, updating, profileToDelete, setProfileToDelete, confirmDelete, handleUpdate }
}
