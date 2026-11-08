import React, { useState } from 'react'
import { Folder, Save, ShieldCheck } from 'lucide-react'
import { AppConfig } from '@shared/app-config'
import { LogLevel } from '@shared/types'

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
    <div className="flex flex-col gap-6 p-6 h-[calc(100vh-2.5rem)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Application Settings</h2>
          <p className="text-xs text-slate-400">Configure networking, TUN device, ports, and app behavior</p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-sm shadow-indigo-600/30 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : savedSuccess ? 'Saved!' : 'Save Changes'}</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Kernel Networking Section */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Kernel Networking</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-300 font-medium">Mixed Port (HTTP + SOCKS5)</label>
              <input
                type="number"
                value={form.kernel.mixedPort}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kernel: { ...form.kernel, mixedPort: parseInt(e.target.value) || 7890 }
                  })
                }
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-300 font-medium">Controller Port (REST & WS)</label>
              <input
                type="number"
                value={form.kernel.controllerPort}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kernel: { ...form.kernel, controllerPort: parseInt(e.target.value) || 9090 }
                  })
                }
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
            <div>
              <span className="text-xs font-medium text-slate-200">Allow LAN Access</span>
              <p className="text-[11px] text-slate-500">Allow other devices on local network to use this proxy</p>
            </div>
            <input
              type="checkbox"
              checked={form.kernel.allowLan}
              onChange={(e) =>
                setForm({
                  ...form,
                  kernel: { ...form.kernel, allowLan: e.target.checked }
                })
              }
              className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
            <div>
              <span className="text-xs font-medium text-slate-200">Log Level</span>
              <p className="text-[11px] text-slate-500">Filter diagnostic verbosity output</p>
            </div>
            <select
              value={form.kernel.logLevel}
              onChange={(e) =>
                setForm({
                  ...form,
                  kernel: { ...form.kernel, logLevel: e.target.value as LogLevel }
                })
              }
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none font-mono"
            >
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="error">error</option>
              <option value="silent">silent</option>
            </select>
          </div>
        </div>

        {/* TUN Device Section */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">TUN Virtual Device</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-slate-300 font-medium">Enable TUN</span>
              <input
                type="checkbox"
                checked={form.kernel.tun.enable}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kernel: {
                      ...form.kernel,
                      tun: { ...form.kernel.tun, enable: e.target.checked }
                    }
                  })
                }
                className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
              />
            </label>
          </div>

          {form.kernel.tun.enable && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-300 font-medium">TUN Network Stack</label>
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
                  className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="system">System (Native kernel driver)</option>
                  <option value="gvisor">gVisor (Userspace TCP/IP)</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-300 font-medium">Auto Routing</label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={form.kernel.tun.autoRoute}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        kernel: {
                          ...form.kernel,
                          tun: { ...form.kernel.tun, autoRoute: e.target.checked }
                        }
                      })
                    }
                    className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-xs text-slate-400">Automatically modify OS default gateway</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Behavior & Directories */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">App Behavior & Storage</h3>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.general.autoConnect}
                onChange={(e) =>
                  setForm({
                    ...form,
                    general: { ...form.general, autoConnect: e.target.checked }
                  })
                }
                className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
              />
              <span className="text-xs text-slate-300">Auto-start core on application launch</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.general.minimizeToTray}
                onChange={(e) =>
                  setForm({
                    ...form,
                    general: { ...form.general, minimizeToTray: e.target.checked }
                  })
                }
                className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
              />
              <span className="text-xs text-slate-300">Minimize to system tray on window close</span>
            </label>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-800/60">
            <button
              type="button"
              onClick={() => handleOpenFolder('logs')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/70 text-slate-300 hover:text-white hover:bg-slate-800 text-xs transition-colors"
            >
              <Folder className="w-3.5 h-3.5" /> Open Logs Folder
            </button>
            <button
              type="button"
              onClick={() => handleOpenFolder('profiles')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/70 text-slate-300 hover:text-white hover:bg-slate-800 text-xs transition-colors"
            >
              <Folder className="w-3.5 h-3.5" /> Open Profiles Folder
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
