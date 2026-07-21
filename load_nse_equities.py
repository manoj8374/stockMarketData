import os
import math
import pandas as pd
import pymysql


def load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            os.environ[key.strip()] = val.strip().strip('"').strip("'")


def connect():
    return pymysql.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ["DB_PORT"]),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        autocommit=False,
    )


def clean(val):
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    if isinstance(val, str) and val.strip() == "":
        return None
    return val


def main():
    load_env()

    csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kite_instruments.csv")
    df = pd.read_csv(csv_path)
    nse_eq = df[(df["exchange"] == "NSE") & (df["instrument_type"] == "EQ")].copy()
    print(f"Loading {len(nse_eq)} NSE EQ instruments (incl. indices)")

    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM exchanges WHERE code = 'NSE'")
            exchange_id = cur.fetchone()[0]

            cur.execute("SELECT id FROM data_sources WHERE code = 'ZERODHA_KITE'")
            data_source_id = cur.fetchone()[0]

            # NOTE: pymysql's executemany() only batches multi-row INSERTs when the VALUES
            # tuple is made up entirely of %s/%(name)s placeholders. A single literal value
            # mixed in (or a VALUES() call in ON DUPLICATE KEY UPDATE) breaks its regex match
            # and it silently falls back to one round-trip per row. So every column --
            # including constants like is_active -- must be bound as a parameter, and the
            # "AS new_row" alias form (MySQL 8.0.19+) is used instead of VALUES() in the
            # ON DUPLICATE clause.
            insert_instrument = """
                INSERT INTO instruments
                    (exchange_id, tradingsymbol, name, instrument_type, segment,
                     lot_size, tick_size, expiry, strike, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) AS new_row
                ON DUPLICATE KEY UPDATE
                    name = new_row.name,
                    lot_size = new_row.lot_size,
                    tick_size = new_row.tick_size,
                    is_active = new_row.is_active
            """

            instrument_rows = []
            token_by_symbol_strike = {}
            for _, row in nse_eq.iterrows():
                expiry = clean(row["expiry"])
                strike = clean(row["strike"]) or 0.0
                name = clean(row["name"]) or row["tradingsymbol"]

                instrument_rows.append((
                    exchange_id,
                    row["tradingsymbol"],
                    name,
                    row["instrument_type"],
                    row["segment"],
                    int(row["lot_size"]),
                    float(row["tick_size"]),
                    expiry,
                    strike,
                    1,
                ))
                token_by_symbol_strike[(row["tradingsymbol"], strike, row["instrument_type"])] = (
                    str(row["instrument_token"]), row["tradingsymbol"]
                )

            BATCH = 1000
            for i in range(0, len(instrument_rows), BATCH):
                cur.executemany(insert_instrument, instrument_rows[i:i + BATCH])
                print(f"  instruments upserted: {min(i + BATCH, len(instrument_rows))}/{len(instrument_rows)}")

            cur.execute(
                "SELECT id, tradingsymbol, strike, instrument_type FROM instruments "
                "WHERE exchange_id = %s AND expiry IS NULL",
                (exchange_id,),
            )
            id_by_symbol_strike = {
                (tradingsymbol, float(strike), instrument_type): iid
                for iid, tradingsymbol, strike, instrument_type in cur.fetchall()
            }

            insert_map = """
                INSERT INTO instrument_source_map
                    (instrument_id, data_source_id, source_instrument_id, source_symbol, is_active)
                VALUES (%s, %s, %s, %s, %s) AS new_row
                ON DUPLICATE KEY UPDATE
                    source_symbol = new_row.source_symbol,
                    is_active = new_row.is_active
            """

            map_rows = []
            for key, (token, symbol) in token_by_symbol_strike.items():
                instrument_id = id_by_symbol_strike.get(key)
                if instrument_id is None:
                    continue
                map_rows.append((instrument_id, data_source_id, token, symbol, 1))

            for i in range(0, len(map_rows), BATCH):
                cur.executemany(insert_map, map_rows[i:i + BATCH])
                print(f"  source maps upserted: {min(i + BATCH, len(map_rows))}/{len(map_rows)}")

            count = len(map_rows)

        conn.commit()
        print(f"Done. Upserted {count} instruments + source mappings.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
