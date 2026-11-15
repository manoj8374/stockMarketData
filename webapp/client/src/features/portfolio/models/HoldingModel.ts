export interface HoldingDto {
  tradingsymbol: string
  quantity: number
  average_price: number
  last_price: number
  pnl: number
  day_change?: number
  day_change_percentage?: number
  ema: number | null
  ema_signal: 'above' | 'below' | null
}

export class HoldingModel {
  readonly symbol: string
  readonly quantity: number
  readonly averagePrice: number
  readonly lastPrice: number
  readonly pnl: number
  readonly dayChangePct: number | null
  readonly ema: number | null
  readonly emaSignal: 'above' | 'below' | null

  constructor(dto: HoldingDto) {
    this.symbol = dto.tradingsymbol
    this.quantity = Number(dto.quantity) || 0
    this.averagePrice = Number(dto.average_price) || 0
    this.lastPrice = Number(dto.last_price) || 0
    this.pnl = Number(dto.pnl) || 0
    this.dayChangePct = dto.day_change_percentage ?? null
    this.ema = dto.ema
    this.emaSignal = dto.ema_signal
  }

  get value() {
    return this.lastPrice * this.quantity
  }

  get invested() {
    return this.averagePrice * this.quantity
  }

  get returnPct() {
    return this.invested > 0 ? (this.pnl / this.invested) * 100 : null
  }

  // How far the last price sits above (+) or below (-) its EMA, in percent.
  get gapToEma() {
    return this.ema !== null && this.ema > 0 ? (this.lastPrice / this.ema - 1) * 100 : null
  }
}

export interface PositionDto {
  tradingsymbol: string
  product: string
  quantity: number
  average_price: number
  last_price: number
  pnl: number
  m2m: number
}

export class PositionModel {
  readonly symbol: string
  readonly product: string
  readonly quantity: number
  readonly averagePrice: number
  readonly lastPrice: number
  readonly pnl: number
  readonly m2m: number

  constructor(dto: PositionDto) {
    this.symbol = dto.tradingsymbol
    this.product = dto.product
    this.quantity = Number(dto.quantity) || 0
    this.averagePrice = Number(dto.average_price) || 0
    this.lastPrice = Number(dto.last_price) || 0
    this.pnl = Number(dto.pnl) || 0
    this.m2m = Number(dto.m2m) || 0
  }

  get isShort() {
    return this.quantity < 0
  }

  get key() {
    return `${this.symbol}-${this.product}`
  }
}
