import csv
import os
import sys
import pymysql

SECTOR_DATA_DIR = r"C:\Users\Bhaskar\Desktop\SectorWiseData"


def load_env(path):
    env = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            env[key.strip()] = val.strip()
    return env


def parse_sector_file(path):
    """Each file: 4 metadata lines, a blank line, a header row, then data
    rows. Returns (sector_name, [(symbol, industry), ...]) for NSE-listed
    rows only -- BSE-only duplicates of the same ticker string are a
    different company and would corrupt the match otherwise."""
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        lines = f.readlines()

    sector_line = lines[0].strip()
    sector_name = sector_line.split(":", 1)[1].strip().rstrip(",") if ":" in sector_line else None

    reader = csv.reader(lines[5:])
    rows = list(reader)
    header = rows[0]
    sym_idx = header.index("Symbol")
    ind_idx = header.index("Industry")
    exch_idx = header.index("Exchange")

    out = []
    for row in rows[1:]:
        if not row or len(row) <= max(sym_idx, ind_idx, exch_idx):
            continue
        if row[exch_idx].strip() != "NSE":
            continue
        symbol = row[sym_idx].strip()
        industry = row[ind_idx].strip()
        if symbol:
            out.append((symbol, industry, sector_name))
    return out


def main():
    dry_run = "--dry-run" in sys.argv

    here = os.path.dirname(os.path.abspath(__file__))
    env = load_env(os.path.join(here, ".env"))

    all_rows = []
    files = sorted(f for f in os.listdir(SECTOR_DATA_DIR) if f.endswith(".csv"))
    for fname in files:
        rows = parse_sector_file(os.path.join(SECTOR_DATA_DIR, fname))
        all_rows.extend(rows)
    print(f"{len(files)} sector CSV files parsed, {len(all_rows)} NSE-listed rows found")

    conn = pymysql.connect(
        host=env["DB_HOST"],
        port=int(env["DB_PORT"]),
        user=env["DB_USER"],
        password=env["DB_PASSWORD"],
        database=env["DB_NAME"],
        autocommit=False,
    )
    cur = conn.cursor()

    # Same "genuine equity" universe the app itself filters to -- no point
    # matching against index/ETF/rights-entitlement rows that would never
    # show up in the screener anyway.
    cur.execute("""
        SELECT id, tradingsymbol FROM instruments
        WHERE segment = 'NSE'
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
    """)
    db_instruments = cur.fetchall()
    db_by_exact = {sym: iid for iid, sym in db_instruments}
    db_by_stripped = {}
    for iid, sym in db_instruments:
        stripped = sym.split("-")[0]
        db_by_stripped.setdefault(stripped, []).append(iid)

    updates = []  # (instrument_id, sector, industry)
    unmatched = []
    seen_ids = set()
    for symbol, industry, sector in all_rows:
        iid = db_by_exact.get(symbol)
        if iid is None:
            candidates = db_by_stripped.get(symbol)
            if candidates and len(candidates) == 1:
                iid = candidates[0]
        if iid is None:
            unmatched.append(symbol)
            continue
        if iid in seen_ids:
            continue  # a symbol shouldn't appear twice across files once NSE-filtered; keep first
        seen_ids.add(iid)
        updates.append((iid, sector, industry))

    print(f"Matched {len(updates)} / {len(db_instruments)} DB equities to a sector+industry")
    print(f"{len(unmatched)} CSV rows had no matching DB instrument (kept NULL)")

    if dry_run:
        print("Dry run -- no changes written.")
        conn.close()
        return

    cur.execute("""
        CREATE TEMPORARY TABLE tmp_sector_industry (
            instrument_id BIGINT UNSIGNED PRIMARY KEY,
            sector VARCHAR(100),
            industry VARCHAR(150)
        )
    """)
    insert_sql = "INSERT INTO tmp_sector_industry (instrument_id, sector, industry) VALUES (%s, %s, %s)"
    BATCH = 1000
    for i in range(0, len(updates), BATCH):
        cur.executemany(insert_sql, updates[i : i + BATCH])

    cur.execute("""
        UPDATE instruments i
        JOIN tmp_sector_industry t ON t.instrument_id = i.id
        SET i.sector = t.sector, i.industry = t.industry
    """)
    affected = cur.rowcount
    conn.commit()
    print(f"Updated {affected} rows in instruments.")
    conn.close()


if __name__ == "__main__":
    main()
