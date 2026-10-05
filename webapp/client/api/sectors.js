import { getPool, buildSectorsQuery, parseMinMarketCap } from "./_db.js";
import { getSession } from "./_auth.js";

// Tiny, index-backed GROUP BY -- no candle joins, so this stays fast
// regardless of how big the stocks table gets. Result barely changes
// between requests, so a short in-memory cache (keyed by the market-cap
// floor) is enough.
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
      const { sql, params } = buildSectorsQuery(minMarketCap);
      const [rows] = await getPool().query(sql, params);
      entry = { data: rows, fetchedAt: now };
      cacheByMinCap.set(cacheKey, entry);
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ minMarketCap, sectors: entry.data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
