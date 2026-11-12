import type { StoreCoordinator } from './types'

/** Start an independently retried request and return its effect cleanup. */
export function loadDataset<T>(
  { statusRevision, actionInProgress, reportError }: Pick<StoreCoordinator, 'statusRevision' | 'actionInProgress' | 'reportError'>,
  request: () => Promise<T>,
  publish: (value: T) => void
): () => void {
  let disposed = false
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const revision = statusRevision.current
  const current = () =>
    !disposed && !actionInProgress.current && revision === statusRevision.current

  const load = async (attempt = 0): Promise<void> => {
    try {
      const value = await request()
      if (current()) publish(value)
    } catch (err) {
      if (!current()) return
      if (attempt < 2) {
        const timer = setTimeout(() => {
          timers.delete(timer)
          void load(attempt + 1)
        }, 1000 * 2 ** attempt)
        timers.add(timer)
      } else {
        reportError(err)
      }
    }
  }

  void load()
  return () => {
    disposed = true
    timers.forEach(clearTimeout)
  }
}
