import { getPool, buildIndustriesQuery, parseMinMarketCap } from "./_db.js";
import { getSession } from "./_auth.js";

// Keyed by sector + market-cap floor -- same rationale as sectors.js (cheap indexed GROUP BY,
// short cache, no candle joins).
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
      const { sql, params } = buildIndustriesQuery(sector, minMarketCap);
      const [rows] = await getPool().query(sql, params);
      entry = { data: rows, fetchedAt: now };
      cacheBySector.set(cacheKey, entry);
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ sector, minMarketCap, industries: entry.data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
