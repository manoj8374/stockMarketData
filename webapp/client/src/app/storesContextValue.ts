import { createContext } from 'react'
import type { RootStore } from './RootStore'

export const StoresContext = createContext<RootStore | null>(null)
