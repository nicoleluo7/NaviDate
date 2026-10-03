# Navidate

**Turn “What should we do?” into a date.** A single TypeScript application for Cornell and Ithaca, built for BigRed//Hacks. Next.js, React, Tailwind, Leaflet, Zod, SQLite, optional Supabase, xAI and Photon Spectrum.

## Run locally

Use **Node 24** (the repository includes `.nvmrc`). Run these commands from `navidate/`:

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. No API keys, account, card, or paid service are required. Native SQLite needs a supported Node version; if you switch Node versions after installing, run `npm rebuild better-sqlite3`.

For a production build on your own machine:

```bash
npm run build
npm start
```

No deployment or external publication has been performed. The optional providers below are never activated automatically.

## Try the complete flow

Choose Johnson Museum or Cornell Arts Quad, October 2, 2026 at 13:00 New York time, 3 hours, $50, any setting, and walking. Generate, select a plan, click stops and map markers, try another place for a stop, and save. The creator can reopen `/edit/[shareId]` in the same browser. Everyone else gets a read-only `/date/[shareId]` link.

The creator credential is an HTTP-only, SameSite=Strict cookie, separate from the share ID. Clearing cookies loses editing access; the MVP has no recovery or account system. Saved dates do not expire automatically; drafts expire after one hour. Custom starting points are redacted from public responses. Public links are bearer view links: anyone with one can view it.

To disable outbound weather, routing and AI requests, set `DISABLE_EXTERNAL_APIS=true`. Map tiles still load normally in the browser; automated browser tests mock tiles. No fictional venues appear in the product. The “local planner” label means deterministic planning over real venue records with estimates, not a simulated API response.

## Checks

```bash
npm run validate:data
npm run test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest uses fictional fixtures and blocks external APIs. Playwright covers the form, results, Leaflet markers, persistence, public share URL, unauthorized editing, impossible constraints, and a 375px mobile viewport. It uses a local server and mocked tile responses. Tests never consume xAI credits or send real iMessages. Browser screenshots are in ignored `test-results/`.

The validator prints missing verification dates and unknown hours as warnings, not invented values. Schema failures, duplicate IDs, invalid coordinates, broken references, nonmonotonic stop times, invalid calendars and direction mismatches fail validation.

## What is real, estimated, and unavailable

| Area           | Current behavior                                                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Venues         | 16 real Cornell/Ithaca places. Source links included. Coordinates and costs are approximate. `source-reviewed` means the listing was reviewed, not every detail independently verified.                  |
| Hours          | Johnson Museum published weekly hours and October 13, 2026 closure are entered. Other hours are unknown, explicitly shown as unverified. Results with unknown hours are conditional suggestions.         |
| Prices         | Estimated spending for two; not current menus or guaranteed totals. No reservations or purchases.                                                                                                        |
| Dietary needs  | Stored and supplied to AI; no dietary guarantees. Venue tags are empty until manually verified. Users must confirm ingredients/cross-contact.                                                            |
| Walking        | Dijkstra over a small curated estimate graph, with conservative times at 65 m/min. **Not field-verified. No fabricated route lines.** No automatic arbitrary-point snapping beyond 30m of a known place. |
| Maps           | Client-only Leaflet and standard OSM raster tiles with visible attribution. No offline prefetching. Public tiles have no uptime guarantee.                                                               |
| Bus            | Direct-trip engine implemented. Real schedule files are empty, so real bus results are disabled and walking is used. Fictional schedules are confined to tests. No real-time tracking.                   |
| Weather        | Open-Meteo daily forecast when inside the 16-day window. Otherwise “Forecast unavailable.” API failure never blocks planning.                                                                            |
| xAI            | Optional interpretation, venue-ID suggestions and wording of validated results. Local planning works without it. No live xAI call was made during implementation.                                        |
| Photon         | Stable Spectrum SDK worker, inbound planning, follow-ups, pairing and delivery-attempt state implemented. Requires a user-activated project and line; no live delivery tested.                           |
| Supabase / ORS | Optional adapters implemented; no live account or key was configured or tested.                                                                                                                          |

The app cannot verify street accessibility, temporary closures, slopes, transit changes or holiday exceptions that have not been entered. The graph needs an on-foot route audit before use as verified navigation. Outdoor activities are weather-dependent. Forecasts describe the start date; a trip crossing midnight may need a second day's forecast checked manually.

## xAI text setup

1. Create a server API key in your existing xAI account; use existing credits only.
2. Set `XAI_API_KEY` and `XAI_MODEL` in `.env.local`. The verified model default is `grok-4.7`; change it to another model available to your account if needed.
3. Restart the web server and worker. The website's optional text-to-form input appears when a key is configured.

Uses the documented `POST https://api.x.ai/v1/chat/completions` endpoint (still supported but labeled legacy in current docs), JSON output, Zod validation, a 12-second timeout, 1,200 output-token cap and **no automatic retry**. A planning request uses at most two sequential calls (candidate suggestions, then wording of valid results). Interpretation is one additional explicit call. Default shared durable quota: 30 attempts/day; `XAI_DAILY_CALL_LIMIT` can lower it and is capped at 100. This is an application request cap, not a dollar guarantee; check your account budget separately. The model never controls cost arithmetic, hours, scheduling or ownership. Unknown IDs and malformed responses fall back to local planning.

