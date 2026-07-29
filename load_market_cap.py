"""
Fetch market cap per stock from Upstox's Company Profile API (keyed by ISIN)
and store it in instruments.market_cap_cr. Unlike price data, market cap
barely changes day to day -- this is meant to be re-run occasionally
(monthly), not daily.

NOTE: despite Upstox naming the response field "sector_market_cap_inr", the
value returned is the company's own market cap, not a sector-wide aggregate
-- verified against Reliance's real-world market cap (~18 lakh crore).
"""

import os
import time
import requests
import pymysql

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKPOINT_PATH = os.path.join(HERE, "market_cap_progress.txt")
MIN_REQUEST_INTERVAL = 0.25  # ~4 req/sec, conservative since Upstox doesn't publish a limit for this endpoint


def load_env(path):
    # Same Railway-friendly fallback as backfill_daily_candles.load_env_file:
    # if the local .env file isn't there, use real process env vars instead.
    if not os.path.exists(path):
        return dict(os.environ)
    env = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            env[key.strip()] = val.strip()
    return env


def load_checkpoint():
    if not os.path.exists(CHECKPOINT_PATH):
        return set()
    with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
        return set(line.strip() for line in f if line.strip())


def mark_done(instrument_id):
    with open(CHECKPOINT_PATH, "a", encoding="utf-8") as f:
        f.write(f"{instrument_id}\n")


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
    for attempt in range(max_attempts):
        try:
            return connect_db(db_env)
        except Exception as e:
            backoff = min(5 * (attempt + 1), 60)
            print(f"  DB connect failed ({e}); retrying in {backoff}s "
                  f"(attempt {attempt + 1}/{max_attempts})")
            time.sleep(backoff)
    raise RuntimeError("Could not reconnect to DB after repeated attempts")


def fetch_market_cap(session, headers, isin):
    url = f"https://api.upstox.com/v2/fundamentals/{isin}/profile"
    for attempt in range(5):
        r = session.get(url, headers=headers, timeout=20)
        if r.status_code == 200:
            data = r.json().get("data", {})
            mc = data.get("sector_market_cap_inr", {})
            return mc.get("value")
        if r.status_code == 401:
            raise PermissionError(f"401 from Upstox API: {r.text}")
        if r.status_code == 404:
            return None  # no fundamentals data for this ISIN
        if r.status_code == 429 or r.status_code >= 500:
            backoff = min(2 ** attempt, 20)
            print(f"    retry after {backoff}s (status {r.status_code})")
            time.sleep(backoff)
            continue
        print(f"    unexpected status {r.status_code} for {isin}: {r.text[:150]}")
        return None
    raise RuntimeError(f"Failed after retries for {isin}")


def main():
    upstox_env = load_env(os.path.join(HERE, "upstox.env"))
    db_env = load_env(os.path.join(HERE, ".env"))

    headers = {
        "Authorization": f"Bearer {upstox_env['UPSTOX_ACCESS_TOKEN']}",
        "Accept": "application/json",
    }
    session = requests.Session()

    conn = connect_db_with_retry(db_env)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, tradingsymbol, isin FROM instruments
        WHERE segment = 'NSE'
          AND isin IS NOT NULL
          AND NOT (tradingsymbol REGEXP '^[0-9]+[A-Z]*[0-9]*-')
          AND tradingsymbol NOT LIKE '%-SG'
          AND tradingsymbol NOT LIKE '%-GB'
          AND tradingsymbol NOT LIKE '%-GS'
          AND tradingsymbol NOT LIKE '%-SF'
          AND tradingsymbol NOT LIKE '%INAV%'
          AND tradingsymbol NOT REGEXP '[0-9]{2}[A-Z]{0,3}-(N|Y|Z)[0-9A-Z]{1,2}$'
          AND name NOT LIKE '%ETF%'
          AND name NOT LIKE '%FUND%'
          AND name NOT LIKE '% - %'
        ORDER BY id
    """)
    instruments = cur.fetchall()
    print(f"{len(instruments)} equities with ISIN to fetch market cap for")

    done = load_checkpoint()
    print(f"{len(done)} already completed (resuming)")

    last_call = 0.0
    processed = 0
    updated = 0

    for instrument_id, tradingsymbol, isin in instruments:
        if str(instrument_id) in done:
            continue

        elapsed = time.time() - last_call
        if elapsed < MIN_REQUEST_INTERVAL:
            time.sleep(MIN_REQUEST_INTERVAL - elapsed)
        last_call = time.time()

        # Long-idle DB connections can get dropped between instruments; ping
        # re-establishes it, with a retrying reconnect if that itself fails.
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
            market_cap = fetch_market_cap(session, headers, isin)
            if market_cap is not None:
                cur.execute(
                    "UPDATE instruments SET market_cap_cr = %s, market_cap_updated_at = CURDATE() WHERE id = %s",
                    (market_cap, instrument_id),
                )
                conn.commit()
                updated += 1
            mark_done(instrument_id)
            processed += 1
            print(f"[{processed}] {tradingsymbol}: {market_cap}")
        except PermissionError as e:
            print(f"FATAL: {e}")
            print("Upstox access token likely expired -- refresh it and re-run.")
            try:
                conn.rollback()
            except Exception:
                pass
            return
        except Exception as e:
            print(f"  ERROR on {tradingsymbol} ({isin}): {e}")
            try:
                conn.rollback()
            except Exception:
                conn = connect_db_with_retry(db_env)

    conn.close()
    print(f"\nDone. Processed {processed}, updated {updated} with a market cap value.")


if __name__ == "__main__":
    # Supervisor loop: main() resumes from the checkpoint file, so any unhandled
    # crash just means "restart and keep going" -- meant to run unattended.
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
