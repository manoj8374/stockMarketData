"""
Daily Kite token refresh helper.

The login step itself can't be automated (Zerodha requires an interactive
browser login + 2FA) -- this script only automates the tedious part *after*
that: exchanging the request_token for an access_token, and pushing it to
both the local AlgoTrading/.env and the Railway cron-candles service.

Usage:
    1. Open: https://kite.zerodha.com/connect/login?api_key=<KITE_API_KEY>&v=3
    2. Log in. You'll be redirected to a URL containing "request_token=...".
    3. python refresh_kite_token.py <request_token>
"""

import hashlib
import os
import subprocess
import sys

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
KITE_ENV_PATH = r"C:\Users\Bhaskar\Desktop\AlgoTrading\.env"
RAILWAY_SERVICE = "cron-candles"


def load_env_file(path):
    env = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            env[key.strip()] = val.strip().strip('"').strip("'")
    return env


def exchange_token(api_key, api_secret, request_token):
    checksum = hashlib.sha256(f"{api_key}{request_token}{api_secret}".encode()).hexdigest()
    r = requests.post(
        "https://api.kite.trade/session/token",
        data={"api_key": api_key, "request_token": request_token, "checksum": checksum},
        headers={"X-Kite-Version": "3"},
        timeout=20,
    )
    r.raise_for_status()
    data = r.json()["data"]
    return data["access_token"]


def update_env_file(path, key, value):
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    found = False
    for i, line in enumerate(lines):
        if line.strip().startswith(f"{key}="):
            lines[i] = f"{key}={value}\n"
            found = True
            break
    if not found:
        lines.append(f"{key}={value}\n")
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)


def push_to_railway(access_token):
    result = subprocess.run(
        ["npx", "--yes", "@railway/cli", "variable", "set",
         f"KITE_ACCESS_TOKEN={access_token}",
         "--service", RAILWAY_SERVICE, "--skip-deploys", "--json"],
        cwd=HERE, capture_output=True, text=True, shell=True,
    )
    if result.returncode != 0:
        print("FAILED to push to Railway:")
        print(result.stdout)
        print(result.stderr)
        sys.exit(1)
    print(f"Pushed to Railway ({RAILWAY_SERVICE}): {result.stdout.strip()}")


def main():
    if len(sys.argv) != 2:
        print("Usage: python refresh_kite_token.py <request_token>")
        sys.exit(1)
    request_token = sys.argv[1]

    kite_env = load_env_file(KITE_ENV_PATH)
    access_token = exchange_token(kite_env["KITE_API_KEY"], kite_env["KITE_API_SECRET"], request_token)
    print(f"New access token: {access_token}")

    update_env_file(KITE_ENV_PATH, "KITE_ACCESS_TOKEN", access_token)
    update_env_file(KITE_ENV_PATH, "KITE_REQUEST_TOKEN", request_token)
    print(f"Updated {KITE_ENV_PATH}")

    push_to_railway(access_token)
    print("Done. cron-candles will use the new token on its next run.")


if __name__ == "__main__":
    main()
