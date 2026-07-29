import os
import time
import requests
import pymysql
from datetime import date, timedelta

KITE_ENV_PATH = r"C:\Users\Bhaskar\Desktop\AlgoTrading\.env"
DB_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
CHECKPOINT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backfill_progress.txt")

MAX_CHUNK_DAYS = 2000       # Kite's max range for 'day' interval
START_DATE = date(2000, 1, 3)  # confirmed earliest day-candle data available on Kite for NSE
MIN_REQUEST_INTERVAL = 0.35  # ~3 req/sec, with margin
DATA_SOURCE_CODE = "ZERODHA_KITE"

NIFTY50_SYMBOLS = [
    "RELIANCE", "HDFCBANK", "BHARTIARTL", "ICICIBANK", "SBIN", "TCS", "BAJFINANCE", "LT",
    "HINDUNILVR", "SUNPHARMA", "INFY", "MARUTI", "ADANIPORTS", "AXISBANK", "TITAN", "ADANIENT",
    "M&M", "KOTAKBANK", "ITC", "ULTRACEMCO", "NTPC", "HCLTECH", "ONGC", "JSWSTEEL", "BEL",
    "BAJAJFINSV", "BAJAJ-AUTO", "ETERNAL", "NESTLEIND", "POWERGRID", "COALINDIA", "ASIANPAINT",
    "SHRIRAMFIN", "TATASTEEL", "HINDALCO", "GRASIM", "EICHERMOT", "INDIGO", "WIPRO", "SBILIFE",
    "JIOFIN", "TECHM", "TRENT", "APOLLOHOSP", "TMPV", "HDFCLIFE", "CIPLA", "TATACONSUM",
    "MAXHEALTH", "DRREDDY",
]


def load_env_file(path):
    # On Railway (or anywhere the local .env files don't exist), fall back to
    # real process env vars instead -- lets the same script run unattended in
    # a container where secrets are injected as env vars, not files on disk.
    if not os.path.exists(path):
        return dict(os.environ)
    env = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            env[key.strip()] = val.strip().strip('"').strip("'")
    return env


def load_checkpoint():
    if not os.path.exists(CHECKPOINT_PATH):
        return set()
    with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
        return set(line.strip() for line in f if line.strip())


def mark_done(instrument_id):
    with open(CHECKPOINT_PATH, "a", encoding="utf-8") as f:
        f.write(f"{instrument_id}\n")


class RateLimiter:
    def __init__(self, min_interval):
        self.min_interval = min_interval
        self.last_call = 0.0

    def wait(self):
        elapsed = time.time() - self.last_call
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_call = time.time()


def fetch_candles(session, headers, instrument_token, from_date, to_date, limiter):
    url = f"https://api.kite.trade/instruments/historical/{instrument_token}/day"
    params = {"from": from_date.isoformat(), "to": to_date.isoformat()}

    for attempt in range(5):
        limiter.wait()
        r = session.get(url, headers=headers, params=params, timeout=30)
        if r.status_code == 200:
            return r.json()["data"]["candles"]
        if r.status_code == 403:
            raise PermissionError(f"403 from Kite API: {r.text}")
        if r.status_code == 429 or r.status_code >= 500:
            backoff = min(2 ** attempt, 20)
            print(f"    retry after {backoff}s (status {r.status_code})")
            time.sleep(backoff)
            continue
        print(f"    unexpected status {r.status_code} for token {instrument_token}: {r.text[:200]}")
        return []
    raise RuntimeError(f"Failed after retries for token {instrument_token}")


def get_candles_for_instrument(session, headers, instrument_token, limiter):
    today = date.today()

    all_candles = []
    chunk_start = START_DATE
    while chunk_start <= today:
        chunk_end = min(chunk_start + timedelta(days=MAX_CHUNK_DAYS - 1), today)
        candles = fetch_candles(session, headers, instrument_token, chunk_start, chunk_end, limiter)
        all_candles.extend(candles)
        chunk_start = chunk_end + timedelta(days=1)

    return all_candles


def insert_candles(cur, instrument_id, data_source_id, candles):
    if not candles:
        return 0
    sql = """
        INSERT INTO candles
            (instrument_id, `interval`, ts, open, high, low, close, volume, oi, data_source_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) AS new_row
        ON DUPLICATE KEY UPDATE
            open = new_row.open,
            high = new_row.high,
            low = new_row.low,
            close = new_row.close,
            volume = new_row.volume,
            oi = new_row.oi,
            data_source_id = new_row.data_source_id
    """
    rows = []
    for c in candles:
        ts_str = c[0][:19]  # strip timezone offset, e.g. '2026-07-01T00:00:00'
        ts = ts_str.replace("T", " ")
        oi = c[6] if len(c) > 6 else None
        rows.append((instrument_id, "day", ts, c[1], c[2], c[3], c[4], c[5], oi, data_source_id))
    cur.executemany(sql, rows)
    return len(rows)


def connect_db(db_env):
    return pymysql.connect(
        host=db_env["DB_HOST"],
        port=int(db_env["DB_PORT"]),
        user=db_env["DB_USER"],
        password=db_env["DB_PASSWORD"],
        database=db_env["DB_NAME"],
        autocommit=False,
    )


