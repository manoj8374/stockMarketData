import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WatchlistPage } from './WatchlistPage'
import { createTestStore, renderWithStores } from '../../../test/renderWithStores'
import { fakeTransport, tick } from '../../../test/FakeTransport'

async function renderWatchlist() {
  const transport = fakeTransport()
  const store = createTestStore({}, { createTransport: transport.createTransport })
  await store.auth.login('guest', 'guest-pass')
  renderWithStores(<WatchlistPage />, { store })
  return { store, transport: () => transport.ref.current! }
}

const rowFor = (symbol: string) => screen.getByText(symbol).closest('tr') as HTMLElement

describe('WatchlistPage', () => {
  beforeEach(() => localStorage.clear())

  it('subscribes to the saved symbols and shows live prices as they arrive', async () => {
    const { transport } = await renderWatchlist()
    expect(transport().subscribed).toEqual(expect.arrayContaining(['NSE:RELIANCE', 'NSE:NIFTY 50']))
    expect(within(rowFor('RELIANCE')).getAllByText('—').length).toBeGreaterThan(0)

    act(() => transport().emit({ type: 'ticks', ticks: [tick('NSE:RELIANCE', 104.5)] }))
    const row = rowFor('RELIANCE')
    expect(within(row).getByText('104.50')).toHaveClass('live-price')
    expect(within(row).getByText('+4.50%')).toBeInTheDocument()

    act(() => transport().emit({ type: 'ticks', ticks: [tick('NSE:RELIANCE', 103)] }))
    expect(within(rowFor('RELIANCE')).getByText('103.00')).toHaveClass('flash-down')
  })

  it('adds a symbol from search and subscribes to it', async () => {
    const { transport, store } = await renderWatchlist()
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) })
    jest.useFakeTimers()
    try {
      await user.type(screen.getByLabelText('Add to watchlist'), 'itc')
      await act(async () => {
        jest.advanceTimersByTime(300)
      })
      await user.click(await screen.findByRole('button', { name: /ITC Ltd/ }))
    } finally {
      jest.useRealTimers()
    }
    expect(store.watchlist.has('NSE:ITC')).toBe(true)
    expect(transport().subscribed).toContain('NSE:ITC')
    expect(screen.getByText('ITC')).toBeInTheDocument()
  })

  it('removes a symbol and releases its subscription', async () => {
    const { transport } = await renderWatchlist()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove SBIN' }))
    expect(screen.queryByText('SBIN')).not.toBeInTheDocument()
    expect(transport().subscribed).not.toContain('NSE:SBIN')
  })

  it('explains when the live feed is not set up', async () => {
    const { transport } = await renderWatchlist()
    act(() => transport().setStatus('unavailable'))
    expect(screen.getByText('Live feed not set up')).toBeInTheDocument()
  })
})
