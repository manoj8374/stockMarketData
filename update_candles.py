"""
Fetch daily candles for a given date range, for the ~3011 filtered NSE equities only
(same filter as the backfill -- excludes bonds/gilts/gold-bonds/ETFs/AMC-NAV/indices).

Usage:
    python update_candles.py --from 2026-07-19 --to 2026-07-20
    python update_candles.py                      # defaults to today only
    python update_candles.py --from 2026-07-19     # defaults --to to today
"""

import os
import sys
import argparse
import requests
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backfill_daily_candles import (  # noqa: E402
    KITE_ENV_PATH, DB_ENV_PATH, MIN_REQUEST_INTERVAL, DATA_SOURCE_CODE, MAX_CHUNK_DAYS,
    load_env_file, connect_db_with_retry, RateLimiter, fetch_candles, insert_candles,
)


def parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def get_candles_in_range(session, headers, instrument_token, from_date, to_date, limiter):
    all_candles = []
    chunk_start = from_date
    while chunk_start <= to_date:
        chunk_end = min(chunk_start + timedelta(days=MAX_CHUNK_DAYS - 1), to_date)
        candles = fetch_candles(session, headers, instrument_token, chunk_start, chunk_end, limiter)
        all_candles.extend(candles)
        chunk_start = chunk_end + timedelta(days=1)
    return all_candles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="from_date", type=parse_date, default=date.today())
    parser.add_argument("--to", dest="to_date", type=parse_date, default=date.today())
    args = parser.parse_args()

    if args.from_date > args.to_date:
        print(f"--from ({args.from_date}) is after --to ({args.to_date})")
        sys.exit(1)

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

    # Same equity-only filter as the backfill (no indices here).
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
    print(f"{len(instruments)} equities, updating {args.from_date} to {args.to_date}")

    total_candles = 0
    updated = 0

    for instrument_id, tradingsymbol, instrument_token in instruments:
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
            candles = get_candles_in_range(session, headers, instrument_token,
                                            args.from_date, args.to_date, limiter)
            n = insert_candles(cur, instrument_id, data_source_id, candles)
            conn.commit()
            if n:
                total_candles += n
                updated += 1
                print(f"{tradingsymbol}: +{n} candles")
        except PermissionError as e:
            print(f"FATAL: {e}")
            print("Kite access token is likely expired -- log in again to refresh "
                  "KITE_ACCESS_TOKEN in AlgoTrading/.env, then re-run this script.")
            try:
                conn.rollback()
            except Exception:
                pass
            sys.exit(1)
        except Exception as e:
            print(f"  ERROR on {tradingsymbol} ({instrument_token}): {e}")
            try:
                conn.rollback()
            except Exception:
                conn = connect_db_with_retry(db_env)

    conn.close()
    print(f"\nDone. {updated} instruments updated, {total_candles} candle rows upserted.")


if __name__ == "__main__":
    main()