def connect_db_with_retry(db_env, max_attempts=30):
    # DNS blips / proxy hiccups on the Railway side are transient; this is meant to
    # run unattended for hours, so keep retrying with capped backoff instead of dying.
    for attempt in range(max_attempts):
        try:
            return connect_db(db_env)
        except Exception as e:
            backoff = min(5 * (attempt + 1), 60)
            print(f"  DB connect failed ({e}); retrying in {backoff}s "
                  f"(attempt {attempt + 1}/{max_attempts})")
            time.sleep(backoff)
    raise RuntimeError("Could not reconnect to DB after repeated attempts")


def main():
    kite_env = load_env_file(KITE_ENV_PATH)
    db_env = load_env_file(DB_ENV_PATH)

    headers = {
        "X-Kite-Version": "3",
        "Authorization": f"token {kite_env['KITE_API_KEY']}:{kite_env['KITE_ACCESS_TOKEN']}",
    }
    session = requests.Session()
    limiter = RateLimiter(MIN_REQUEST_INTERVAL)

    conn = connect_db_with_retry(db_env)
    cur = conn.cursor()
    cur.execute("SELECT id FROM data_sources WHERE code = %s", (DATA_SOURCE_CODE,))
    data_source_id = cur.fetchone()[0]

    # Kite's NSE 'EQ' instrument_type also includes govt securities, gilts, sovereign
    # gold bonds, corporate bond series, specialized investment funds, ETFs, and AMC
    # NAV reference instruments -- none of which are stocks. NOTE: do not filter on
    # "tradingsymbol != name" -- many genuine blue-chips (ACC, ITC, WIPRO, CIPLA...)
    # have no distinct name in Kite's data and would be wrongly excluded. Likewise a
    # leading digit alone isn't a bond signal (3MINDIA, 5PAISA, 63MOONS are real);
    # bond identifiers always pair a leading digit block with a trailing dash.
    cur.execute("""
        SELECT i.id, i.tradingsymbol, m.source_instrument_id
        FROM instruments i
        JOIN instrument_source_map m ON m.instrument_id = i.id AND m.data_source_id = %s
        WHERE i.segment = 'NSE'
          AND NOT (i.tradingsymbol REGEXP '^[0-9]+[A-Z]*[0-9]*-')
          AND i.tradingsymbol NOT LIKE '%%-SG'
          AND i.tradingsymbol NOT LIKE '%%-GB'
          AND i.tradingsymbol NOT LIKE '%%-GS'
          AND i.tradingsymbol NOT LIKE '%%-SF'
          AND i.tradingsymbol NOT LIKE '%%INAV%%'
          AND i.tradingsymbol NOT REGEXP '[0-9]{2}[A-Z]{0,3}-(N|Y|Z)[0-9A-Z]{1,2}$'
          AND i.name NOT LIKE '%%ETF%%'
          AND i.name NOT LIKE '%%FUND%%'
          AND i.name NOT LIKE '%% - %%'
        ORDER BY i.id
    """, (data_source_id,))
    instruments = cur.fetchall()
    print(f"{len(instruments)} equities to backfill (from {START_DATE})")

    done = load_checkpoint()
    print(f"{len(done)} already completed (resuming)")

    total_candles = 0
    processed = 0
    for instrument_id, tradingsymbol, instrument_token in instruments:
        if str(instrument_id) in done:
            continue

        # Long-idle DB connections behind the Railway proxy can get dropped between
        # instruments; ping re-establishes it, with a retrying reconnect if that itself
        # fails (e.g. a transient DNS blip on the proxy hostname).
        try:
            conn.ping(reconnect=False)
        except Exception:
            try:
                conn.close()
            except Exception:
                pass
            conn = connect_db_with_retry(db_env)
        cur = conn.cursor()

        try:
            candles = get_candles_for_instrument(session, headers, instrument_token, limiter)
            n = insert_candles(cur, instrument_id, data_source_id, candles)
            conn.commit()
            mark_done(instrument_id)
            total_candles += n
            processed += 1
            print(f"[{processed}] {tradingsymbol}: {n} candles")
        except PermissionError as e:
            print(f"FATAL: {e}")
            try:
                conn.rollback()
            except Exception:
                pass
            return
        except Exception as e:
            print(f"  ERROR on {tradingsymbol} ({instrument_token}): {e}")
            try:
                conn.rollback()
            except Exception:
                conn = connect_db_with_retry(db_env)

    conn.close()
    print(f"\nDone. Processed {processed} instruments, {total_candles} candle rows upserted this run.")


if __name__ == "__main__":
    # Supervisor loop: main() resumes from the checkpoint file, so any unhandled crash
    # (network blip, dropped connection, etc.) just means "restart and keep going" --
    # this is meant to run for hours unattended.
    restart = 0
    max_restarts = 100
    while True:
        try:
            main()
            break
        except Exception as e:
            restart += 1
            print(f"\nCRASHED (restart {restart}/{max_restarts}): {e}")
            if restart >= max_restarts:
                print("Too many restarts, giving up.")
                break
            time.sleep(min(10 * restart, 120))
