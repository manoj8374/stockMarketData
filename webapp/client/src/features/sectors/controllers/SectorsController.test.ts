import { PreferencesStore } from '../../../common/stores/PreferencesStore'
import { SectorsStore } from '../stores/SectorsStore'
import { SectorsFixtureService } from '../services/SectorsFixtureService'
import { SectorDetailController, SectorsController } from './SectorsController'

function deps() {
  return { sectors: new SectorsStore(new SectorsFixtureService()), preferences: new PreferencesStore() }
}

describe('SectorsController', () => {
  beforeEach(() => localStorage.clear())

  it('loads sectors sorted by stock count', async () => {
    const d = deps()
    const controller = new SectorsController(d)
    controller.mount()
    await controller.load()
    const counts = controller.visible.map((s) => s.count)
    expect(counts.length).toBeGreaterThan(3)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(controller.totalStocks).toBe(counts.reduce((a, b) => a + b, 0))
  })

  it('sorts by name or median and remembers the choice', async () => {
    const d = deps()
    const controller = new SectorsController(d)
    controller.mount()
    await controller.load()
    controller.setSortBy('name')
    const names = controller.visible.map((s) => s.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    controller.setSortBy('median')
    const medians = controller.visible.map((s) => s.median1m).filter((m): m is number => m !== null)
    expect(medians).toEqual([...medians].sort((a, b) => b - a))
    expect(new SectorsController(d).sortBy).toBe('median')
  })

  it('filters by search', async () => {
    const d = deps()
    const controller = new SectorsController(d)
    controller.mount()
    await controller.load()
    controller.setSearch('metal')
    expect(controller.visible.map((s) => s.name)).toEqual(['Metals & Mining'])
  })

  it('lists the industries inside one sector', async () => {
    const d = deps()
    const controller = new SectorDetailController(d, 'Automobile and Auto Components')
    controller.mount()
    await controller.load()
    expect(controller.industries.map((i) => i.name).sort()).toEqual(['2/3 Wheelers', 'Automobiles-Trucks/Lcv'])
    expect(controller.largestCount).toBe(Math.max(...controller.industries.map((i) => i.count)))
  })
})
