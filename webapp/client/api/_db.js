const mysql = require("mysql2/promise");

// Module-scope pool: reused across warm invocations of the same serverless
// instance. A fresh pool is created on cold start only.
let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 3,
      queueLimit: 0,
    });
  }
  return pool;
}

// Same "genuine equity" filter used by the Python backfill scripts.
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

module.exports = { getPool, STOCKS_QUERY };
