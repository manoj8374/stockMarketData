"""
Telegram bot: paste a Kite request_token as a message, get the access_token
exchanged and pushed straight into the cron-candles Railway service.

Long-polls Telegram's getUpdates -- no webhook/public URL needed. Only
accepts messages from ALLOWED_CHAT_ID; everything else is ignored.

Also sends a one-time-per-day reminder at 5:30 PM IST (checked once per poll
loop iteration, no separate cron job needed since this process is already
always-on).

Required env vars:
    TELEGRAM_BOT_TOKEN
    TELEGRAM_CHAT_ID       -- the only chat this bot will accept commands from
    RAILWAY_TOKEN          -- Railway project token, used by the CLI to push the variable
    KITE_API_KEY
    KITE_API_SECRET
"""

import hashlib
import os
import subprocess
import time
from datetime import datetime, timedelta, timezone

import requests

TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ALLOWED_CHAT_ID = int(os.environ["TELEGRAM_CHAT_ID"])
KITE_API_KEY = os.environ["KITE_API_KEY"]
KITE_API_SECRET = os.environ["KITE_API_SECRET"]
RAILWAY_SERVICE = "cron-candles"

TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

IST = timezone(timedelta(hours=5, minutes=30))
REMINDER_HOUR_IST = 17
REMINDER_MINUTE_IST = 20
REMINDER_TEXT = (
    "Reminder: refresh the Kite token before 6 PM IST.\n"
    "1. Open https://kite.zerodha.com/connect/login?api_key=9cdql2a4r4362vdg&v=3\n"
    "2. Log in, copy the request_token from the redirect URL.\n"
    "3. Send it here."
)


def send_message(chat_id, text):
    requests.post(f"{TELEGRAM_API}/sendMessage", data={"chat_id": chat_id, "text": text}, timeout=10)


def exchange_token(request_token):
    checksum = hashlib.sha256(f"{KITE_API_KEY}{request_token}{KITE_API_SECRET}".encode()).hexdigest()
    r = requests.post(
        "https://api.kite.trade/session/token",
        data={"api_key": KITE_API_KEY, "request_token": request_token, "checksum": checksum},
        headers={"X-Kite-Version": "3"},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["data"]["access_token"]


def push_to_railway(access_token):
    env = dict(os.environ)  # RAILWAY_TOKEN already present, CLI picks it up automatically
    result = subprocess.run(
        ["npx", "--yes", "@railway/cli", "variable", "set",
         f"KITE_ACCESS_TOKEN={access_token}",
         "--service", RAILWAY_SERVICE, "--skip-deploys", "--json"],
        capture_output=True, text=True, env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout)


def handle_message(chat_id, text):
    request_token = text.strip()
    if not request_token or len(request_token) > 100:
        send_message(chat_id, "That doesn't look like a request_token. Paste just the token value.")
        return
    try:
        access_token = exchange_token(request_token)
        push_to_railway(access_token)
        send_message(chat_id, f"Done. cron-candles now has the fresh access token (...{access_token[-6:]}).")
    except Exception as e:
        send_message(chat_id, f"Failed: {e}")


def maybe_send_reminder(last_sent_date):
    now_ist = datetime.now(IST)
    scheduled_today = now_ist.replace(hour=REMINDER_HOUR_IST, minute=REMINDER_MINUTE_IST, second=0, microsecond=0)
    if now_ist >= scheduled_today and last_sent_date != now_ist.date():
        send_message(ALLOWED_CHAT_ID, REMINDER_TEXT)
        print(f"Sent daily reminder ({now_ist.isoformat()})", flush=True)
        return now_ist.date()
    return last_sent_date


def main():
    print("Bot started, long-polling Telegram...", flush=True)
    offset = 0
    last_reminder_date = None
    while True:
        last_reminder_date = maybe_send_reminder(last_reminder_date)
        try:
            r = requests.get(f"{TELEGRAM_API}/getUpdates",
                              params={"offset": offset, "timeout": 30}, timeout=40)
            r.raise_for_status()
            updates = r.json()["result"]
            for update in updates:
                offset = update["update_id"] + 1
                msg = update.get("message")
                if not msg or "text" not in msg:
                    continue
                chat_id = msg["chat"]["id"]
                if chat_id != ALLOWED_CHAT_ID:
                    continue
                text = msg["text"]
                if text.strip() == "/start":
                    send_message(chat_id, "Send me a Kite request_token and I'll refresh cron-candles.")
                    continue
                print(f"Handling request_token from {chat_id}", flush=True)
                handle_message(chat_id, text)
        except requests.exceptions.RequestException as e:
            print(f"Poll error: {e}", flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
