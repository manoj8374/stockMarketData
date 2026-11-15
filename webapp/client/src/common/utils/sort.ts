export type SortDirection = 'asc' | 'desc'

export interface SortSpec {
  key: string
  direction: SortDirection
}

// Plain click sorts by one column (toggling direction on repeat clicks).
// Shift-click adds the column as a tie-breaker, flips it if already present,
// and removes it on the third click.
export function nextSorts(
  current: readonly SortSpec[],
  key: string,
  additive: boolean,
  firstDirection: SortDirection
): SortSpec[] {
  const existing = current.find((s) => s.key === key)
  if (!additive) {
    if (existing && current.length === 1) return [{ key, direction: existing.direction === 'asc' ? 'desc' : 'asc' }]
    return [{ key, direction: firstDirection }]
  }
  if (!existing) return [...current, { key, direction: firstDirection }]
  if (existing.direction === firstDirection) {
    return current.map((s) => (s.key === key ? { key, direction: firstDirection === 'asc' ? 'desc' : 'asc' } : s))
  }
  const rest = current.filter((s) => s.key !== key)
  return rest.length ? rest : [{ key, direction: firstDirection }]
}

export type ValueGetter<T> = (row: T, key: string) => unknown

// Missing values always sort last, whatever the direction.
export function compareBy<T>(sorts: readonly SortSpec[], getValue: ValueGetter<T>, isText: (key: string) => boolean) {
  return (a: T, b: T) => {
    for (const { key, direction } of sorts) {
      const av = getValue(a, key)
      const bv = getValue(b, key)
      const aMissing = av === null || av === undefined
      const bMissing = bv === null || bv === undefined
      if (aMissing && bMissing) continue
      if (aMissing) return 1
      if (bMissing) return -1
      const cmp = isText(key) ? String(av).localeCompare(String(bv)) : Number(av) - Number(bv)
      if (cmp !== 0) return direction === 'asc' ? cmp : -cmp
    }
    return 0
  }
}
