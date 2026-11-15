import { makeAutoObservable } from 'mobx'
import { Resource } from '../../../core/network/Resource'
import { loadJSON, saveJSON } from '../../../common/utils/storage'
import { IndustryMomentumModel } from '../models/IndustryMomentumModel'
import {
  BLEND_KEYS,
  DEFAULT_BLEND,
  DEFAULT_PERIOD_WEIGHTS,
  normalize,
  PERIODS,
  sanitizeWeights,
  type BlendKey,
  type BlendWeights,
  type Period,
  type PeriodWeights,
} from '../models/industryWeights'
import type { IndustryMomentumService } from '../services/IndustryMomentumService'

export interface IndustryMomentumData {
  generatedAt: string
  minStocks: number
  eligibleStocks: number
  excludedIndustries: number
  minMarketCap: number | null
  industries: IndustryMomentumModel[]
}

const BLEND_KEY = 'industryBlendWeights'
const PERIODS_KEY = 'industryPeriodWeights'

// Shared by the Industry Momentum page and the industry drill-down header,
// so both always score with the same weights.
export class IndustryMomentumStore {
  blend: BlendWeights = sanitizeWeights(loadJSON(BLEND_KEY, null), DEFAULT_BLEND)
  periodWeights: PeriodWeights = sanitizeWeights(loadJSON(PERIODS_KEY, null), DEFAULT_PERIOD_WEIGHTS)
  private readonly byMinCap = new Map<number, Resource<IndustryMomentumData>>()
  private readonly service: IndustryMomentumService

  constructor(service: IndustryMomentumService) {
    this.service = service
    makeAutoObservable<IndustryMomentumStore, 'byMinCap' | 'service'>(this, { byMinCap: false, service: false }, { autoBind: true })
  }

  get normalizedBlend(): Record<BlendKey, number> | null {
    return normalize(this.blend, BLEND_KEYS)
  }

  get normalizedPeriods(): Record<Period, number> | null {
    return normalize(this.periodWeights, PERIODS)
  }

  setBlend(key: BlendKey, value: string) {
    this.blend = { ...this.blend, [key]: value }
    saveJSON(BLEND_KEY, this.blend)
  }

  setPeriodWeight(period: Period, value: string) {
    this.periodWeights = { ...this.periodWeights, [period]: value }
    saveJSON(PERIODS_KEY, this.periodWeights)
  }

  resetBlend() {
    this.blend = { ...DEFAULT_BLEND }
    saveJSON(BLEND_KEY, this.blend)
  }

  resetPeriodWeights() {
    this.periodWeights = { ...DEFAULT_PERIOD_WEIGHTS }
    saveJSON(PERIODS_KEY, this.periodWeights)
  }

  resourceFor(minMarketCap: number) {
    let resource = this.byMinCap.get(minMarketCap)
    if (!resource) {
      resource = new Resource<IndustryMomentumData>()
      this.byMinCap.set(minMarketCap, resource)
    }
    return resource
  }

  load(minMarketCap: number, { refresh = false } = {}) {
    const resource = this.resourceFor(minMarketCap)
    if (!refresh && (resource.data || resource.isLoading)) return resource.pending
    return resource.load(async (signal) => {
      const response = await this.service.getIndustryMomentum(minMarketCap, { refresh, signal })
      return {
        generatedAt: response.generatedAt,
        minStocks: response.minStocks,
        eligibleStocks: response.eligibleStocks,
        excludedIndustries: response.excludedIndustries,
        minMarketCap: response.minMarketCap,
        industries: response.industries.map((dto) => new IndustryMomentumModel(dto)),
      }
    })
  }

  scoreOf(model: IndustryMomentumModel) {
    return model.score(this.normalizedBlend, this.normalizedPeriods)
  }
}
