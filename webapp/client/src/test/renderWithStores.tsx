import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RootStore } from '../app/RootStore'
import { StoresProvider } from '../app/StoresContext'
import type { Services } from '../app/services'
import { createFixtureServices } from './fixtureServices'

export function createTestStore(overrides: Partial<Services> = {}) {
  return new RootStore(() => ({ ...createFixtureServices(), ...overrides }))
}

export function renderWithStores(ui: ReactElement, { store = createTestStore(), route = '/' } = {}) {
  const result = render(
    <StoresProvider store={store}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </StoresProvider>
  )
  return { ...result, store }
}
