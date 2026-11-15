import { act, screen, within } from '@testing-library/react'
import { OptionChainPage } from './OptionChainPage'
import { createTestStore, renderWithStores } from '../../../test/renderWithStores'
import { fakeTransport, tick } from '../../../test/FakeTransport'
import { LiveFixtureService } from '../services/LiveFixtureService'
import { ApiError } from '../../../core/network/ApiError'

async function renderChain(live = new LiveFixtureService()) {
  const transport = fakeTransport()
  const store = createTestStore({ live }, { createTransport: transport.createTransport })
  await store.auth.login('guest', 'guest-pass')
  renderWithStores(<OptionChainPage />, { store })
  return { transport: () => transport.ref.current! }
}

describe('OptionChainPage', () => {
  it('shows the chain with live prices, the ATM marker and the PCR', async () => {
    const { transport } = await renderChain()
    const table = await screen.findByRole('table')
    act(() =>
      transport().emit({
        type: 'ticks',
        ticks: [
          tick('NSE:NIFTY 50', 24302),
          tick('NFO:NIFTY26111724300CE', 131.5, { oi: 2000 }),
          tick('NFO:NIFTY26111724300PE', 128.25, { oi: 3000 }),
        ],
      })
    )
    const atmRow = within(table).getByText('ATM').closest('tr') as HTMLElement
    expect(atmRow).toHaveTextContent('24,300')
    expect(within(atmRow).getByText('131.50')).toBeInTheDocument()
    expect(within(atmRow).getByText('128.25')).toBeInTheDocument()
    expect(screen.getByText('1.50')).toBeInTheDocument()
  })

  it('explains when the relay is not set up', async () => {
    const live = new LiveFixtureService()
    jest.spyOn(live, 'getOptionChain').mockRejectedValue(new ApiError('The live feed is not set up', 503, 'not_configured'))
    await renderChain(live)
    expect(await screen.findByText('Live feed not set up')).toBeInTheDocument()
  })
})
