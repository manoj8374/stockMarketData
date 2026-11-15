import { makeAutoObservable } from 'mobx'

export interface TickDto {
  symbol: string
  ltp: number
  prevClose: number | null
  change: number | null
  changePct: number | null
  volume: number | null
  oi: number | null
  ts: number
}

// Latest price for one symbol. Observable, so only the components reading
// this symbol re-render when it changes.
export class TickModel {
  readonly symbol: string
  ltp: number
  prevClose: number | null
  change: number | null
  changePct: number | null
  volume: number | null
  oi: number | null
  ts: number
  direction: 'up' | 'down' | null = null
  version = 0

  constructor(dto: TickDto) {
    this.symbol = dto.symbol
    this.ltp = dto.ltp
    this.prevClose = dto.prevClose
    this.change = dto.change
    this.changePct = dto.changePct
    this.volume = dto.volume
    this.oi = dto.oi
    this.ts = dto.ts
    makeAutoObservable(this, { symbol: false }, { autoBind: true })
  }

  update(dto: TickDto) {
    if (dto.ltp !== this.ltp) {
      this.direction = dto.ltp > this.ltp ? 'up' : 'down'
      this.version++
    }
    this.ltp = dto.ltp
    this.prevClose = dto.prevClose
    this.change = dto.change
    this.changePct = dto.changePct
    this.volume = dto.volume
    this.oi = dto.oi
    this.ts = dto.ts
  }
}
