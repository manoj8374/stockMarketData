import { useContext } from 'react'
import { StoresContext } from './storesContextValue'

export function useStores() {
  const store = useContext(StoresContext)
  if (!store) throw new Error('useStores must be used inside <StoresProvider>')
  return store
}
