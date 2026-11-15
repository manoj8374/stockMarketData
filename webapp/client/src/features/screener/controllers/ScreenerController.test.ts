import { PreferencesStore } from '../../../common/stores/PreferencesStore'
import { StocksStore } from '../stores/StocksStore'
import { StocksFixtureService } from '../services/StocksFixtureService'
import { ScreenerController } from './ScreenerController'

async function setup(options: ConstructorParameters<typeof ScreenerController>[1] = {}) {
  const service = new StocksFixtureService()
  const preferences = new PreferencesStore()
  const stocks = new StocksStore(service)
  const controller = new ScreenerController({ stocks, preferences }, options)
  controller.mount()
  await controller.load()
  return { controller, service, preferences, stocks }
}

describe('ScreenerController', () => {
  beforeEach(() => localStorage.clear())

  it('loads stocks above the market-cap floor and ranks by momentum', async () => {
    const { controller } = await setup()
    expect(controller.isInitialLoad).toBe(false)
    expect(controller.stocks.every((s) => (s.marketCapCr ?? 0) >= 2000)).toBe(true)
    const scores = controller.sorted.map((r) => r.momentum).filter((v): v is number => v !== null)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('reloads with small caps when the toggle is turned off', async () => {
    const { controller, preferences, service } = await setup()
    const before = controller.stocks.length
    preferences.setHideSmallCaps(false)
    await controller.load()
    expect(service.calls).toBeGreaterThan(1)
    expect(controller.stocks.length).toBeGreaterThan(before)
  })

  it('filters by search, sector and range together', async () => {
    const { controller } = await setup()
    controller.setSectorFilter('Healthcare')
    expect(controller.sorted.every((r) => r.stock.sector === 'Healthcare')).toBe(true)
    controller.updateRange('market_cap_cr', 'min', '50000')
    expect(controller.sorted.every((r) => (r.stock.marketCapCr ?? 0) >= 50000)).toBe(true)
    controller.setSearch('zzz')
    expect(controller.sorted).toHaveLength(0)
    expect(controller.filtersActive).toBe(true)
    controller.clearFilters()
    expect(controller.sorted.length).toBe(controller.stocks.length)
  })

  it('clears the industry when the sector changes', async () => {
    const { controller } = await setup()
    controller.setIndustryFilter('Pharmaceuticals')
    controller.setSectorFilter('Capital Goods')
    expect(controller.industryFilter).toBe('')
    expect(controller.industryOptions).toEqual(['Heavy Electrical Equipment'])
  })

  it('sorts by several columns with shift-click', async () => {
    const { controller } = await setup()
    controller.sortBy('sector')
    controller.sortBy('current_price', true)
    expect(controller.effectiveSorts).toEqual([
      { key: 'sector', direction: 'asc' },
      { key: 'current_price', direction: 'desc' },
    ])
    const rows = controller.sorted
    for (let i = 1; i < rows.length; i++) {
      const [a, b] = [rows[i - 1].stock, rows[i].stock]
      if (a.sector === b.sector) expect(a.price as number).toBeGreaterThanOrEqual(b.price as number)
      else expect((a.sector as string).localeCompare(b.sector as string)).toBeLessThan(0)
    }
  })

  it('falls back to symbol order when the sorted column is hidden', async () => {
    const { controller } = await setup()
    controller.toggleColumn('momentum_score')
    expect(controller.effectiveSorts).toEqual([{ key: 'tradingsymbol', direction: 'asc' }])
  })

  it('adds a period at 0% weight and keeps the other weights', async () => {
    const { controller } = await setup()
    controller.toggleMonth(2)
    expect(controller.months).toEqual([1, 2, 3, 6])
    expect(controller.normalizedWeights).toEqual({ 1: 20, 2: 0, 3: 30, 6: 50 })
  })

  it('re-measures longer periods from the new shorter one', async () => {
    const { controller, stocks } = await setup()
    const id = controller.sorted[0].stock.id
    controller.toggleMonth(2)
    await stocks.load(controller.query)
    await controller.load()
    const stock = controller.stocks.find((s) => s.id === id)!
    const expected = ((stock.priceMonthsAgo(2)! - stock.priceMonthsAgo(3)!) / stock.priceMonthsAgo(3)!) * 100
    expect(stock.returnFor(3)).toBeCloseTo(expected, 1)
  })

  it('never removes the last selected period', async () => {
    const { controller } = await setup()
    controller.toggleMonth(1)
    controller.toggleMonth(3)
    controller.toggleMonth(6)
    expect(controller.months).toEqual([6])
  })

  it('pages through results and clamps the page', async () => {
    const { controller } = await setup()
    controller.setPageSize(25)
    controller.setPage(2)
    expect(controller.pageRows[0].stock.id).toBe(controller.sorted[25].stock.id)
    controller.setPage(99)
    expect(controller.currentPage).toBe(controller.totalPages)
  })

  it('round-trips its state through the URL', async () => {
    const { controller, stocks, preferences } = await setup()
    controller.setSearch('stk')
    controller.setSectorFilter('Healthcare')
    controller.sortBy('current_price', true)
    controller.setPage(1)
    const restored = new ScreenerController({ stocks, preferences }, { initialParams: new URLSearchParams(controller.urlParams) })
    expect(restored.search).toBe('stk')
    expect(restored.sectorFilter).toBe('Healthcare')
    expect(restored.sorts).toEqual(controller.sorts)
  })

  it('summarises the matching stocks', async () => {
    const { controller } = await setup()
    const summary = controller.summary
    expect(summary.matching).toBe(controller.sorted.length)
    expect(summary.top?.momentum).toBe(controller.sorted[0].momentum)
    expect(summary.advancingShare).toBeGreaterThan(0)
  })

  it('remembers selected periods and hidden columns', async () => {
    const { controller, stocks, preferences } = await setup()
    controller.toggleMonth(12)
    controller.toggleColumn('sector')
    const next = new ScreenerController({ stocks, preferences })
    expect(next.months).toContain(12)
    expect(next.hiddenColumns.has('sector')).toBe(true)
  })

  it('drops sector and industry columns on a drill-down', async () => {
    const { controller } = await setup({ fixedSector: 'Healthcare', fixedIndustry: 'Pharmaceuticals' })
    expect(controller.visibleColumns.some((c) => c.key === 'sector')).toBe(false)
    expect(controller.stocks.every((s) => s.industry === 'Pharmaceuticals')).toBe(true)
  })
})
