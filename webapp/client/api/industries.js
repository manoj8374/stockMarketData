import { getPool, buildIndustriesQuery, buildOneMonthReturnsQuery, parseMinMarketCap } from "./_db.js";
import { getSession } from "./_auth.js";
import { summarizeOneMonth, EMPTY_GROUP_STATS } from "./_industryStats.js";

// Keyed by sector + market-cap floor -- same rationale as sectors.js (cheap indexed GROUP BY
// plus one flat snapshot read for the 1M stats, short cache, no candle joins).
const cacheBySector = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

export default async (req, res) => {
  if (!getSession(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const sector = req.query.sector ? String(req.query.sector).trim() : "";
  if (!sector) {
    res.status(400).json({ error: "sector query param is required" });
    return;
  }
  try {
    const minMarketCap = parseMinMarketCap(req.query.minMarketCap);
    const cacheKey = `${sector}|${minMarketCap ?? ""}`;
    const now = Date.now();
    let entry = cacheBySector.get(cacheKey);
    if (!entry || now - entry.fetchedAt >= CACHE_TTL_MS) {
      const pool = getPool();
      const counts = buildIndustriesQuery(sector, minMarketCap);
      const returns = buildOneMonthReturnsQuery(minMarketCap, sector);
      const [[rows], [returnRows]] = await Promise.all([
        pool.query(counts.sql, counts.params),
        pool.query(returns.sql, returns.params),
      ]);
      const stats = summarizeOneMonth(returnRows, "industry");
      const data = rows.map((r) => ({ ...r, ...(stats.get(r.industry) || EMPTY_GROUP_STATS) }));
      entry = { data, fetchedAt: now };
      // Sector names come from the URL, so keep the cache bounded.
      if (cacheBySector.size >= 100) cacheBySector.clear();
      cacheBySector.set(cacheKey, entry);
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ sector, minMarketCap, industries: entry.data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
