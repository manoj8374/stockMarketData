import { HoldingModel } from '../models/HoldingModel'
import { PortfolioStore } from '../stores/PortfolioStore'
import { PortfolioFixtureService } from '../services/PortfolioFixtureService'
import { PortfolioController } from './PortfolioController'

async function setup(service = new PortfolioFixtureService()) {
  const store = new PortfolioStore(service)
  const controller = new PortfolioController(store)
  controller.mount()
  await store.portfolio.pending
  return { controller, store, service }
}

describe('HoldingModel', () => {
  const holding = new HoldingModel({
    tradingsymbol: 'ABC',
    quantity: 10,
    average_price: 100,
    last_price: 120,
    pnl: 200,
    ema: 110,
    ema_signal: 'above',
  })

  it('derives value, invested amount and return', () => {
    expect(holding.value).toBe(1200)
    expect(holding.invested).toBe(1000)
    expect(holding.returnPct).toBe(20)
  })

  it('measures the gap to the EMA', () => {
    expect(holding.gapToEma).toBeCloseTo((120 / 110 - 1) * 100)
  })
})

describe('PortfolioController', () => {
  beforeEach(() => localStorage.clear())

  it('loads holdings and computes the KPIs', async () => {
    const { controller } = await setup()
    const k = controller.kpis!
    expect(controller.holdings.length).toBe(7)
    expect(k.holdingsReturnPct).toBeCloseTo(((k.currentValue - k.totalInvestment) / k.totalInvestment) * 100)
    expect(k.dayPct).toBeCloseTo((k.dayPnl / (k.currentValue - k.dayPnl)) * 100)
  })

  it('groups everything past the five largest holdings as Others', async () => {
    const { controller } = await setup()
    const slices = controller.allocation
    expect(slices).toHaveLength(6)
    expect(slices[5].label).toBe('Others')
    expect(slices.reduce((acc, s) => acc + s.share, 0)).toBeCloseTo(1)
    expect(slices[0].value).toBeGreaterThanOrEqual(slices[1].value)
  })

  it('reloads when the EMA period changes and remembers it', async () => {
    const { controller, store } = await setup()
    controller.choosePeriod(50)
    await store.portfolio.pending
    expect(store.portfolio.data?.emaPeriod).toBe(50)
    expect(new PortfolioStore(new PortfolioFixtureService()).emaPeriod).toBe(50)
  })

  it('clamps a typed EMA period into range', async () => {
    const { controller } = await setup()
    controller.setEmaInput('500')
    controller.commitEmaInput()
    expect(controller.emaPeriod).toBe(200)
    controller.setEmaInput('abc')
    controller.commitEmaInput()
    expect(controller.emaInput).toBe('200')
  })

  it('recognises a disconnected Kite account', async () => {
    const service = new PortfolioFixtureService()
    service.connected = false
    const { controller } = await setup(service)
    expect(controller.isNotConnected).toBe(true)
    expect(controller.loadError).toBeNull()
  })
})
