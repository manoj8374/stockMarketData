import { makeAutoObservable, observableRef, reaction } from 'mobx'
import type { Resource } from '../../../core/network/Resource'
import type { PreferencesStore } from '../../../common/stores/PreferencesStore'
import { Disposer } from '../../../common/utils/Disposer'
import type { IndustryMomentumData, IndustryMomentumStore } from '../../industries/stores/IndustryMomentumStore'

interface Deps {
  industryMomentum: IndustryMomentumStore
  preferences: PreferencesStore
}

// Header numbers for one industry, scored with the same saved weights as the
// Industry Momentum page.
export class IndustryDrillController {
  resource: Resource<IndustryMomentumData> | null = null
  readonly sector: string
  readonly industry: string
  private readonly deps: Deps
  private readonly disposer = new Disposer()

  constructor(deps: Deps, sector: string, industry: string) {
    this.deps = deps
    this.sector = sector
    this.industry = industry
    makeAutoObservable<IndustryDrillController, 'deps' | 'disposer'>(
      this,
      { resource: observableRef, deps: false, disposer: false, sector: false, industry: false },
      { autoBind: true }
    )
  }

  mount() {
    this.disposer.add(
      reaction(
        () => this.deps.preferences.minMarketCap,
        (minCap) => {
          this.resource = this.deps.industryMomentum.resourceFor(minCap)
          void this.deps.industryMomentum.load(minCap)
        },
        { fireImmediately: true }
      )
    )
  }

  dispose() {
    this.disposer.dispose()
  }

  get isLoading() {
    return !this.resource || (this.resource.data === null && !this.resource.hasFailed)
  }

  get model() {
    return this.resource?.data?.industries.find((m) => m.sector === this.sector && m.industry === this.industry) ?? null
  }

  get minStocks() {
    return this.resource?.data?.minStocks ?? 3
  }

  get stats() {
    const model = this.model
    if (!model) return null
    const month = model.stats(1)
    return {
      score: this.deps.industryMomentum.scoreOf(model),
      breadth: month.breadth,
      positive: month.positive,
      count: month.count,
      median: month.median,
    }
  }
}
