const path = require("path");
const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// Same "genuine equity" filter used by the Python backfill scripts: excludes
// bonds/gilts/sovereign-gold-bonds/specialized-investment-funds/ETFs/AMC-NAV
// reference instruments that share the NSE 'EQ' instrument_type in Kite's data.
const EQUITY_FILTER = `
  i.segment = 'NSE'
  AND NOT (i.tradingsymbol REGEXP '^[0-9]+[A-Z]*[0-9]*-')
  AND i.tradingsymbol NOT LIKE '%-SG'
  AND i.tradingsymbol NOT LIKE '%-GB'
  AND i.tradingsymbol NOT LIKE '%-GS'
  AND i.tradingsymbol NOT LIKE '%-SF'
  AND i.tradingsymbol NOT LIKE '%INAV%'
  AND i.tradingsymbol NOT REGEXP '[0-9]{2}[A-Z]{0,3}-(N|Y|Z)[0-9A-Z]{1,2}$'
  AND i.name NOT LIKE '%ETF%'
  AND i.name NOT LIKE '%FUND%'
  AND i.name NOT LIKE '% - %'
`;

const DEFAULT_MONTHS = [1, 3, 6];

function parseMonths(raw) {
  if (!raw) return [...DEFAULT_MONTHS];
  const months = String(raw)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  const unique = [...new Set(months)].sort((a, b) => a - b);
  return unique.length ? unique : [...DEFAULT_MONTHS];
}

// Fixed month-offsets needed for the "N-back momentum" feature -- see
// _db.js for the full rationale. All covered by instrument_price_snapshot's
// price_1m..price_12m columns already.
const BACKREF_OFFSETS = [1, 2, 3, 4, 6, 7, 9];

// Reads from instrument_price_snapshot (rebuilt once daily by
// build_price_snapshot.py) -- see _db.js for the full rationale (this used
// to run ~24 correlated subqueries against `candles` per row, 40+ seconds
// for the full stocks list).
function buildStocksQuery(months, filters = {}) {
  const sortedMonths = [...months].sort((a, b) => a - b);
  const returnCols = sortedMonths
    .map((m, idx) => {
      const baseline = idx === 0 ? "s.current_price" : `s.price_${sortedMonths[idx - 1]}m`;
      return `CASE WHEN s.price_${m}m > 0 THEN ROUND((${baseline} - s.price_${m}m) / s.price_${m}m * 100, 2) END AS return_${m}m`;
    })
    .join(",\n    ");

  const backrefReturn = (pivot, ago, baseline) =>
    `CASE WHEN s.price_${ago}m > 0 THEN ROUND((s.price_${baseline}m - s.price_${ago}m) / s.price_${ago}m * 100, 2) END AS return_${pivot}back_${ago}m`;
  const backrefReturnCols = [
    backrefReturn(1, 2, 1), backrefReturn(1, 4, 2), backrefReturn(1, 7, 4),
    backrefReturn(3, 4, 3), backrefReturn(3, 6, 4), backrefReturn(3, 9, 6),
  ].join(",\n    ");

  const params = [];
  let extraFilter = "";
  if (filters.sector) {
    extraFilter += " AND i.sector = ?";
    params.push(filters.sector);
  }
  if (filters.industry) {
    extraFilter += " AND i.industry = ?";
    params.push(filters.industry);
  }

  const sql = `
  SELECT
    i.id, i.tradingsymbol, i.name, i.sector, i.industry,
    s.current_price, s.current_ts,
    s.all_time_high, s.ath_date,
    i.market_cap_cr, i.market_cap_updated_at,
    ${months.map((m) => `s.price_${m}m AS price_${m}m, s.date_${m}m AS date_${m}m`).join(", ")},
    ${BACKREF_OFFSETS.map((m) => `s.price_${m}m AS bref_${m}m, s.date_${m}m AS brefdate_${m}m`).join(", ")},
    ${returnCols},
    ${backrefReturnCols},
    CASE WHEN s.all_time_high > 0 THEN ROUND((s.current_price - s.all_time_high) / s.all_time_high * 100, 2) END AS diff_from_ath
  FROM instruments i
  JOIN instrument_price_snapshot s ON s.instrument_id = i.id
  WHERE ${EQUITY_FILTER}
    ${extraFilter}
  ORDER BY i.tradingsymbol
`;
  return { sql, params };
}

function buildSectorsQuery() {
  return `
    SELECT sector, COUNT(*) AS count
    FROM instruments i
    WHERE ${EQUITY_FILTER} AND sector IS NOT NULL
    GROUP BY sector
    ORDER BY sector
  `;
}

function buildIndustriesQuery() {
  return `
    SELECT industry, COUNT(*) AS count
    FROM instruments i
    WHERE ${EQUITY_FILTER} AND sector = ? AND industry IS NOT NULL
    GROUP BY industry
    ORDER BY industry
  `;
}

const cacheByMonths = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getStocks(months, filters = {}) {
  const cacheKey = `${months.join(",")}|${filters.sector || ""}|${filters.industry || ""}`;
  const now = Date.now();
  const entry = cacheByMonths.get(cacheKey);
  if (entry && now - entry.fetchedAt < CACHE_TTL_MS) {
    return entry;
  }
  const { sql, params } = buildStocksQuery(months, filters);
  const [rows] = await pool.query(sql, params);
  const fresh = { data: rows, fetchedAt: now };
  cacheByMonths.set(cacheKey, fresh);
  return fresh;
}

app.get("/api/stocks", async (req, res) => {
  try {
    const months = parseMonths(req.query.months);
    const sector = req.query.sector ? String(req.query.sector).trim() : null;
    const industry = req.query.industry ? String(req.query.industry).trim() : null;
    const entry = await getStocks(months, { sector, industry });
    res.json({ count: entry.data.length, generatedAt: new Date(entry.fetchedAt).toISOString(), months, stocks: entry.data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sectors", async (req, res) => {
  try {
    const [rows] = await pool.query(buildSectorsQuery());
    res.json({ sectors: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/industries", async (req, res) => {
  const sector = req.query.sector ? String(req.query.sector).trim() : "";
  if (!sector) {
    res.status(400).json({ error: "sector query param is required" });
    return;
  }
  try {
    const [rows] = await pool.query(buildIndustriesQuery(), [sector]);
    res.json({ sector, industries: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/refresh", async (req, res) => {
  try {
    const months = parseMonths(req.query.months);
    cacheByMonths.delete(months.join(","));
    const entry = await getStocks(months);
    res.json({ count: entry.data.length, generatedAt: new Date(entry.fetchedAt).toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
