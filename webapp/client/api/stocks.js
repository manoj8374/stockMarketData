import { getPool, buildStocksQuery, parseMonths } from "./_db.js";

// Per-instance cache only (serverless instances don't share memory) -- just
// smooths out bursts of requests hitting the same warm instance. Keyed by
// the requested month-set so different selections don't collide.
const cacheByMonths = new Map();
const CACHE_TTL_MS = 2 * 60 * 1000;

export default async (req, res) => {
  try {
    const months = parseMonths(req.query.months);
    const cacheKey = months.join(",");
    const now = Date.now();
    const bypass = req.query.refresh === "1";
    let entry = cacheByMonths.get(cacheKey);

    if (bypass || !entry || now - entry.fetchedAt >= CACHE_TTL_MS) {
      const [rows] = await getPool().query(buildStocksQuery(months));
      entry = { data: rows, fetchedAt: now };
      cacheByMonths.set(cacheKey, entry);
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      count: entry.data.length,
      generatedAt: new Date(entry.fetchedAt).toISOString(),
      months,
      stocks: entry.data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
