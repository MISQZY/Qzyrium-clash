import { useEffect, useState, type FormEvent } from 'react'
import { useTranslations } from '../i18n'
import { parseSubscriptionImportUrl } from '@shared/clash-url'

export interface ProfileImportRequest { url: string; name?: string }

export function useProfileImport({ importRequest, onClearImportRequest, onRefreshAll, error, setError }: {
  importRequest?: ProfileImportRequest | null
  onClearImportRequest?: () => void
  onRefreshAll: () => void
  error: string
  setError: (error: string) => void
}) {
  const t = useTranslations('profiles')
  const [showAddModal, setAddModalOpen] = useState(false)
  const setShowAddModal = (open: boolean) => {
    setAddModalOpen(open)
    if (!open && importRequest) onClearImportRequest?.()
  }
  const [profileName, setProfileName] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const [profileType, setProfileType] = useState<'remote' | 'local'>('remote')
  const [updateViaProxy, setUpdateViaProxy] = useState(false)
  const [sendHwid, setSendHwid] = useState(false)
  const [yamlContent, setYamlContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (importRequest?.url) {
      setProfileType('remote')
      const parsed = parseSubscriptionImportUrl(importRequest.url)
      setProfileUrl(parsed.url)
      setProfileName(importRequest.name || parsed.name || '')
      setUpdateViaProxy(false)
      setSendHwid(false)
      setAddModalOpen(true)
    }
  }, [importRequest])

  useEffect(() => {
    if (!showAddModal) return
    const handleInsert = (e: Event) => {
      const custom = e as CustomEvent<{ url: string; name?: string }>
      if (!custom.detail?.url) return
      setProfileType('remote')
      const parsed = parseSubscriptionImportUrl(custom.detail.url)
      setProfileUrl(parsed.url)
      if (custom.detail.name || parsed.name) {
        setProfileName((current) => (current.trim() ? current : custom.detail.name || parsed.name || ''))
      }
    }
    window.addEventListener('qzyrium:insert-profile-url', handleInsert)
    return () => window.removeEventListener('qzyrium:insert-profile-url', handleInsert)
  }, [showAddModal])

  const handleUrlChange = (value: string) => {
    const parsed = parseSubscriptionImportUrl(value)
    setProfileUrl(parsed.url)
    if (parsed.name && !profileName.trim()) {
      setProfileName(parsed.name)
    }
  }

  const handleAddProfile = async (e: FormEvent) => {
    e.preventDefault()
    if (!window.api || submitting) return

    setSubmitting(true)
    setError('')
    try {
      await window.api.profiles.add({
        name: profileName.trim() || undefined,
        url: profileType === 'remote' ? profileUrl.trim() : undefined,
        type: profileType,
        updateViaProxy: profileType === 'remote' ? updateViaProxy : undefined,
        sendHwid: profileType === 'remote' ? sendHwid : undefined,
        content: profileType === 'local' ? yamlContent : undefined
      })
      setShowAddModal(false)
      setProfileName('')
      setProfileUrl('')
      setUpdateViaProxy(false)
      setYamlContent('')
      setSendHwid(false)
      onRefreshAll()
    } catch (err) {
      setError(t('addFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setSubmitting(false)
    }
  }

  return { showAddModal, setShowAddModal, profileName, setProfileName, profileUrl, profileType, setProfileType, updateViaProxy, setUpdateViaProxy, sendHwid, setSendHwid, yamlContent, setYamlContent, submitting, error, handleUrlChange, handleAddProfile }
}

export type ProfileImportDraft = ReturnType<typeof useProfileImport>
