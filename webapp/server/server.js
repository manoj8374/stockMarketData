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

// Fixed month-offsets needed for the "N-back momentum" feature, independent
// of whichever months are checked in the frontend's Time Periods selector:
//   1M-back pivot (offset 1) needs its own 1/3/6-ago prices -> offsets 2, 4, 7
//   3M-back pivot (offset 3) needs its own 1/3/6-ago prices -> offsets 4, 6, 9
const BACKREF_OFFSETS = [1, 2, 3, 4, 6, 7, 9];

function buildStocksQuery(months) {
  const innerCols = months
    .map(
      (m) => `
      (SELECT c.close FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL ${m} MONTH) ORDER BY c.ts DESC LIMIT 1) AS price_${m}m,
      (SELECT c.ts    FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL ${m} MONTH) ORDER BY c.ts DESC LIMIT 1) AS date_${m}m`
    )
    .join(",");

  const outerPriceCols = months.map((m) => `price_${m}m, date_${m}m`).join(",\n    ");
  const outerReturnCols = months
    .map(
      (m) =>
        `CASE WHEN price_${m}m > 0 THEN ROUND((current_price - price_${m}m) / price_${m}m * 100, 2) END AS return_${m}m`
    )
    .join(",\n    ");

  const backrefInnerCols = BACKREF_OFFSETS
    .map(
      (m) => `
      (SELECT c.close FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL ${m} MONTH) ORDER BY c.ts DESC LIMIT 1) AS bref_${m}m,
      (SELECT c.ts    FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL ${m} MONTH) ORDER BY c.ts DESC LIMIT 1) AS brefdate_${m}m`
    )
    .join(",");

  const backrefOuterCols = BACKREF_OFFSETS.map((m) => `bref_${m}m, brefdate_${m}m`).join(",\n    ");

  const backrefReturn = (pivot, ago) =>
    `CASE WHEN bref_${ago}m > 0 THEN ROUND((bref_${pivot}m - bref_${ago}m) / bref_${ago}m * 100, 2) END AS return_${pivot}back_${ago}m`;
  const backrefReturnCols = [
    backrefReturn(1, 2), backrefReturn(1, 4), backrefReturn(1, 7),
    backrefReturn(3, 4), backrefReturn(3, 6), backrefReturn(3, 9),
  ].join(",\n    ");

  return `
  SELECT
    id, tradingsymbol, name,
    current_price, current_ts,
    ${outerPriceCols},
    all_time_high, ath_date,
    market_cap_cr, market_cap_updated_at,
    ${outerReturnCols},
    ${backrefOuterCols},
    ${backrefReturnCols},
    CASE WHEN all_time_high > 0 THEN ROUND((current_price - all_time_high) / all_time_high * 100, 2) END AS diff_from_ath
  FROM (
    SELECT
      i.id, i.tradingsymbol, i.name, i.market_cap_cr, i.market_cap_updated_at,
      (SELECT c.close FROM candles c WHERE c.instrument_id = i.id ORDER BY c.ts DESC LIMIT 1) AS current_price,
      (SELECT c.ts    FROM candles c WHERE c.instrument_id = i.id ORDER BY c.ts DESC LIMIT 1) AS current_ts,${innerCols},${backrefInnerCols}
      ,(SELECT MAX(c.high) FROM candles c WHERE c.instrument_id = i.id) AS all_time_high,
      (SELECT c.ts FROM candles c WHERE c.instrument_id = i.id ORDER BY c.high DESC, c.ts DESC LIMIT 1) AS ath_date
    FROM instruments i
    WHERE ${EQUITY_FILTER}
      AND EXISTS (SELECT 1 FROM candles c2 WHERE c2.instrument_id = i.id)
  ) x
  ORDER BY tradingsymbol
`;
}

const cacheByMonths = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getStocks(months) {
  const cacheKey = months.join(",");
  const now = Date.now();
  const entry = cacheByMonths.get(cacheKey);
  if (entry && now - entry.fetchedAt < CACHE_TTL_MS) {
    return entry;
  }
  const [rows] = await pool.query(buildStocksQuery(months));
  const fresh = { data: rows, fetchedAt: now };
  cacheByMonths.set(cacheKey, fresh);
  return fresh;
}

app.get("/api/stocks", async (req, res) => {
  try {
    const months = parseMonths(req.query.months);
    const entry = await getStocks(months);
    res.json({ count: entry.data.length, generatedAt: new Date(entry.fetchedAt).toISOString(), months, stocks: entry.data });
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
