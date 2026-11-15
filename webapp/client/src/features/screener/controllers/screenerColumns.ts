import { gapDescription, MONTH_OPTIONS } from '../models/weights'

export type ColumnType = 'stock' | 'text' | 'marketcap' | 'price' | 'pct' | 'ath' | 'momentum' | 'back'
export type ColumnGroup = '' | 'prices' | 'returns' | 'ath' | 'mom'

export interface Column {
  key: string
  label: string
  type: ColumnType
  group: ColumnGroup
  title?: string
  pivot?: 1 | 3
}

export const GROUP_LABELS: Record<Exclude<ColumnGroup, ''>, string> = {
  prices: 'Price history',
  returns: 'Returns',
  ath: 'All-time high',
  mom: 'Momentum',
}

export const COLUMN_GROUPS: Array<[ColumnGroup, string]> = [
  ['', 'Basics'],
  ['prices', 'Price history'],
  ['returns', 'Returns'],
  ['ath', 'All-time high'],
  ['mom', 'Momentum'],
]

export const TEXT_COLUMNS = new Set(['tradingsymbol', 'sector', 'industry'])
export const DEFAULT_HIDDEN_COLUMNS = MONTH_OPTIONS.map((m) => `price_${m}m`)

export function buildColumns(months: readonly number[]): Column[] {
  return [
    { key: 'tradingsymbol', label: 'Stock', type: 'stock', group: '' },
    { key: 'sector', label: 'Sector', type: 'text', group: '' },
    { key: 'industry', label: 'Industry', type: 'text', group: '' },
    { key: 'market_cap_cr', label: 'Mkt cap', type: 'marketcap', group: '' },
    { key: 'current_price', label: 'Price', type: 'price', group: '' },
    ...months.map<Column>((m) => ({
      key: `price_${m}m`,
      label: `${m}M ago`,
      type: 'price',
      group: 'prices',
      title: `Closing price ${m} month${m > 1 ? 's' : ''} ago`,
    })),
    ...months.map<Column>((m, i) => ({
      key: `return_${m}m`,
      label: `${m}M`,
      type: 'pct',
      group: 'returns',
      title: `Return from ${gapDescription(months, i)}`,
    })),
    { key: 'all_time_high', label: 'ATH', type: 'price', group: 'ath', title: 'All-time high close' },
    { key: 'diff_from_ath', label: 'From ATH', type: 'ath', group: 'ath', title: 'Distance below the all-time high' },
    { key: 'momentum_score', label: 'Score', type: 'momentum', group: 'mom', title: 'Weighted blend of the return periods' },
    {
      key: 'momentum_1m_back',
      label: '1M back',
      type: 'back',
      pivot: 1,
      group: 'mom',
      title: 'The 1M / 3M / 6M score as it stood 1 month ago. Click a value for the breakdown.',
    },
    {
      key: 'momentum_3m_back',
      label: '3M back',
      type: 'back',
      pivot: 3,
      group: 'mom',
      title: 'The 1M / 3M / 6M score as it stood 3 months ago. Click a value for the breakdown.',
    },
  ]
}
