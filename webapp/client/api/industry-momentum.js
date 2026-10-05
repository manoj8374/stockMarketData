import { getPool, buildIndustryMomentumQuery, parseMinMarketCap } from "./_db.js";
import { getSession } from "./_auth.js";
import {
  INDUSTRY_PERIODS,
  DEFAULT_MIN_MARKET_CAP_CR,
  MIN_STOCKS,
  aggregateIndustries,
} from "./_industryStats.js";

// Returns only the raw per-industry stats (mean/median/P75/breadth per
// period). The weighted Industry Momentum Score is computed client-side from
// these, the same way the stock screener computes its Momentum Score, so the
// user can tweak weights without a round-trip.
//
// Snapshot data only changes once a day, so a per-instance cache keyed by
// the market-cap floor is plenty.
const cacheByMinCap = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

export default async (req, res) => {
  if (!getSession(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    // No param -> the default Rs 2,000 Cr floor; minMarketCap=0 -> all
    // companies (the app-wide "hide small caps" toggle switched off).
    const minMarketCap = parseMinMarketCap(req.query.minMarketCap, DEFAULT_MIN_MARKET_CAP_CR);
    const cacheKey = String(minMarketCap ?? "");
    const now = Date.now();
    const bypass = req.query.refresh === "1";
    let entry = cacheByMinCap.get(cacheKey);

    if (bypass || !entry || now - entry.fetchedAt >= CACHE_TTL_MS) {
      const { sql, params } = buildIndustryMomentumQuery(INDUSTRY_PERIODS, minMarketCap);
      const [rows] = await getPool().query(sql, params);
      const { industries, excludedIndustries } = aggregateIndustries(rows, INDUSTRY_PERIODS);
      entry = { data: { eligibleStocks: rows.length, industries, excludedIndustries }, fetchedAt: now };
      // The cutoff is free-form user input, so keep the cache from growing
      // without bound if many different values get tried.
      if (cacheByMinCap.size >= 20) cacheByMinCap.clear();
      cacheByMinCap.set(cacheKey, entry);
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      generatedAt: new Date(entry.fetchedAt).toISOString(),
      minMarketCap,
      minStocks: MIN_STOCKS,
      periods: INDUSTRY_PERIODS,
      ...entry.data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
