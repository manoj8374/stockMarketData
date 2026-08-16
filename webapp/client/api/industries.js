import { getPool, buildIndustriesQuery } from "./_db.js";
import { getSession } from "./_auth.js";

// Keyed by sector -- same rationale as sectors.js (cheap indexed GROUP BY,
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
    const now = Date.now();
    let entry = cacheBySector.get(sector);
    if (!entry || now - entry.fetchedAt >= CACHE_TTL_MS) {
      const [rows] = await getPool().query(buildIndustriesQuery(), [sector]);
      entry = { data: rows, fetchedAt: now };
      cacheBySector.set(sector, entry);
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ sector, industries: entry.data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
