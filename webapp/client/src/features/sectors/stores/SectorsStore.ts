import { makeAutoObservable } from 'mobx'
import { Resource } from '../../../core/network/Resource'
import { GroupSummaryModel } from '../models/GroupSummaryModel'
import type { SectorsService } from '../services/SectorsService'

export class SectorsStore {
  private readonly sectors = new Map<number, Resource<GroupSummaryModel[]>>()
  private readonly industries = new Map<string, Resource<GroupSummaryModel[]>>()
  private readonly service: SectorsService

  constructor(service: SectorsService) {
    this.service = service
    makeAutoObservable<SectorsStore, 'sectors' | 'industries' | 'service'>(
      this,
      { sectors: false, industries: false, service: false },
      { autoBind: true }
    )
  }

  sectorsFor(minMarketCap: number) {
    return getOrCreate(this.sectors, minMarketCap)
  }

  industriesFor(sector: string, minMarketCap: number) {
    return getOrCreate(this.industries, `${sector}|${minMarketCap}`)
  }

  loadSectors(minMarketCap: number, { refresh = false } = {}) {
    const resource = this.sectorsFor(minMarketCap)
    if (!refresh && (resource.data || resource.isLoading)) return resource.pending
    return resource.load(async (signal) => {
      const { sectors } = await this.service.getSectors(minMarketCap, signal)
      return sectors.map((dto) => new GroupSummaryModel(dto.sector, dto))
    })
  }

  loadIndustries(sector: string, minMarketCap: number, { refresh = false } = {}) {
    const resource = this.industriesFor(sector, minMarketCap)
    if (!refresh && (resource.data || resource.isLoading)) return resource.pending
    return resource.load(async (signal) => {
      const { industries } = await this.service.getIndustries(sector, minMarketCap, signal)
      return industries.map((dto) => new GroupSummaryModel(dto.industry, dto))
    })
  }
}

function getOrCreate<K, T>(map: Map<K, Resource<T>>, key: K) {
  let resource = map.get(key)
  if (!resource) {
    resource = new Resource<T>()
    map.set(key, resource)
  }
  return resource
}
