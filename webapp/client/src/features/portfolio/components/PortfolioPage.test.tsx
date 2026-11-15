import { screen, within } from '@testing-library/react'
import { PortfolioPage } from './PortfolioPage'
import { createTestStore, renderWithStores } from '../../../test/renderWithStores'
import { PortfolioFixtureService } from '../services/PortfolioFixtureService'
import { ApiError } from '../../../core/network/ApiError'

describe('PortfolioPage', () => {
  beforeEach(() => localStorage.clear())

  it('shows KPIs, allocation and holdings', async () => {
    renderWithStores(<PortfolioPage />)
    expect(await screen.findByText('Kite connected')).toBeInTheDocument()
    expect(screen.getByText('Allocation by current value')).toBeInTheDocument()
    const [holdings] = screen.getAllByRole('table')
    expect(within(holdings).getByText('HDFCBANK')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'EMA 15' })).toBeInTheDocument()
    expect(screen.getByTitle('Not enough price history for this EMA')).toBeInTheDocument()
  })

  it('asks to connect Kite when the token is missing', async () => {
    const portfolio = new PortfolioFixtureService()
    portfolio.connected = false
    renderWithStores(<PortfolioPage />, { store: createTestStore({ portfolio }) })
    expect(await screen.findByText('Connect your Kite account')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect to Kite' })).toHaveAttribute(
      'href',
      expect.stringContaining('kite.zerodha.com')
    )
  })

  it('shows a retry option when Kite fails', async () => {
    const portfolio = new PortfolioFixtureService()
    jest.spyOn(portfolio, 'getPortfolio').mockRejectedValue(new ApiError('Kite /portfolio/holdings failed (429)', 502))
    renderWithStores(<PortfolioPage />, { store: createTestStore({ portfolio }) })
    expect(await screen.findByText("Couldn't load your portfolio")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument()
  })
})
