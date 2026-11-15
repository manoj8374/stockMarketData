import { PreferencesStore } from '../../../common/stores/PreferencesStore'
import { IndustryMomentumStore } from '../stores/IndustryMomentumStore'
import { IndustryMomentumFixtureService } from '../services/IndustryMomentumFixtureService'
import { IndustriesController } from './IndustriesController'

async function setup() {
  const industryMomentum = new IndustryMomentumStore(new IndustryMomentumFixtureService())
  const preferences = new PreferencesStore()
  const controller = new IndustriesController({ industryMomentum, preferences })
  controller.mount()
  await controller.load()
  return { controller, industryMomentum, preferences }
}

describe('IndustriesController', () => {
  beforeEach(() => localStorage.clear())

  it('ranks industries by score, highest first', async () => {
    const { controller } = await setup()
    const scores = controller.sorted.map((r) => r.score).filter((s): s is number => s !== null)
    expect(scores.length).toBeGreaterThan(3)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('splits leaders and laggards without overlap', async () => {
    const { controller } = await setup()
    const ranked = controller.ranked.map((r) => r.model.key)
    expect(controller.leaders[0].model.key).toBe(ranked[0])
    expect(controller.laggards[0].model.key).toBe(ranked[ranked.length - 1])
    const leaderKeys = new Set(controller.leaders.map((r) => r.model.key))
    expect(controller.laggards.some((r) => leaderKeys.has(r.model.key))).toBe(false)
  })

  it('rescores when the weights change', async () => {
    const { controller, industryMomentum } = await setup()
    const before = controller.rows.map((r) => r.score)
    industryMomentum.setPeriodWeight(1, '100')
    industryMomentum.setPeriodWeight(3, '0')
    industryMomentum.setPeriodWeight(6, '0')
    const blend = industryMomentum.normalizedBlend
    expect(controller.rows[0].score).toBeCloseTo(controller.rows[0].model.periodScore(1, blend)!)
    expect(controller.rows.map((r) => r.score)).not.toEqual(before)
  })

  it('searches by industry or sector', async () => {
    const { controller } = await setup()
    controller.setSearch('health')
    expect(controller.sorted.length).toBeGreaterThan(0)
    expect(controller.sorted.every((r) => r.model.sector === 'Healthcare')).toBe(true)
  })

  it('keeps at least one metric and falls back when a sorted metric is hidden', async () => {
    const { controller } = await setup()
    controller.sortBy('median_1')
    controller.toggleMetric('median')
    expect(controller.effectiveSorts).toEqual([{ key: 'score', direction: 'desc' }])
    controller.toggleMetric('score')
    controller.toggleMetric('breadth')
    expect(controller.metrics).toEqual(['breadth'])
  })

  it('summarises coverage and breadth', async () => {
    const { controller } = await setup()
    const summary = controller.summary
    expect(summary.ranked).toBe(controller.rows.length)
    expect(summary.breadth?.total).toBeGreaterThan(0)
    expect(summary.minMarketCap).toBe(2000)
  })
})