## Photon / Spectrum setup — Stable documentation

This implements the documented **Stable** `@spectrum-ts/core` and `@spectrum-ts/imessage` API, not a guessed webhook endpoint or an unofficial iMessage bridge.

1. Visit the [Photon dashboard](https://app.photon.codes/) yourself. Your supplied hackathon instructions advertise promo code `HACKWITHPHOTON` for a month of Pro; its current eligibility has not been independently tested. Do not attach a card or activate a paid plan for this project. If onboarding asks for payment, stop and ask the organizers for the hackathon path.
2. Create your project and connect its managed iMessage line in the dashboard.
3. Copy the project credentials into `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET`. Set `PHOTON_AGENT_ADDRESS` to the connected line's address.
4. Keep the web app running, then in another terminal in the **same directory**:

```bash
npm run worker:photon
```

5. Message the connected line. With xAI, natural language is interpreted and missing required fields are requested. Without xAI, the following complete typed format works:

```text
start=arts-quad; date=2026-10-03; time=13:00; duration=180; budget=50; vibe=Cozy; transport=walk
```

Follow-ups: `make it cheaper` (reduces the budget by $15), `start time 14:30`, `make it indoors`, `regenerate`. A follow-up creates a fresh immutable share link; earlier shared plans remain readable. Conversation criteria and current share ID persist across restarts. Only direct messages are handled; group messages and outbound echoes are ignored.

**Send to myself:** save in the creator browser, choose “Send to myself,” then send `pair CODE` from your own iMessage account to the agent. Codes are random, one-use, and expire after 10 minutes. The worker replies only to that authenticated inbound conversation. No arbitrary phone-number sending endpoint exists. Use “Check pairing status” to inspect the attempt. `accepted` means Spectrum returned a message ID, **not** independently verified handset delivery. `unknown` or `failed` never appears as “sent.”

The SDK owns the authenticated project connection and message stream; no public webhook route is exposed. The worker is a long-lived process and must not be placed inside a serverless request handler. Run one worker per project/storage set. On connection startup failure, fix dashboard/credentials and restart. Incoming event IDs are durably claimed before handling. Ambiguous outbound failures are deliberately not automatically retried, preventing duplicate replies. Retry with a new inbound message or new pairing code. A process crash after claiming an event may lose that reply; exactly-once delivery across the remote send boundary is not promised. Full provider receipt/reconciliation support remains future work.

The worker and web app share SQLite locally, or the same Supabase table. The returned web link uses `APP_URL`. `localhost` links cannot open on someone else's phone. Live phone-to-web demos need a reachable URL, which requires a separate hosting/tunneling request; this implementation has not exposed a server publicly.

### Local messaging transport

```bash
npm run chat:local
```

This terminal transport exercises the same handler, criteria, planner, conversation storage and deduplication without delivering any iMessage. It clearly labels local output. It is separate from Spectrum's actual connection and is not proof of live integration.

## Optional walking provider

`ORS_API_KEY` enables the documented OpenRouteService `foot-walking/geojson` endpoint. Route responses are validated, cached within each planning request, and limited to 12 external route calls per request, with a 3.5-second timeout. Failure falls back to the local graph. `DISABLE_EXTERNAL_APIS=true` disables it. Only actual provider geometry is drawn.

The current ORS plan page redirects to HeiGIT account plans; no-card signup could not be independently established without onboarding. The adapter is implemented but unactivated. Use only a confirmed free/no-card key obtained by you; do not add billing. [Provider docs](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/) · [Plans](https://account.heigit.org/info/plans).

Tiles can be changed with `NEXT_PUBLIC_MAP_TILE_URL` and `NEXT_PUBLIC_MAP_ATTRIBUTION`. Use a trusted provider URL and its required attribution. The default complies with normal browser caching and has no bulk download/offline mode. [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Optional Supabase

Use a Supabase project you activate yourself on a confirmed free plan. Run `supabase/migrations/001_storage.sql` in its SQL editor, then set server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Restart both processes. RLS is enabled with no anonymous/client policies. Only the application server may access the records table. Never prefix the service credential with `NEXT_PUBLIC_`.

The small adapter stores JSON records in Postgres rather than introducing a separate schema for every MVP entity. Uniqueness provides atomic event claims. Existing SQLite records are not automatically migrated. Local SQLite at `.local/navidate.sqlite` survives development-server restarts and is **unsuitable for ephemeral serverless disk**. Back up the database if keeping important plans.

## Data maintenance

Edit `data/places.json`, keeping IDs stable. Set unknown `openingHours` to `null`. Weekly keys use ISO weekdays (Monday=1, Sunday=7); windows use `HH:mm`. Closing at/before opening means the following day. `exceptions` override the corresponding calendar date. Never mark verification complete without checking the source and the location. Prices are estimates for **two**. Dietary tags must be evidence-backed.

Walking connectivity lives in `data/walking/graph.json`. Nodes currently reference place IDs. Review paths on foot, record source/verification metadata and add real geometry through the routing interface before claiming verified paths. Arbitrary points without a reliable route return an explanation and a supported-landmark suggestion.

For manually entered buses, fill:

- `data/transit/stops.json`: `id`, `name`, `coordinates`, source/verification fields.
- `routes.json`: `id`, `number`, `name`, `direction`, `fareForTwo`, metadata.
- `trips.json`: `id`, `routeId`, `serviceId`, `direction`, a complete ordered `stopTimes: [{stopId,time}]`, metadata.
- `service-calendar.json`: `id`, `weekdays`, `start`, `end`, `exceptions: {"YYYY-MM-DD": true|false}`, metadata.

All transit records include `sourceUrl`, `verifiedAt`, `demo`. Use `demo:false` only for verified service. Stops must connect to supported graph nodes (within 30m of the corresponding known place), or extend the walking lookup first. Each trip's times must strictly increase; hours through `47:59` represent service-day times after midnight. A boarding buffer of five minutes is applied. Direct trips only, no transfers. Fare estimates are for two riders; no Cornell affiliation is assumed. No route shape is supplied, so no bus line is drawn. Fictional examples live in `tests/fixtures/transit.json` and are never loaded as real schedules.

Run `npm run validate:data` after changes, and planner tests before the demo. See [architecture and assumptions](docs/architecture.md), [team work split](docs/team.md), [demo script](docs/demo.md), and [documentation sources](docs/sources.md).
