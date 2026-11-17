# Live relay

Holds one Kite ticker connection and fans prices out to browsers over WebSocket.
Vercel functions can't keep a socket open, so this runs as its own small service
(Railway, next to the candle cron jobs).

```
Kite ticker ──► relay (this) ──► wss://…/ws ──► browsers
                    ▲
   /api/live-token (Vercel) signs a 10-minute token with LIVE_TOKEN_SECRET
```

## Protocol

Browser → relay: `{ type: "subscribe" | "unsubscribe", symbols: ["NSE:RELIANCE"] }`,
`{ type: "history", symbol }`, `{ type: "ping" }`.

Relay → browser: `hello` (feed mode), `ticks` (batched updates), `candles`
(1-minute history for a symbol), `feed` (status changes), `pong`.

REST (Bearer token): `GET /instruments/search?q=`, `GET /option-chain?underlying=NIFTY&expiry=`,
and an open `GET /health`.

## Environment

| Variable | Purpose |
| --- | --- |
| `LIVE_TOKEN_SECRET` | Required. Same value as on the Vercel project, so its tokens verify here. Separate from the session secret. |
| `KITE_API_KEY` | Enables the real Kite feed. Without it the relay runs a simulated feed. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Where to read today's Kite access token (`app_settings.kite_access_token`). |
| `KITE_ACCESS_TOKEN` | Optional override instead of the database lookup. |
| `ALLOWED_ORIGINS` | Comma-separated web app origins allowed to connect, e.g. `https://client-iota-navy-44.vercel.app`. |
| `FEED_MODE=simulated` | Force simulated prices (useful outside market hours). |
| `PORT` | Defaults to 8090. |

After deploying, set `LIVE_TOKEN_SECRET` and `LIVE_RELAY_URL` (e.g. `https://live-relay.up.railway.app`) on the Vercel project.

## Run locally

```
npm install
LIVE_TOKEN_SECRET=dev-secret FEED_MODE=simulated npm start
npm test
```
