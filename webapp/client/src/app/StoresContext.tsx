import type { ReactNode } from 'react'
import type { RootStore } from './RootStore'
import { StoresContext } from './storesContextValue'

export function StoresProvider({ store, children }: { store: RootStore; children: ReactNode }) {
  return <StoresContext.Provider value={store}>{children}</StoresContext.Provider>
}
