// Pure aggregation for the Industry Momentum / Breadth page -- no DB access,
// so it can be exercised directly with plain arrays.

export const INDUSTRY_PERIODS = [1, 3, 6];
export const DEFAULT_MIN_MARKET_CAP_CR = 2000;

// An industry (or a single period within it) needs at least this many stocks
// with a usable return before mean/median/P75/breadth are reported -- below
// that, a "median" of one or two stocks is just those stocks' own returns.
export const MIN_STOCKS = 3;

function round2(v) {
  return v === null ? null : Math.round(v * 100) / 100;
}

// Linear interpolation between closest ranks -- the same definition as
// Excel's PERCENTILE.INC and numpy's default, so values can be cross-checked
// in a spreadsheet. `sortedAsc` must be non-empty and sorted ascending.
export function quantile(sortedAsc, q) {
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

// Stats for one industry's returns in one period. Stocks with no return for
// the period (recently listed, or a stale/missing N-months-ago price) are
// excluded from both the stats and the breadth denominator rather than being
// counted as "not positive".
export function periodStats(returns) {
  const values = returns.filter((v) => v !== null && v !== undefined).map(Number);
  const count = values.length;
  if (count < MIN_STOCKS) {
    return { count, mean: null, median: null, p75: null, positive: null, breadth: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const positive = values.filter((v) => v > 0).length;
  return {
    count,
    mean: round2(values.reduce((a, b) => a + b, 0) / count),
    median: round2(quantile(sorted, 0.5)),
    p75: round2(quantile(sorted, 0.75)),
    positive,
    breadth: round2((positive / count) * 100),
  };
}

// rows: [{ sector, industry, return_1m, return_3m, ... }] -- already limited
// to eligible stocks (market-cap cutoff applied in SQL). Grouped by
// (sector, industry) rather than industry alone so an industry name reused
// under two sectors could never be silently merged.
export function aggregateIndustries(rows, periods = INDUSTRY_PERIODS) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.sector}\u0000${r.industry}`;
    if (!groups.has(key)) groups.set(key, { sector: r.sector, industry: r.industry, rows: [] });
    groups.get(key).rows.push(r);
  }

  const industries = [];
  let excludedIndustries = 0;
  for (const g of groups.values()) {
    if (g.rows.length < MIN_STOCKS) {
      excludedIndustries++;
      continue;
    }
    const stats = {};
    for (const m of periods) {
      stats[m] = periodStats(g.rows.map((r) => r[`return_${m}m`]));
    }
    industries.push({ sector: g.sector, industry: g.industry, eligible: g.rows.length, periods: stats });
  }
  industries.sort((a, b) => a.industry.localeCompare(b.industry));
  return { industries, excludedIndustries };
}
