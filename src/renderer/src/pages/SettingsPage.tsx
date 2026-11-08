import React, { useState } from 'react'
import { Folder, Save, ShieldCheck } from 'lucide-react'
import { AppConfig } from '@shared/app-config'
import { LogLevel } from '@shared/types'
import { Button } from '../components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'

interface SettingsPageProps {
  settings: AppConfig
  onSaveSettings: (patch: Partial<AppConfig>) => Promise<void>
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onSaveSettings }) => {
  const [form, setForm] = useState<AppConfig>(settings)
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSaveSettings(form)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleOpenFolder = (target: 'logs' | 'data' | 'profiles') => {
    window.api?.window.openFolder(target)
  }

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Settings</h2>
          <p className="text-xs text-muted-foreground">Configure ports, TUN virtual device, and app preferences</p>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={saving}
          variant="glow"
          size="sm"
          className="gap-2"
        >
          <Save className="size-3.5" />
          <span>{saving ? 'Saving...' : savedSuccess ? 'Saved!' : 'Save Settings'}</span>
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Kernel Networking Section */}
        <Card>
          <CardHeader>
            <CardTitle>Kernel Networking</CardTitle>
            <CardDescription>Port allocation and local network interface behavior</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-foreground font-medium">
                  Mixed Proxy Port (HTTP + SOCKS5)
                </label>
                <Input
                  type="number"
                  value={form.kernel.mixedPort}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      kernel: { ...form.kernel, mixedPort: parseInt(e.target.value) || 7895 }
                    })
                  }
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-foreground font-medium">
                  Controller Port (REST & WebSockets)
                </label>
                <Input
                  type="number"
                  value={form.kernel.controllerPort}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      kernel: { ...form.kernel, controllerPort: parseInt(e.target.value) || 9095 }
                    })
                  }
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <div>
                <span className="text-xs font-medium text-foreground">Allow LAN Access</span>
                <p className="text-[11px] text-muted-foreground">
                  Allow devices on your local network to connect through this client
                </p>
              </div>
              <Switch
                checked={form.kernel.allowLan}
                onCheckedChange={(checked) =>
                  setForm({
                    ...form,
                    kernel: { ...form.kernel, allowLan: checked }
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <div>
                <span className="text-xs font-medium text-foreground">Core Log Verbosity</span>
                <p className="text-[11px] text-muted-foreground">Filter stdout/stderr diagnostics</p>
              </div>
              <select
                value={form.kernel.logLevel}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kernel: { ...form.kernel, logLevel: e.target.value as LogLevel }
                  })
                }
                className="h-8.5 px-3 rounded-lg border border-input bg-card text-xs text-foreground font-mono focus:outline-none focus:border-ring cursor-pointer"
              >
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="error">error</option>
                <option value="silent">silent</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* TUN Device Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <CardTitle>TUN Virtual Device</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Virtual NIC</span>
                <Switch
                  checked={form.kernel.tun.enable}
                  onCheckedChange={(checked) =>
                    setForm({
                      ...form,
                      kernel: {
                        ...form.kernel,
                        tun: { ...form.kernel.tun, enable: checked }
                      }
                    })
                  }
                />
              </div>
            </div>
            <CardDescription>
              Captures all system networking at L3 IP packet layer without system proxy configuration
            </CardDescription>
          </CardHeader>

          {form.kernel.tun.enable && (
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-0">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-foreground font-medium">Network Stack</label>
                <select
                  value={form.kernel.tun.stack}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      kernel: {
                        ...form.kernel,
                        tun: {
                          ...form.kernel.tun,
                          stack: e.target.value as 'system' | 'gvisor' | 'mixed'
                        }
                      }
                    })
                  }
                  className="h-8.5 px-3 rounded-lg border border-input bg-card text-xs text-foreground focus:outline-none focus:border-ring cursor-pointer"
                >
                  <option value="system">System (Native kernel driver)</option>
                  <option value="gvisor">gVisor (Userspace TCP/IP)</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>

              <div className="flex items-center justify-between sm:justify-start sm:gap-4 mt-4 sm:mt-6">
                <span className="text-xs text-foreground font-medium">Auto Routing</span>
                <Switch
                  checked={form.kernel.tun.autoRoute}
                  onCheckedChange={(checked) =>
                    setForm({
                      ...form,
                      kernel: {
                        ...form.kernel,
                        tun: { ...form.kernel.tun, autoRoute: checked }
                      }
                    })
                  }
                />
              </div>
            </CardContent>
          )}
        </Card>

        {/* Behavior & File Explorer */}
        <Card>
          <CardHeader>
            <CardTitle>Behavior & Storage</CardTitle>
            <CardDescription>Startup preferences and system directories</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-foreground">Auto-Connect</span>
                <p className="text-[11px] text-muted-foreground">Start core automatically on launch</p>
              </div>
              <Switch
                checked={form.general.autoConnect}
                onCheckedChange={(checked) =>
                  setForm({
                    ...form,
                    general: { ...form.general, autoConnect: checked }
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <div>
                <span className="text-xs font-medium text-foreground">Minimize to Tray</span>
                <p className="text-[11px] text-muted-foreground">Keep app in system tray on window close</p>
              </div>
              <Switch
                checked={form.general.minimizeToTray}
                onCheckedChange={(checked) =>
                  setForm({
                    ...form,
                    general: { ...form.general, minimizeToTray: checked }
                  })
                }
              />
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenFolder('logs')}
                className="gap-2"
              >
                <Folder className="size-3.5" />
                <span>Open Logs Folder</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenFolder('profiles')}
                className="gap-2"
              >
                <Folder className="size-3.5" />
                <span>Open Profiles Folder</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
