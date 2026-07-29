import csv
import os
import pymysql


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


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    db_env = load_env(os.path.join(here, ".env"))

    with open(os.path.join(here, "nse_equity_isin.csv"), newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [(row["SYMBOL"].strip(), row[" ISIN NUMBER"].strip()) for row in reader]
    print(f"{len(rows)} symbol->ISIN pairs parsed from NSE master file")

    conn = pymysql.connect(
        host=db_env["DB_HOST"],
        port=int(db_env["DB_PORT"]),
        user=db_env["DB_USER"],
        password=db_env["DB_PASSWORD"],
        database=db_env["DB_NAME"],
        autocommit=False,
    )
    cur = conn.cursor()

    cur.execute("""
        CREATE TEMPORARY TABLE tmp_isin (
            symbol VARCHAR(50) PRIMARY KEY,
            isin VARCHAR(12)
        )
    """)

    insert_sql = "INSERT INTO tmp_isin (symbol, isin) VALUES (%s, %s)"
    BATCH = 1000
    for i in range(0, len(rows), BATCH):
        cur.executemany(insert_sql, rows[i:i + BATCH])
    print(f"Loaded {len(rows)} rows into temp table")

    cur.execute("""
        UPDATE instruments i
        JOIN tmp_isin t ON t.symbol = i.tradingsymbol
        SET i.isin = t.isin
        WHERE i.segment = 'NSE'
    """)
    updated = cur.rowcount
    conn.commit()
    print(f"Updated ISIN for {updated} instruments")

    cur.execute("SELECT COUNT(*) FROM instruments WHERE segment='NSE' AND isin IS NOT NULL")
    total_with_isin = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM instruments WHERE segment='NSE'")
    total_nse = cur.fetchone()[0]
    print(f"instruments.isin populated: {total_with_isin} / {total_nse} NSE instruments")

    conn.close()


if __name__ == "__main__":
    main()
