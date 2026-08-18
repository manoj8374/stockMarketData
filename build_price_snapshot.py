"""
Rebuilds instrument_price_snapshot -- a per-instrument cache of current
price, all-time-high, and price-N-months-ago (N=1..12), each already
staleness-guarded (see STALENESS_DAYS below). This used to be computed live
on every /api/stocks request via ~24 correlated subqueries against `candles`
per row, which took 40+ seconds once the candles table grew large. Running
that same computation once here, right after each day's candles land, means
the API can just read this small table instead.

Usage:
    python build_price_snapshot.py            # rebuild for every instrument with candles
    python build_price_snapshot.py --dry-run   # compute and report, write nothing

Intended to be run once daily, right after update_candles.py finishes (it is
called automatically from update_candles.py's main()).
"""

import os
import sys
from datetime import date, timedelta

import pymysql

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backfill_daily_candles import load_env_file as load_env  # noqa: E402

MONTHS = list(range(1, 13))

# ~20 trading days -- see _db.js for the full rationale (a stock that was
# suspended/illiquid for a long stretch would otherwise silently return a
# years-stale "N months ago" price with no indication it isn't actually
# close to the requested date).
STALENESS_DAYS = 28


def month_target(today, m):
    """Mirrors MySQL's DATE_SUB(CURDATE(), INTERVAL m MONTH) -- subtract m
    months, clamping to the last valid day of the resulting month."""
    year = today.year
    month = today.month - m
    while month <= 0:
        month += 12
        year -= 1
    day = today.day
    while True:
        try:
            return date(year, month, day)
        except ValueError:
            day -= 1


def build_raw_query():
    """One flat query with a correlated subquery per (instrument, fact) --
    the same computation the API used to run on every request, just executed
    once here instead. ~28 subqueries/row is fine for a nightly batch job."""
    month_cols = ",\n      ".join(
        f"""(SELECT c.close FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL {m} MONTH) ORDER BY c.ts DESC LIMIT 1) AS raw_price_{m}m,
      (SELECT c.ts    FROM candles c WHERE c.instrument_id = i.id AND c.ts <= DATE_SUB(CURDATE(), INTERVAL {m} MONTH) ORDER BY c.ts DESC LIMIT 1) AS raw_date_{m}m"""
        for m in MONTHS
    )
    return f"""
        SELECT
          i.id,
          (SELECT c.close FROM candles c WHERE c.instrument_id = i.id ORDER BY c.ts DESC LIMIT 1) AS current_price,
          (SELECT c.ts    FROM candles c WHERE c.instrument_id = i.id ORDER BY c.ts DESC LIMIT 1) AS current_ts,
          (SELECT MAX(c.high) FROM candles c WHERE c.instrument_id = i.id) AS all_time_high,
          (SELECT c.ts FROM candles c WHERE c.instrument_id = i.id ORDER BY c.high DESC, c.ts DESC LIMIT 1) AS ath_date,
          {month_cols}
        FROM instruments i
        WHERE EXISTS (SELECT 1 FROM candles c2 WHERE c2.instrument_id = i.id)
    """


def main():
    dry_run = "--dry-run" in sys.argv

    here = os.path.dirname(os.path.abspath(__file__))
    env = load_env(os.path.join(here, ".env"))

    conn = pymysql.connect(
        host=env["DB_HOST"],
        port=int(env["DB_PORT"]),
        user=env["DB_USER"],
        password=env["DB_PASSWORD"],
        database=env["DB_NAME"],
        autocommit=False,
    )
    cur = conn.cursor()

    today = date.today()
    targets = {m: month_target(today, m) for m in MONTHS}

    print("Computing raw price facts from candles (one-time correlated-subquery pass)...")
    cur.execute(build_raw_query())
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"{len(rows)} instruments with candle data")

    updates = []
    for row in rows:
        r = dict(zip(cols, row))
        values = [r["id"], r["current_price"], r["current_ts"], r["all_time_high"], r["ath_date"]]
        for m in MONTHS:
            raw_price = r[f"raw_price_{m}m"]
            raw_date = r[f"raw_date_{m}m"]
            fresh = raw_date is not None and (targets[m] - raw_date.date()).days <= STALENESS_DAYS
            values.append(raw_price if fresh else None)
            values.append(raw_date if fresh else None)
        updates.append(tuple(values))

    if dry_run:
        print(f"Dry run -- would upsert {len(updates)} rows. No changes written.")
        conn.close()
        return

    month_col_names = ", ".join(f"price_{m}m, date_{m}m" for m in MONTHS)
    placeholders = ", ".join(["%s"] * (5 + len(MONTHS) * 2))
    update_clause = ", ".join(
        [
            "current_price=VALUES(current_price)",
            "current_ts=VALUES(current_ts)",
            "all_time_high=VALUES(all_time_high)",
            "ath_date=VALUES(ath_date)",
        ]
        + [f"price_{m}m=VALUES(price_{m}m), date_{m}m=VALUES(date_{m}m)" for m in MONTHS]
    )
    sql = f"""
        INSERT INTO instrument_price_snapshot
            (instrument_id, current_price, current_ts, all_time_high, ath_date, {month_col_names})
        VALUES ({placeholders})
        ON DUPLICATE KEY UPDATE {update_clause}
    """

    BATCH = 500
    for i in range(0, len(updates), BATCH):
        cur.executemany(sql, updates[i : i + BATCH])
    conn.commit()
    print(f"Upserted {len(updates)} rows into instrument_price_snapshot.")
    conn.close()


if __name__ == "__main__":
    main()
