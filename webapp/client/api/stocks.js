const { getPool, STOCKS_QUERY } = require("./_db");

// Per-instance cache only (serverless instances don't share memory) -- just
// smooths out bursts of requests hitting the same warm instance.
let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 2 * 60 * 1000;

module.exports = async (req, res) => {
  try {
    const now = Date.now();
    const bypass = req.query.refresh === "1";
    if (bypass || !cache.data || now - cache.fetchedAt >= CACHE_TTL_MS) {
      const [rows] = await getPool().query(STOCKS_QUERY);
      cache = { data: rows, fetchedAt: now };
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      count: cache.data.length,
      generatedAt: new Date(cache.fetchedAt).toISOString(),
      stocks: cache.data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
