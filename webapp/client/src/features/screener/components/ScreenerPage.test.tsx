import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScreenerPage } from './ScreenerPage'
import { createTestStore, renderWithStores } from '../../../test/renderWithStores'
import { StocksFixtureService } from '../services/StocksFixtureService'
import { ApiError } from '../../../core/network/ApiError'

describe('ScreenerPage', () => {
  beforeEach(() => localStorage.clear())

  it('shows a skeleton, then the ranked table', async () => {
    renderWithStores(<ScreenerPage />)
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(await screen.findAllByRole('row')).not.toHaveLength(0)
    expect(screen.getByText('Matching')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Score/ })).toHaveAttribute('aria-sort', 'descending')
  })

  it('shows an error with a retry button when loading fails', async () => {
    const stocks = new StocksFixtureService()
    const spy = jest.spyOn(stocks, 'getStocks').mockRejectedValueOnce(new ApiError('Request failed (500)', 500))
    renderWithStores(<ScreenerPage />, { store: createTestStore({ stocks }) })
    expect(await screen.findByText("Couldn't load the stocks")).toBeInTheDocument()
    spy.mockRestore()
    await userEvent.setup().click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByText('STK002')).toBeInTheDocument()
  })

  it('shows the empty state and clears filters', async () => {
    renderWithStores(<ScreenerPage />)
    const user = userEvent.setup()
    await screen.findByText('STK002')
    await user.type(screen.getByLabelText('Search stocks'), 'nothing-matches')
    expect(screen.getByText('No stocks match these filters')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear all filters' }))
    expect(screen.getByText('STK002')).toBeInTheDocument()
  })

  it('opens the quick look for a row', async () => {
    renderWithStores(<ScreenerPage />)
    await userEvent.setup().click(await screen.findByText('STK002'))
    const dialog = await screen.findByRole('dialog', { name: 'Quick look' })
    expect(within(dialog).getByText('How the score adds up')).toBeInTheDocument()
    expect(within(dialog).getByText('1M-back score')).toBeInTheDocument()
  })

  it('opens the back-score breakdown without opening the quick look', async () => {
    renderWithStores(<ScreenerPage />)
    await screen.findByText('STK002')
    const [first] = screen.getAllByTitle('Show the breakdown')
    await userEvent.setup().click(first)
    expect(await screen.findByRole('dialog', { name: 'Back-score breakdown' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Quick look' })).not.toBeInTheDocument()
  })

  it('applies a filter preset from the drawer', async () => {
    renderWithStores(<ScreenerPage />)
    const user = userEvent.setup()
    await screen.findByText('STK002')
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    await user.click(screen.getByRole('button', { name: '≥ ₹1 L Cr' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument())
    expect(screen.getByText('Market cap ≥ ₹1,00,000 Cr')).toBeInTheDocument()
  })
})
