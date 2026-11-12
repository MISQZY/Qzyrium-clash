import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigation } from '../stores/useAppStore'
import type { NavTab } from '../lib/navigation'

export const TOUR_STORAGE_KEY = 'qzyrium:onboarding-shown'
export const TOUR_STEPS = [
  { id: 'welcome', page: 'dashboard' },
  { id: 'navigation', page: 'dashboard', target: 'navigation' },
  { id: 'profiles', page: 'profiles', target: 'add-profile' },
  { id: 'proxies', page: 'proxies', target: 'proxies' },
  { id: 'capture', page: 'settings', target: 'capture' },
  { id: 'connect', page: 'dashboard', target: 'connect' },
  { id: 'routing', page: 'dashboard', target: 'routing' },
  { id: 'connections', page: 'connections', target: 'connections' },
  { id: 'finish', page: 'settings', target: 'restart-tour' }
] as const satisfies readonly { id: string; page: NavTab; target?: string }[]

const TourContext = createContext<{
  index: number | null; start: () => void; stop: () => void; next: () => void; back: () => void
} | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const { loading, setActiveTab } = useNavigation()
  const [index, setIndex] = useState<number | null>(null)
  const checked = useRef(false)
  const start = useCallback(() => {
    // Mark on display, so quitting halfway through also suppresses another automatic run.
    try { localStorage.setItem(TOUR_STORAGE_KEY, '1') } catch { /* Storage may be unavailable in a preview. */ }
    setActiveTab(TOUR_STEPS[0].page)
    setIndex(0)
  }, [setActiveTab])
  useEffect(() => {
    if (loading || checked.current) return
    checked.current = true
    try { if (localStorage.getItem(TOUR_STORAGE_KEY) === '1') return } catch { /* Show once this session. */ }
    start()
  }, [loading, start])
  const stop = useCallback(() => setIndex(null), [])
  const move = (next: number) => {
    if (next >= TOUR_STEPS.length) { stop(); return }
    const clamped = Math.max(0, next)
    setActiveTab(TOUR_STEPS[clamped].page)
    setIndex(clamped)
  }
  return <TourContext.Provider value={{ index, start, stop, next: () => move((index ?? 0) + 1), back: () => move((index ?? 0) - 1) }}>{children}</TourContext.Provider>
}

export function useTour() {
  const context = useContext(TourContext)
  if (!context) throw new Error('useTour requires TourProvider')
  return context
}
