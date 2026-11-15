import { toNum } from '../../../common/utils/format'

export interface GroupStatsDto {
  count: number
  industries?: number
  median_1m: number | null
  breadth_1m: number | null
  positive_1m: number | null
  with_return_1m: number
}

export interface SectorDto extends GroupStatsDto {
  sector: string
}

export interface IndustrySummaryDto extends GroupStatsDto {
  industry: string
}

// A sector or an industry with its stock count and one-month stats.
export class GroupSummaryModel {
  readonly name: string
  readonly count: number
  readonly industries: number | null
  readonly median1m: number | null
  readonly breadth1m: number | null
  readonly positive1m: number | null
  readonly withReturn1m: number

  constructor(name: string, dto: GroupStatsDto) {
    this.name = name
    this.count = Number(dto.count) || 0
    this.industries = toNum(dto.industries ?? null)
    this.median1m = toNum(dto.median_1m)
    this.breadth1m = toNum(dto.breadth_1m)
    this.positive1m = toNum(dto.positive_1m)
    this.withReturn1m = Number(dto.with_return_1m) || 0
  }

  get hasMomentumStats() {
    return this.count >= 3
  }

  shareOf(total: number) {
    return total > 0 ? this.count / total : 0
  }
}
