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

const STOCKS_QUERY = `
  SELECT
    id, tradingsymbol, name,
    current_price, current_ts,
    price_1m, date_1m,
    price_3m, date_3m,
    price_6m, date_6m,
    CASE WHEN price_1m > 0 THEN ROUND((current_price - price_1m) / price_1m * 100, 2) END AS return_1m,
    CASE WHEN price_3m > 0 THEN ROUND((current_price - price_3m) / price_3m * 100, 2) END AS return_3m,
    CASE WHEN price_6m > 0 THEN ROUND((current_price - price_6m) / price_6m * 100, 2) END AS return_6m
  FROM (
    SELECT
      i.id, i.tradingsymbol, i.name,
      (SELECT c.close FROM candles c WHERE c.instrument_id = i.id ORDER BY c.ts DESC LIMIT 1) AS current_price,
      (SELECT c.ts    FROM candles c WHERE c.instrument_id = i.id ORDER BY c.ts DESC LIMIT 1) AS current_ts,
      (SELECT c.close FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) ORDER BY c.ts DESC LIMIT 1) AS price_1m,
      (SELECT c.ts    FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) ORDER BY c.ts DESC LIMIT 1) AS date_1m,
      (SELECT c.close FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL 3 MONTH) ORDER BY c.ts DESC LIMIT 1) AS price_3m,
      (SELECT c.ts    FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL 3 MONTH) ORDER BY c.ts DESC LIMIT 1) AS date_3m,
      (SELECT c.close FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) ORDER BY c.ts DESC LIMIT 1) AS price_6m,
      (SELECT c.ts    FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) ORDER BY c.ts DESC LIMIT 1) AS date_6m
    FROM instruments i
    WHERE ${EQUITY_FILTER}
      AND EXISTS (SELECT 1 FROM candles c2 WHERE c2.instrument_id = i.id)
  ) x
  ORDER BY tradingsymbol
`;

let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getStocks() {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }
  const [rows] = await pool.query(STOCKS_QUERY);
  cache = { data: rows, fetchedAt: now };
  return rows;
}

app.get("/api/stocks", async (req, res) => {
  try {
    const rows = await getStocks();
    res.json({ count: rows.length, generatedAt: new Date(cache.fetchedAt).toISOString(), stocks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/refresh", async (req, res) => {
  cache = { data: null, fetchedAt: 0 };
  try {
    const rows = await getStocks();
    res.json({ count: rows.length, generatedAt: new Date(cache.fetchedAt).toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
