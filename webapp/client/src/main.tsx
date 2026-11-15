import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import { App } from './app/App'
import { RootStore } from './app/RootStore'
import { StoresProvider } from './app/StoresContext'

const store = new RootStore()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoresProvider store={store}>
      <App />
    </StoresProvider>
  </StrictMode>
)
