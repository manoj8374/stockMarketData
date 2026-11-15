import { LiveTicksStore } from '../stores/LiveTicksStore'
import { OptionChainStore } from '../stores/OptionChainStore'
import { LiveFixtureService } from '../services/LiveFixtureService'
import { OptionChainController } from './OptionChainController'
import { fakeTransport, tick } from '../../../test/FakeTransport'

async function setup() {
  const { ref, createTransport } = fakeTransport()
  const live = new LiveTicksStore(createTransport, (cb) => cb())
  const chains = new OptionChainStore(new LiveFixtureService())
  const controller = new OptionChainController({ live, chains })
  controller.mount()
  await controller.load()
  return { controller, live, transport: () => ref.current! }
}

const spot = (ltp: number) => ({ type: 'ticks', ticks: [tick('NSE:NIFTY 50', ltp)] })

describe('OptionChainController', () => {
  it('centres the window on the middle strike until spot arrives', async () => {
    const { controller } = await setup()
    expect(controller.atmStrike).toBe(24300)
    expect(controller.visibleStrikes).toHaveLength(21)
  })

  it('picks the strike nearest to spot as ATM and follows it', async () => {
    const { controller, transport } = await setup()
    transport().emit(spot(24012))
    expect(controller.atmStrike).toBe(24000)
    expect(controller.visibleStrikes[10].strike).toBe(24000)
    transport().emit(spot(24390))
    expect(controller.atmStrike).toBe(24400)
  })

  it('subscribes to spot plus both legs of every visible strike', async () => {
    const { controller, transport } = await setup()
    const subscribed = transport().subscribed
    expect(subscribed).toContain('NSE:NIFTY 50')
    expect(subscribed).toHaveLength(1 + controller.visibleStrikes.length * 2)
  })

  it('moves subscriptions with the window and keeps the shared strikes', async () => {
    const { transport } = await setup()
    const before = new Set(transport().subscribed)
    transport().emit(spot(24400))
    const after = transport().subscribed
    expect(after.some((s) => !before.has(s))).toBe(true)
    expect(after).toContain('NFO:NIFTY26111724300CE')
    expect(after).toHaveLength(before.size)
  })

  it('shrinks the window on request', async () => {
    const { controller, transport } = await setup()
    controller.setStrikesEachSide(5)
    expect(controller.visibleStrikes).toHaveLength(11)
    expect(transport().subscribed).toHaveLength(1 + 22)
  })

  it('computes the put-call ratio from open interest', async () => {
    const { controller, transport } = await setup()
    transport().emit(spot(24300))
    transport().emit({
      type: 'ticks',
      ticks: [tick('NFO:NIFTY26111724300CE', 120, { oi: 1000 }), tick('NFO:NIFTY26111724300PE', 110, { oi: 1500 })],
    })
    expect(controller.pcr).toBeCloseTo(1.5)
    expect(controller.maxOi).toBe(1500)
  })

  it('marks in-the-money strikes for calls and puts', async () => {
    const { controller, transport } = await setup()
    transport().emit(spot(24310))
    expect(controller.isCallInTheMoney(24300)).toBe(true)
    expect(controller.isPutInTheMoney(24300)).toBe(false)
    expect(controller.isPutInTheMoney(24350)).toBe(true)
  })

  it('loads another expiry', async () => {
    const { controller } = await setup()
    controller.setExpiry('2026-11-24')
    await controller.load()
    expect(controller.chain?.expiry).toBe('2026-11-24')
    expect(controller.visibleStrikes[0].ce).toContain('261124')
  })

  it('releases every subscription on dispose', async () => {
    const { controller, transport } = await setup()
    controller.dispose()
    expect(transport().subscribed).toEqual([])
  })
})
