import mysql from "mysql2/promise";

// Module-scope pool: reused across warm invocations of the same serverless
// instance. A fresh pool is created on cold start only.
let pool;

export function getPool() {
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
      decimalNumbers: true,
    });
  }
  return pool;
}

// app_settings is a small key/value store for things the web app needs to
// read/write at runtime (currently just the Kite access_token, refreshed via
// the in-app Kite login flow) without requiring a redeploy for a changed
// value to take effect, unlike a Vercel env var.
export async function getSetting(name) {
  const [rows] = await getPool().query("SELECT value FROM app_settings WHERE name = ?", [name]);
  return rows[0]?.value ?? null;
}

export async function setSetting(name, value) {
  await getPool().query(
    "INSERT INTO app_settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [name, value]
  );
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

export const DEFAULT_MONTHS = [1, 3, 6];

// Validates/dedupes/sorts a requested list of month offsets (1-12 only).
export function parseMonths(raw) {
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
// All of these are already columns on instrument_price_snapshot (which
// covers every offset 1-12), so no separate "bref_" columns are needed --
// they just read price_2m/price_4m/price_7m/etc. directly.
const BACKREF_OFFSETS = [1, 2, 3, 4, 6, 7, 9];

// Builds the stocks query for an arbitrary set of month offsets (1-12), and
// optionally restricted to a single sector and/or industry. Returns
// { sql, params } -- sector/industry are always passed as bound params
// (never string-interpolated) since, unlike `months`, they're free text.
//
// Reads from instrument_price_snapshot (rebuilt once daily by
// build_price_snapshot.py) instead of running correlated subqueries against
// `candles` per row -- that used to mean ~24 subqueries x ~3,000 rows on
// every request (40+ seconds). price_Nm/date_Nm here are already
// staleness-guarded at snapshot-build time, so this is now a single flat
// SELECT with a JOIN: no nested subqueries, since price_Nm is a plain table
// column and can be referenced directly by return_Nm in the same SELECT
// list (the nesting in earlier versions existed only to work around MySQL
// not allowing one alias to reference another alias in the same list).
// Each period's return is the *gap* since the next-smaller period, not the
// cumulative return since today -- e.g. with 1/3/6, 3M Returns is the move
// from the 3M-ago price to the 1M-ago price (not to today), and 6M Returns is
// the move from 6M-ago to 3M-ago. This avoids the same recent price action
// being counted in every larger bucket, so Momentum Score (a weighted sum of
// these) reflects genuinely distinct time segments instead of overlapping
// ones. The smallest month has no smaller period to gap against, so it stays
// "vs today". Shared by the stocks and industry-momentum queries so both
// always agree on what "3M return" means for a given stock.
function buildGapReturnCols(months) {
  const sortedMonths = [...months].sort((a, b) => a - b);
  return sortedMonths
    .map((m, idx) => {
      const baseline = idx === 0 ? "s.current_price" : `s.price_${sortedMonths[idx - 1]}m`;
      return `CASE WHEN s.price_${m}m > 0 THEN ROUND((${baseline} - s.price_${m}m) / s.price_${m}m * 100, 2) END AS return_${m}m`;
    })
    .join(",\n    ");
}

export function buildStocksQuery(months, filters = {}) {
  const returnCols = buildGapReturnCols(months);

  // return_XbackYm = the "Y-months-ago-from-pivot" return used by the
  // X-back momentum score. Same gap logic as the main Returns columns: each
  // bucket measures only the move since the *previous* (smaller) bucket, not
  // cumulatively back to the pivot -- so return_1back_7m (the "6M ago" row
  // under 1M-back Momentum) is the move from price_7m to price_4m (the 3M
  // mark), not all the way to the pivot at price_1m. The smallest bucket has
  // nothing smaller to gap against, so it still measures straight to the
  // pivot.
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

// Lightweight aggregate queries for the Sectors browse page -- deliberately
// avoid the heavy buildStocksQuery (candle subqueries per row) since this
// page only ever needs distinct sector/industry names and counts, backed by
// the idx_sector/idx_industry indexes.
export function buildSectorsQuery() {
  return `
    SELECT sector, COUNT(*) AS count
    FROM instruments i
    WHERE ${EQUITY_FILTER} AND sector IS NOT NULL
    GROUP BY sector
    ORDER BY sector
  `;
}

// Industry Momentum / Breadth page: one row per eligible stock (above the
// market-cap cutoff, tagged with an industry) carrying just its gap returns
// for the given months. The per-industry mean/median/P75/breadth aggregation
// happens in JS (industry-momentum.js) -- MySQL 8 has no PERCENTILE_CONT,
// and at ~1,100 eligible rows the aggregation is trivial in memory anyway.
export function buildIndustryMomentumQuery(months) {
  const sql = `
  SELECT
    i.sector, i.industry,
    ${buildGapReturnCols(months)}
  FROM instruments i
  JOIN instrument_price_snapshot s ON s.instrument_id = i.id
  WHERE ${EQUITY_FILTER}
    AND i.industry IS NOT NULL
    AND i.market_cap_cr > ?
`;
  return sql;
}

export function buildIndustriesQuery() {
  return `
    SELECT industry, COUNT(*) AS count
    FROM instruments i
    WHERE ${EQUITY_FILTER} AND sector = ? AND industry IS NOT NULL
    GROUP BY industry
    ORDER BY industry
  `;
}
