import { useEffect, useMemo, type DependencyList } from 'react'
import { useStores } from '../../app/useStores'
import type { PageController } from '../stores/UiStore'

// Controllers keep their constructors free of side effects; reactions and
// subscriptions start in mount() and stop in dispose(). That keeps them safe
// under StrictMode, which mounts, unmounts and remounts every component.
export interface ControllerLifecycle {
  mount(): void
  dispose(): void
}

export function useController<T extends ControllerLifecycle>(create: () => T, deps: DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const controller = useMemo(create, deps)
  useEffect(() => {
    controller.mount()
    return () => controller.dispose()
  }, [controller])
  return controller
}

export function useActivePage(page: PageController) {
  const { ui } = useStores()
  useEffect(() => {
    ui.setActivePage(page)
    return () => ui.clearActivePage(page)
  }, [ui, page])
}
