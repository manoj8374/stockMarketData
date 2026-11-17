# NSE Equities web app

React 19 + TypeScript + MobX front end for the stock screener, sector and
industry views, live watchlist, option chain and Kite portfolio. The API lives
in `api/` as Vercel functions; live prices come from the relay in `../relay`.

## Layers

```
components   observer() views. Read from a controller, call its actions. No fetch, no business logic.
     │
controllers  One per screen. Screen state (filters, sort, page, inputs) and derived lists.
     │       Start reactions in mount(), stop them in dispose().
stores       App-wide data and its loading state, shared between screens (RootStore owns them all).
     │
models       Domain classes built from API rows, holding the maths (momentum score, back-scores,
     │       industry scoring, P&L, EMA gap).
services     All I/O, behind an interface: *ApiService for the real API, *FixtureService for tests.
```

Rules: components never call `fetch`; services never import stores; every
service has a fixture twin, which is how the tests run without a network.

`core/network/Resource` wraps one remote value (`IDLE → LOADING → SUCCESS | FAILURE`).
A new `load()` aborts the previous request, so a slow old response can never
overwrite newer data, and `pending` lets a second caller wait for a load already
in flight.

## Folders

```
src/
  app/        RootStore, services wiring, routes, app shell (nav + top bar)
  core/       network/ (ApiClient, ApiError, Resource)  socket/ (SocketClient)
  common/     shared components, PreferencesStore (theme, small-cap toggle), UiStore, utils
  features/
    auth/        login, guest access, session expiry
    screener/    StockModel, StocksStore (cached per query), ScreenerController
    sectors/     sector and industry lists, industry drill-down
    industries/  IndustryMomentumModel and leaderboard
    portfolio/   holdings, positions, EMA trend
    live/        LiveTicksStore, WatchlistStore, OptionChainStore, chart
  test/       renderWithStores, fixture services, FakeTransport, chart stub
```

## Live data

```
Kite ticker ─► relay (Railway) ─► WebSocket ─► SocketClient ─► LiveTicksStore ─► observer rows
```

- `/api/live-token` returns the relay URL and a 10-minute token signed with the
  session secret (the relay is on another domain, so it can't read the cookie).
- `SocketClient` reconnects with exponential backoff and jitter, treats two
  missed heartbeats as a dead connection, and replays reference-counted
  subscriptions after every reconnect.
- `LiveTicksStore` keeps the latest tick per symbol in a buffer and applies the
  whole batch once per animation frame in one MobX action, so a burst of updates
  costs one render. Each row observes only its own `TickModel`.
- The watchlist and option chain subscribe to their new symbols before releasing
  the old ones, so overlapping symbols are never unsubscribed and resubscribed.

## Scripts

```
npm run dev          Vite on :5173 (API calls proxy to :4000; use `vercel dev` for the real functions)
npm test             Jest + React Testing Library
npm run check        lint, typecheck, format check, tests, production build
npm run format       Prettier
```

Environment variables for the functions: `DB_*`, `SESSION_SECRET`, `AUTH_USERS`,
`KITE_API_KEY`, `KITE_API_SECRET`, optional `GUEST_USERNAME`, and
`LIVE_TOKEN_SECRET` and `LIVE_RELAY_URL` once the relay is deployed (see `../relay/README.md`).
