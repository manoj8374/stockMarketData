import { getSession } from "./_auth.js";
import { getSetting, getPool } from "./_db.js";

const EMA_PERIOD_MIN = 2;
const EMA_PERIOD_MAX = 200;
const EMA_MAX_LOOKBACK_CANDLES = 400; // hard ceiling regardless of period, keeps the query bounded

async function kiteGet(path, accessToken) {
  const r = await fetch(`https://api.kite.trade${path}`, {
    headers: {
      "X-Kite-Version": "3",
      Authorization: `token ${process.env.KITE_API_KEY}:${accessToken}`,
    },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Kite ${path} failed (${r.status}): ${text}`);
  }
  const json = await r.json();
  return json.data;
}

function parseEmaPeriod(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 15;
  return Math.min(EMA_PERIOD_MAX, Math.max(EMA_PERIOD_MIN, n));
}

// closesAsc must be oldest-first. Seeds with a plain SMA of the first
// `period` closes, then rolls the exponential recursion forward through the
// rest -- the standard way to compute an EMA from a finite price window.
// Returns null if there isn't even enough history for one seed window.
function computeEma(closesAsc, period) {
  if (closesAsc.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closesAsc.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closesAsc.length; i++) {
    ema = closesAsc[i] * k + ema * (1 - k);
  }
  return ema;
}

// Attaches `ema` and `ema_signal` ('above' | 'below' | null) to each holding,
// computed from our own candle history -- looked up by tradingsymbol, same
// join used everywhere else in this app. Holdings with no matching
// instrument or not enough candle history simply get null values rather
// than failing the whole request.
async function attachEma(holdings, period) {
  if (holdings.length === 0) return holdings;

  const pool = getPool();
  const symbols = [...new Set(holdings.map((h) => h.tradingsymbol))];
  const [instrumentRows] = await pool.query(
    `SELECT id, tradingsymbol FROM instruments WHERE tradingsymbol IN (${symbols.map(() => "?").join(",")})`,
    symbols
  );
  const instrumentIdBySymbol = new Map(instrumentRows.map((r) => [r.tradingsymbol, r.id]));

  const lookback = Math.min(EMA_MAX_LOOKBACK_CANDLES, period * 4 + 30);
  const emaBySymbol = new Map();

  await Promise.all(
    [...instrumentIdBySymbol.entries()].map(async ([symbol, instrumentId]) => {
      const [candleRows] = await pool.query(
        "SELECT close FROM candles WHERE instrument_id = ? ORDER BY ts DESC LIMIT ?",
        [instrumentId, lookback]
      );
      const closesAsc = candleRows.map((r) => Number(r.close)).reverse();
      emaBySymbol.set(symbol, computeEma(closesAsc, period));
    })
  );

  return holdings.map((h) => {
    const ema = emaBySymbol.get(h.tradingsymbol) ?? null;
    let ema_signal = null;
    if (ema !== null && h.last_price > 0) {
      ema_signal = h.last_price < ema ? "below" : "above";
    }
    return { ...h, ema, ema_signal };
  });
}

export default async (req, res) => {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (session.role !== "owner") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const accessToken = await getSetting("kite_access_token");
    if (!accessToken) {
      res.status(409).json({ error: "not_connected" });
      return;
    }

    const emaPeriod = parseEmaPeriod(req.query.ema);

    const [holdingsRaw, positions] = await Promise.all([
      kiteGet("/portfolio/holdings", accessToken),
      kiteGet("/portfolio/positions", accessToken),
    ]);

    const holdings = await attachEma(holdingsRaw, emaPeriod);

    const netPositions = positions?.net || [];
    const totalInvestment = holdings.reduce((acc, h) => acc + h.average_price * h.quantity, 0);
    const currentValue = holdings.reduce((acc, h) => acc + h.last_price * h.quantity, 0);
    const holdingsPnl = holdings.reduce((acc, h) => acc + h.pnl, 0);
    const positionsPnl = netPositions.reduce((acc, p) => acc + p.pnl, 0);
    const dayPnl = holdings.reduce((acc, h) => acc + (h.day_change || 0) * h.quantity, 0);

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      generatedAt: new Date().toISOString(),
      emaPeriod,
      holdings,
      positions: netPositions,
      dayPositions: positions?.day || [],
      summary: {
        totalInvestment,
        currentValue,
        totalPnl: holdingsPnl + positionsPnl,
        dayPnl,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
};
