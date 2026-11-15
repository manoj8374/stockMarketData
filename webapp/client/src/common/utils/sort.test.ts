import { compareBy, nextSorts, type SortSpec } from './sort'

describe('nextSorts', () => {
  const byScore: SortSpec[] = [{ key: 'score', direction: 'desc' }]

  it('replaces the sort on a plain click', () => {
    expect(nextSorts(byScore, 'name', false, 'asc')).toEqual([{ key: 'name', direction: 'asc' }])
  })

  it('flips direction when the only sort column is clicked again', () => {
    expect(nextSorts(byScore, 'score', false, 'desc')).toEqual([{ key: 'score', direction: 'asc' }])
  })

  it('adds a tie-breaker on shift-click, flips it, then removes it', () => {
    const added = nextSorts(byScore, 'name', true, 'asc')
    expect(added).toEqual([...byScore, { key: 'name', direction: 'asc' }])
    const flipped = nextSorts(added, 'name', true, 'asc')
    expect(flipped[1]).toEqual({ key: 'name', direction: 'desc' })
    expect(nextSorts(flipped, 'name', true, 'asc')).toEqual(byScore)
  })
})

describe('compareBy', () => {
  type Row = { sector: string; score: number | null }
  const rows: Row[] = [
    { sector: 'B', score: 1 },
    { sector: 'A', score: null },
    { sector: 'A', score: 5 },
    { sector: 'B', score: 9 },
  ]
  const get = (row: Row, key: string) => row[key as keyof Row]
  const isText = (key: string) => key === 'sector'

  it('sorts by several columns in order', () => {
    const sorted = [...rows].sort(
      compareBy<Row>(
        [
          { key: 'sector', direction: 'asc' },
          { key: 'score', direction: 'desc' },
        ],
        get,
        isText
      )
    )
    expect(sorted).toEqual([rows[2], rows[1], rows[3], rows[0]])
  })

  it('keeps missing values last in both directions', () => {
    for (const direction of ['asc', 'desc'] as const) {
      const sorted = [...rows].sort(compareBy<Row>([{ key: 'score', direction }], get, isText))
      expect(sorted[sorted.length - 1].score).toBeNull()
    }
  })
})
