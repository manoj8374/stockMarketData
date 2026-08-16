import { getPool, buildSectorsQuery } from "./_db.js";
import { getSession } from "./_auth.js";

// Tiny, index-backed GROUP BY -- no candle joins, so this stays fast
// regardless of how big the stocks table gets. Result barely changes
// between requests, so a short in-memory cache is enough.
let cache = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

export default async (req, res) => {
  if (!getSession(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const now = Date.now();
    if (!cache || now - cache.fetchedAt >= CACHE_TTL_MS) {
      const [rows] = await getPool().query(buildSectorsQuery());
      cache = { data: rows, fetchedAt: now };
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ sectors: cache.data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
