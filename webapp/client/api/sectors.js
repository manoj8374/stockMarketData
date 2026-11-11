import { getPool, buildSectorsQuery, buildOneMonthReturnsQuery, parseMinMarketCap } from "./_db.js";
import { getSession } from "./_auth.js";
import { summarizeOneMonth, EMPTY_GROUP_STATS } from "./_industryStats.js";

// Counts come from a tiny, index-backed GROUP BY. The 1M median / breadth per
// sector come from one flat snapshot read (no candle joins) aggregated in JS.
// Both barely change between requests, so a short in-memory cache (keyed by
// the market-cap floor) is enough.
const cacheByMinCap = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

export default async (req, res) => {
  if (!getSession(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const minMarketCap = parseMinMarketCap(req.query.minMarketCap);
    const cacheKey = String(minMarketCap ?? "");
    const now = Date.now();
    let entry = cacheByMinCap.get(cacheKey);
    if (!entry || now - entry.fetchedAt >= CACHE_TTL_MS) {
      const pool = getPool();
      const counts = buildSectorsQuery(minMarketCap);
      const returns = buildOneMonthReturnsQuery(minMarketCap);
      const [[rows], [returnRows]] = await Promise.all([
        pool.query(counts.sql, counts.params),
        pool.query(returns.sql, returns.params),
      ]);
      const stats = summarizeOneMonth(returnRows, "sector");
      const data = rows.map((r) => ({ ...r, ...(stats.get(r.sector) || EMPTY_GROUP_STATS) }));
      entry = { data, fetchedAt: now };
      cacheByMinCap.set(cacheKey, entry);
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ minMarketCap, sectors: entry.data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
