import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from '../../../app/AppRoutes'
import { renderWithStores } from '../../../test/renderWithStores'

describe('Sectors to industry drill-down', () => {
  beforeEach(() => localStorage.clear())

  it('walks from a sector card to the stocks of one industry', async () => {
    renderWithStores(<AppRoutes />, { route: '/sectors' })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Automobile and Auto Components/ }))
    expect(await screen.findByRole('heading', { name: 'Automobile and Auto Components' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: /Automobiles-Trucks\/Lcv/ }))
    expect(await screen.findByRole('heading', { name: 'Automobiles-Trucks/Lcv' })).toBeInTheDocument()
    expect(await screen.findByText('Industry score')).toBeInTheDocument()

    const table = await screen.findByRole('table')
    expect(within(table).queryByRole('columnheader', { name: /Sector/ })).not.toBeInTheDocument()
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(2)
  })

  it('opens an industry from the Industry Momentum leaderboard', async () => {
    renderWithStores(<AppRoutes />, { route: '/industries' })
    const user = userEvent.setup()
    expect(await screen.findByRole('heading', { name: 'Leading' })).toBeInTheDocument()
    const leading = screen.getByRole('heading', { name: 'Leading' }).closest('section') as HTMLElement
    const [first] = within(leading).getAllByRole('button')
    const name = first.querySelector('b')?.textContent ?? ''
    await user.click(first)
    expect(await screen.findByRole('heading', { name })).toBeInTheDocument()
  })
})
