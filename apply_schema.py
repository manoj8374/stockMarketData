import os
import re
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


def split_statements(sql_text):
    statements = []
    for raw in sql_text.split(";"):
        stmt = re.sub(r"--.*", "", raw).strip()
        if stmt:
            statements.append(stmt)
    return statements


def main():
    load_env()

    conn = pymysql.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ["DB_PORT"]),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        autocommit=True,
    )

    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as f:
        sql_text = f.read()

    try:
        with conn.cursor() as cur:
            for stmt in split_statements(sql_text):
                cur.execute(stmt)
                print(f"OK: {stmt.splitlines()[0][:80]}")
    finally:
        conn.close()

    print("\nSchema applied successfully.")


if __name__ == "__main__":
    main()
