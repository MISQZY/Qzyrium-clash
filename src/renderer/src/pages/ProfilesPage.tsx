import React, { useState } from 'react'
import { Plus, RefreshCw, Trash2, Check, Globe, FileCode } from 'lucide-react'
import { ProfileItem } from '@shared/profile'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Card, CardContent } from '../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'

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
    <div className="flex-1 min-h-0 h-full overflow-y-auto p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Subscriptions</h2>
          <p className="text-xs text-muted-foreground">Manage remote proxy subscriptions and configurations</p>
        </div>

        <Button
          onClick={() => setShowAddModal(true)}
          variant="glow"
          size="sm"
          className="gap-2"
        >
          <Plus className="size-3.5" />
          <span>Add Subscription</span>
        </Button>
      </div>

      {/* Profile List */}
      <div className="flex flex-col gap-3">
        {profiles.length > 0 ? (
          profiles.map((p) => {
            const isActive = activeProfile?.id === p.id
            const dateStr = new Date(p.updatedAt).toLocaleString()

            return (
              <Card
                key={p.id}
                className={`transition-all ${
                  isActive
                    ? 'border-primary/60 bg-primary/10 shadow-[0_0_12px_var(--glow-bg)]'
                    : 'bg-card/70'
                }`}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`size-10 rounded-lg flex items-center justify-center ${
                        p.type === 'remote'
                          ? 'bg-primary/15 text-primary border border-primary/30'
                          : 'bg-warning/15 text-warning border border-warning/30'
                      }`}
                    >
                      {p.type === 'remote' ? (
                        <Globe className="size-5" />
                      ) : (
                        <FileCode className="size-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{p.name}</span>
                        {isActive && (
                          <Badge variant="glow" className="gap-1 py-0 px-2 text-[10px]">
                            <Check className="size-2.5" /> Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono truncate max-w-md mt-0.5">
                        {p.url || 'Local YAML Config'}
                      </p>
                      <span className="text-[10px] text-muted-foreground/80">
                        Updated: {dateStr}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isActive && (
                      <Button
                        onClick={() => onSwitchProfile(p.id)}
                        variant="secondary"
                        size="sm"
                      >
                        Select
                      </Button>
                    )}
                    {p.type === 'remote' && (
                      <Button
                        onClick={() => handleUpdate(p.id)}
                        variant="outline"
                        size="icon-sm"
                        title="Update Subscription"
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      onClick={() => handleDelete(p.id)}
                      variant="ghost"
                      size="icon-sm"
                      className="hover:text-destructive"
                      title="Delete Profile"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })
        ) : (
          <Card className="p-12 text-center flex flex-col items-center justify-center">
            <Globe className="size-8 text-muted-foreground/40 mb-2" />
            <span className="text-sm font-medium text-foreground">No subscriptions loaded</span>
            <span className="text-xs text-muted-foreground mt-1">
              Click &quot;Add Subscription&quot; to import your Clash/Mihomo provider URL or local YAML.
            </span>
          </Card>
        )}
      </div>

      {/* Add Subscription Dialog */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <form onSubmit={handleAddProfile} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Add Subscription</DialogTitle>
              <DialogDescription>
                Import a remote Clash/Mihomo subscription link or paste local YAML.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={profileType === 'remote' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setProfileType('remote')}
                className="flex-1"
              >
                Remote URL
              </Button>
              <Button
                type="button"
                variant={profileType === 'local' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setProfileType('local')}
                className="flex-1"
              >
                Local YAML
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground font-medium">Profile Name</label>
              <Input
                type="text"
                required
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="e.g. Fast Proxy EU"
              />
            </div>

            {profileType === 'remote' ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium">Subscription URL</label>
                <Input
                  type="url"
                  required
                  value={profileUrl}
                  onChange={(e) => setProfileUrl(e.target.value)}
                  placeholder="https://provider.com/api/v1/client/subscribe?token=..."
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium">YAML Content</label>
                <Textarea
                  required
                  rows={5}
                  value={yamlContent}
                  onChange={(e) => setYamlContent(e.target.value)}
                  placeholder="Paste YAML content here..."
                />
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="glow" size="sm" disabled={submitting}>
                {submitting ? 'Downloading...' : 'Save Subscription'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
