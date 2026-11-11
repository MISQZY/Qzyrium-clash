import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { NavigationStore, SettingsStore, ProfilesStore, KernelStore } from './domains'

export function useWorkspaceRefresh(nav: NavigationStore, settings: SettingsStore, profiles: ProfilesStore,
  kernel: KernelStore, setRefreshing: Dispatch<SetStateAction<boolean>>) {
  const { setLoading, setDataRevision, pendingRefresh, refreshSequence, statusRevision, mounted } = nav
  const { setSettings, setSysProxy } = settings
  const { setProfiles, setActiveProfile } = profiles
  const { setCoreStatus, setSessionStartedAt } = kernel
  const refreshAll = useCallback((): Promise<void> => {
    if (!window.api) {
      setLoading(false)
      return Promise.resolve()
    }
    if (pendingRefresh.current) return pendingRefresh.current
    setRefreshing(true)
    const sequence = ++refreshSequence.current
    const revision = statusRevision.current
    const current = () => mounted.current && sequence === refreshSequence.current
    const apply = async <T,>(request: Promise<T>, update: (value: T) => void) => {
      const value = await request
      if (current()) update(value)
    }

    const request = (async () => {
      if (window.api?.app?.getBootSnapshot) {
        try {
          const boot = await window.api.app.getBootSnapshot()
          if (!current()) return
          setSettings(boot.settings)
          setProfiles(boot.profiles)
          setActiveProfile(boot.activeProfile)
          if (revision === statusRevision.current) {
            setCoreStatus(boot.coreStatus)
            setSessionStartedAt(boot.sessionStartedAt)
          }
          setSysProxy(boot.sysProxy)
          setLoading(false)
          setDataRevision((value) => value + 1)
          return
        } catch {
          // Fall back to individual requests if batched snapshot fails
        }
      }

      const proxyResult = Promise.allSettled([
        apply(window.api.sysproxy.getStatus(), setSysProxy)
      ])
      const results = await Promise.allSettled([
        apply(window.api.kernel.getStatus(), (status) => {
          if (revision !== statusRevision.current) return
          setCoreStatus(status)
        }),
        apply(
          window.api.kernel.getSessionStartedAt?.() ?? Promise.resolve(null),
          (startedAt) => {
            if (revision === statusRevision.current) setSessionStartedAt(startedAt)
          }
        ),
        apply(window.api.profiles.getList(), setProfiles),
        apply(window.api.profiles.getActive(), setActiveProfile),
        apply(window.api.settings.get(), setSettings)
      ])
      if (!current()) return
      setLoading(false)
      results.push(...(await proxyResult))
      if (!current()) return
      setDataRevision((value) => value + 1)
      const failure = results.find((result) => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    })()

    pendingRefresh.current = request
    const clear = () => {
      if (pendingRefresh.current === request) {
        pendingRefresh.current = null
        if (mounted.current) setRefreshing(false)
      }
    }
    void request.then(clear, clear)
    return request
  }, [mounted, pendingRefresh, refreshSequence, statusRevision, setLoading, setDataRevision,
    setProfiles, setActiveProfile, setCoreStatus, setSessionStartedAt, setSettings, setSysProxy, setRefreshing])
  return refreshAll
}
