import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WatchlistPage } from './WatchlistPage'
import { createTestStore, renderWithStores } from '../../../test/renderWithStores'
import { fakeTransport, tick } from '../../../test/FakeTransport'
import { charts } from '../../../test/candleChartStub'

async function renderWatchlist() {
  const transport = fakeTransport()
  const store = createTestStore({}, { createTransport: transport.createTransport })
  await store.auth.login('guest', 'guest-pass')
  renderWithStores(<WatchlistPage />, { store })
  return { store, transport: () => transport.ref.current! }
}

const table = () => screen.getByRole('table')
const rowFor = (symbol: string) => within(table()).getByText(symbol).closest('tr') as HTMLElement

describe('WatchlistPage', () => {
  beforeEach(() => {
    localStorage.clear()
    charts.length = 0
  })

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

  it('adds a symbol from search, subscribes to it and charts it', async () => {
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
    expect(within(table()).getByText('ITC')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'ITC chart' })).toBeInTheDocument()
  })

  it('removes a symbol and releases its subscription', async () => {
    const { transport } = await renderWatchlist()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove SBIN' }))
    expect(within(table()).queryByText('SBIN')).not.toBeInTheDocument()
    expect(transport().subscribed).not.toContain('NSE:SBIN')
  })

  it('charts the selected symbol and keeps the last candle live', async () => {
    const { transport } = await renderWatchlist()
    expect(transport().sent).toContainEqual({ type: 'history', symbol: 'NSE:NIFTY 50' })
    expect(screen.getByText('Loading 1-minute candles…')).toBeInTheDocument()

    const minute = Math.floor(Date.now() / 60_000) * 60_000
    act(() =>
      transport().emit({ type: 'candles', symbol: 'NSE:NIFTY 50', candles: [{ t: minute, o: 100, h: 101, l: 99, c: 100, v: 0 }] })
    )
    expect(charts).toHaveLength(1)
    expect(screen.getByText(/^1 candles/)).toBeInTheDocument()

    act(() => transport().emit({ type: 'ticks', ticks: [tick('NSE:NIFTY 50', 106, { ts: minute + 5000 })] }))
    expect(charts[0].updates).toBe(1)
    expect(charts[0].candles[0]).toMatchObject({ h: 106, c: 106 })

    await userEvent.setup().click(rowFor('RELIANCE'))
    expect(charts[0].destroyed).toBe(true)
    expect(transport().sent).toContainEqual({ type: 'history', symbol: 'NSE:RELIANCE' })
  })

  it('explains when the live feed is not set up', async () => {
    const { transport } = await renderWatchlist()
    act(() => transport().setStatus('unavailable'))
    expect(screen.getByText('Live feed not set up')).toBeInTheDocument()
  })
})
