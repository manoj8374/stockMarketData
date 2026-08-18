FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backfill_daily_candles.py update_candles.py load_market_cap.py build_price_snapshot.py ./

# No CMD -- each Railway service that builds from this image sets its own
# Custom Start Command (`python update_candles.py` or `python load_market_cap.py`)
# and its own cron schedule.
