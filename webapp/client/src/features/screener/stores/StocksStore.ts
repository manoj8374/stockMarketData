import { makeAutoObservable } from 'mobx'
import { Resource } from '../../../core/network/Resource'
import { StockModel } from '../models/StockModel'
import type { StocksQuery, StocksService } from '../services/StocksService'

export interface StockList {
  stocks: StockModel[]
  generatedAt: string
}

const MAX_CACHED_LISTS = 8

// Keeps one Resource per query (months + market cap + optional sector/industry),
// so moving between the screener and a drill-down shows cached data instantly.
export class StocksStore {
  private readonly lists = new Map<string, Resource<StockList>>()
  private readonly service: StocksService

  constructor(service: StocksService) {
    this.service = service
    makeAutoObservable<StocksStore, 'lists' | 'service'>(this, { lists: false, service: false }, { autoBind: true })
  }

  static keyFor(query: StocksQuery) {
    return [query.months.join(','), query.minMarketCap, query.sector ?? '', query.industry ?? ''].join('|')
  }

  listFor(query: StocksQuery) {
    const key = StocksStore.keyFor(query)
    let list = this.lists.get(key)
    if (!list) {
      list = new Resource<StockList>()
      this.lists.set(key, list)
      if (this.lists.size > MAX_CACHED_LISTS) this.lists.delete(this.lists.keys().next().value as string)
    }
    return list
  }

  load(query: StocksQuery, { refresh = false } = {}) {
    const list = this.listFor(query)
    return list.load(async (signal) => {
      const response = await this.service.getStocks(query, { refresh, signal })
      return { stocks: response.stocks.map((dto) => new StockModel(dto)), generatedAt: response.generatedAt }
    })
  }
}
