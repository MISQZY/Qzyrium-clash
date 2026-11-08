import React, { useState } from 'react'
import { Plus, RefreshCw, Trash2, Check, Globe, FileCode } from 'lucide-react'
import { ProfileItem } from '@shared/profile'

interface ProfilesPageProps {
  profiles: ProfileItem[]
  activeProfile: ProfileItem | null
  onSwitchProfile: (id: string) => void
  onRefreshAll: () => void
}

export const ProfilesPage: React.FC<ProfilesPageProps> = ({
  profiles,
  activeProfile,
  onSwitchProfile,
  onRefreshAll
}) => {
  const [showAddModal, setShowAddModal] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const [profileType, setProfileType] = useState<'remote' | 'local'>('remote')
  const [yamlContent, setYamlContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.api || !profileName.trim()) return

    setSubmitting(true)
    try {
      await window.api.profiles.add({
        name: profileName.trim(),
        url: profileType === 'remote' ? profileUrl.trim() : undefined,
        type: profileType,
        content: profileType === 'local' ? yamlContent : undefined
      })
      setShowAddModal(false)
      setProfileName('')
      setProfileUrl('')
      setYamlContent('')
      onRefreshAll()
    } catch (err) {
      alert(`Failed to add profile: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.api || !confirm('Are you sure you want to delete this profile?')) return
    await window.api.profiles.delete(id)
    onRefreshAll()
  }

  const handleUpdate = async (id: string) => {
    if (!window.api) return
    try {
      await window.api.profiles.update(id)
      onRefreshAll()
    } catch (err) {
      alert(`Update failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="flex flex-col gap-5 p-6 h-[calc(100vh-2.5rem)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Profiles & Subscriptions</h2>
          <p className="text-xs text-slate-400">Manage remote subscription URLs or local configuration files</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-600/30"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Profile</span>
        </button>
      </div>

      {/* Profile List */}
      <div className="flex flex-col gap-3">
        {profiles.length > 0 ? (
          profiles.map((p) => {
            const isActive = activeProfile?.id === p.id
            const dateStr = new Date(p.updatedAt).toLocaleString()

            return (
              <div
                key={p.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-slate-900/90 border-indigo-500/50 shadow-md shadow-indigo-500/10'
                    : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      p.type === 'remote'
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {p.type === 'remote' ? <Globe className="w-5 h-5" /> : <FileCode className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-200">{p.name}</span>
                      {isActive && (
                        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                          <Check className="w-2.5 h-2.5" /> Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono truncate max-w-md mt-0.5">
                      {p.url || 'Local YAML Config'}
                    </p>
                    <span className="text-[10px] text-slate-500">Updated: {dateStr}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isActive && (
                    <button
                      onClick={() => onSwitchProfile(p.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                      Use
                    </button>
                  )}
                  {p.type === 'remote' && (
                    <button
                      onClick={() => handleUpdate(p.id)}
                      className="p-2 rounded-lg bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                      title="Update Subscription"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="p-2 rounded-lg bg-slate-800/80 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Delete Profile"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })
        ) : (
          <div className="flex flex-col items-center justify-center p-12 rounded-xl bg-slate-900/40 border border-slate-800 text-center">
            <Globe className="w-8 h-8 text-slate-600 mb-2" />
            <span className="text-sm text-slate-400">No subscription profiles loaded</span>
            <span className="text-xs text-slate-500 mt-1">
              Click &quot;Add Profile&quot; to import your Clash/Mihomo subscription link or local config.
            </span>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form
            onSubmit={handleAddProfile}
            className="w-full max-w-md p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col gap-4"
          >
            <h3 className="text-sm font-semibold text-slate-100">Add Subscription Profile</h3>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setProfileType('remote')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                  profileType === 'remote'
                    ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/50'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                Remote URL
              </button>
              <button
                type="button"
                onClick={() => setProfileType('local')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                  profileType === 'local'
                    ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/50'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                Local YAML
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-400 font-medium">Profile Name</label>
              <input
                type="text"
                required
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="e.g. My Premium Proxy"
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {profileType === 'remote' ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-medium">Subscription URL</label>
                <input
                  type="url"
                  required
                  value={profileUrl}
                  onChange={(e) => setProfileUrl(e.target.value)}
                  placeholder="https://provider.com/api/v1/client/subscribe?token=..."
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-medium">YAML Content</label>
                <textarea
                  required
                  rows={6}
                  value={yamlContent}
                  onChange={(e) => setYamlContent(e.target.value)}
                  placeholder="Paste clash/mihomo YAML configuration here..."
                  className="px-3 py-2 font-mono text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Downloading...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
