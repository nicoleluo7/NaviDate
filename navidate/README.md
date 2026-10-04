# Navidate

**Turn “What should we do?” into a date.** A single TypeScript application for Cornell and Ithaca, built for BigRed//Hacks. Next.js, React, Tailwind, Leaflet (fallback map), Google Maps, Zod, SQLite, optional Supabase, Gemini, xAI and Photon Spectrum.

## Run locally

Use **Node 24** (the repository includes `.nvmrc`). Run these commands from `navidate/`:

```bash
nvm use
npm ci
# First-time setup only: keep your existing .env.local if you have one.
cp -n .env.example .env.local
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

Choose Johnson Museum or Cornell Arts Quad, October 2, 2026 at 13:00 New York time, 3 hours, $50, any setting, and walking. Generate, select a plan, click stops and map markers, try another place for a stop, and save. The share link at `/date/[shareId]` is read-only.

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

Vitest uses fictional fixtures and blocks external APIs. Playwright covers the form, results, map markers, persistence, public share URL, unauthorized editing, impossible constraints, and a 375px mobile viewport. It starts an isolated server on port 3100 with a separate build directory, disabled external providers and mocked tile responses. Tests never consume xAI credits or send real iMessages. Browser screenshots are in ignored `test-results/`.

The validator prints missing verification dates and unknown hours as warnings, not invented values. Schema failures, duplicate IDs, invalid coordinates, broken references, nonmonotonic stop times, invalid calendars and direction mismatches fail validation.

## What is real, estimated, and unavailable

| Area           | Current behavior                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Venues         | Live discovery from Google Places (up to 60 nearby results across food and activity categories per request). The 26-place JSON catalog is used only in explicitly labeled local mode. No provider promises an exhaustive listing of every place. |
| Hours          | Google regular opening periods are checked against each entire activity, including overnight periods. Unknown hours remain labeled; holiday changes and admission are not guaranteed. Local mode uses curated hours where available.             |
| Prices         | Estimated spending for two; not current menus or guaranteed totals. No reservations or purchases.                                                                                                                                                |
| Dietary needs  | Stored and supplied to AI; no dietary guarantees. Venue tags are empty until manually verified. Users must confirm ingredients/cross-contact.                                                                                                    |
| Walking        | Google walking route duration, distance and actual provider geometry for live plans, including GPS starts. Missing routes reject a live candidate. Local mode uses a small estimate graph without fabricated route lines.                        |
| Maps           | Google Maps JavaScript API when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set, with pins and a route polyline from the Routes API. Leaflet + OSM tiles remain the fallback when that key is missing. Attribution is shown.                            |
| Gemini         | Chooses ordered combinations from discovered Place IDs using structured output. Code checks constraints. Live failures show a retryable error, never silently substitute local recommendations.                                                  |
| Bus            | Direct-trip engine implemented. Real schedule files are empty, so real bus results are disabled and walking is used. Fictional schedules are confined to tests. No real-time tracking.                                                           |
| Weather        | Open-Meteo hourly forecast for the selected date and time within its 16-day window. Otherwise “Forecast unavailable.” API failure never blocks planning.                                                                                         |
| xAI            | Navi’s realtime voice conversation and optional text interpretation. Gemini alone selects live date combinations. Browser tokens expire; the permanent key stays server-side.                                                                    |
| Photon         | Stable Spectrum SDK worker, inbound planning, follow-ups, pairing and delivery-attempt state implemented. Requires a user-activated project and line; no live delivery tested.                                                                   |
| Supabase / ORS | Optional adapters implemented; no live account or key was configured or tested.                                                                                                                                                                  |

The app cannot verify street accessibility, temporary closures, slopes, transit changes or holiday exceptions that have not been entered. The graph needs an on-foot route audit before use as verified navigation. Outdoor activities are weather-dependent. Hourly forecasts cover the full date window, including midnight crossings. Rain, snow, strong wind, freezing temperatures and heat favor indoor stops; forecast storms exclude outdoor activities. Walking remains weather-dependent. Saved dates retain a timestamped forecast snapshot; regenerate to refresh it.

## Navi voice and text setup

Set `XAI_API_KEY` in `navidate/.env.local`. `XAI_VOICE_MODEL` defaults to `grok-voice-latest`; `XAI_MODEL` is for optional typed interpretation. Restart the dev server after changes.

Tap **Talk to Navi** to explicitly allow microphone access. Navi uses the app logo and asks for start location, New York date/time, duration, budget for two, vibe and transport. She summarizes those details and asks for confirmation before submitting them to the same Gemini planner as the form. Partial, invalid, unknown-location and DST-ambiguous handoffs are rejected. Microphone denial, disconnection, stop and unmount release audio resources. The visible transcript is kept only in component memory; raw audio is sent to xAI and is not stored by Navidate.

The server issues a 60-second ephemeral connection token with `/v1/realtime/client_secrets`. The browser connects to xAI's documented realtime WebSocket, captures PCM audio with AudioWorklet, plays the response and handles a validated `submit_requirements` tool. No permanent API key reaches the browser. Default application caps: `XAI_VOICE_DAILY_SESSION_LIMIT=10` token attempts per day and three minutes per browser conversation. These are app safeguards, not provider-side spending guarantees. Text interpretation retains `XAI_DAILY_CALL_LIMIT=30`.

Microphone and GPS require **HTTPS or localhost**. A phone opening `http://192.168…:3000` cannot use them; choose a landmark/map point or use a secure origin. No tunnel or deployment is created automatically.

With the configured dev server running, test voice without using a real microphone or spending credits:

```bash
npm run test:voice
```

These two Playwright tests mock microphone, xAI WebSocket, token and planning requests. They verify an incomplete handoff followed by a valid one, duplicate tool events, resource cleanup and denied microphone permission. Real speech comprehension/playback still needs a human microphone test.

## Gemini + Google Maps setup

1. Set `GEMINI_API_KEY` and an available structured-output model in `GEMINI_MODEL` (default `gemini-2.5-flash`; the configured `gemini-3.5-flash-lite` was live-tested).
2. Enable **Maps JavaScript API**, **Places API (New)** and **Routes API** in your billing-enabled Google project. This project does not activate services, attach a payment card or change your account limits.
3. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to a browser key restricted to your web referrers and Maps JavaScript API. Set `GOOGLE_MAPS_API_KEY` to a separate server key restricted to Places API (New) and Routes API. The server never falls back to the browser key.
4. Optionally set `NEXT_PUBLIC_GOOGLE_MAP_ID`; advanced markers use Google's `DEMO_MAP_ID` for local demos. Restart the app after changing browser settings.

The live pipeline makes two bounded Nearby Search requests (food and complementary activities), merges/deduplicates operational places within Ithaca, filters structured preferences, then asks Gemini for up to six candidate sequences. It rejects unknown IDs and duplicate stops. There are at most two sequential Gemini calls: initial recommendations and one repair using schedule rejection reasons if none fit. `GEMINI_DAILY_CALL_LIMIT` defaults to 30 planning attempts per day (at most 100). Routing is cached within a request and capped at 24 directed legs. No route matrix over the entire city is requested.

Gemini chooses order, activity descriptions and estimated activity lengths. It cannot replace provider coordinates or lower the estimated cost to make a candidate pass. Costs are category/price-level budget allowances for two, not verified menu prices; activity times remain estimates. Regular hours, available duration, walking distance, budget, weather, and known bus schedules are checked in code. Swaps rediscover places, ask Gemini for an alternative, preserve other stops and recalculate the full itinerary. Saved weather is a snapshot; regenerate for refreshed weather.

Live provider failures display an error with the form preserved. Unconfigured providers or `DISABLE_EXTERNAL_APIS=true` use clearly labeled local suggestions. Buses still require manually entered verified schedules: Google transit durations are never mislabeled as walking or assigned a zero fare. The map renders only provider route geometry; it never draws invented walking lines.

Live verification completed with the existing keys: nearby discovery returned 38 places (34 with regular hours), Gemini generated feasible combinations, Google Routes returned geometry and durations, and the mobile Google Map loaded/selectable markers. xAI accepted an ephemeral token and Navi's voice/tool session configuration. No real iMessage or microphone conversation was performed by the automated checks.

## Photon / Spectrum setup — Stable documentation

This implements the documented **Stable** `@spectrum-ts/core` and `@spectrum-ts/imessage` API, not a guessed webhook endpoint or an unofficial iMessage bridge.

1. Visit the [Photon dashboard](https://app.photon.codes/) yourself. Your supplied hackathon instructions advertise promo code `HACKWITHPHOTON` for a month of Pro; its current eligibility has not been independently tested. Do not attach a card or activate a paid plan for this project. If onboarding asks for payment, stop and ask the organizers for the hackathon path.
2. Create your project and connect its managed iMessage line in the dashboard.
3. Copy the project credentials into `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET`. Send to myself registers each visitor’s iMessage number with Photon, so you do not add people in the dashboard or set one shared agent address.
4. Keep the web app running, then in another terminal in the **same directory**:

```bash
npm run worker:photon
```

5. Message the connected line. With xAI, natural language is interpreted and missing required fields are requested. Without xAI, the following complete typed format works:

```text
start=arts-quad; date=2026-10-03; time=13:00; duration=180; budget=50; vibe=Cozy; transport=walk
```

Once a date is saved, texts ask about that plan. Changes to the time, budget, or stops are made in the web planner; a text does not rebuild it. Conversation criteria and the current share ID persist across restarts. Only direct messages are handled; group messages and outbound echoes are ignored.

**If “Send to myself” is disabled:** use `navidate/.env.local` (next to `package.json`), and fill in `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET`. Restart the web server and Photon worker after environment changes, refresh the page, and save your itinerary before pairing. Keep the worker running to receive the pairing message.

**Send to myself:** save in the creator browser, enter the phone number that iMessage uses, and choose “Send to myself.” The server registers that number on the Photon project (`type: "shared"`). Photon returns the pool number assigned to it, and Messages opens a text to that number with `pair CODE` ready. Press Send from that phone. Entering the same number again returns the same Photon user. After that reply, you can ask about the saved date, including follow-ups like “and after that?”. The pairing text and later answers are short messages. With `GEMINI_API_KEY` configured, Gemini answers itinerary questions using the saved facts. Venue questions such as “what would you recommend there?” use bounded Google Search grounding with source links; when lookup fails, Navi offers an honest helpful fallback. Grounded search uses the existing Gemini account and counts toward the shared daily call cap; provider search pricing/quotas apply. No billing service is activated by this app. If the key is missing or Gemini does not answer in time, the same questions fall back to local replies: what time, how much, where, the weather, or the link. Do not add billing to the Google project. Codes are random, one-use, and expire after 10 minutes. The worker replies only to that authenticated inbound conversation. The site does not text the phone by itself. Use “Check pairing status” to inspect the attempt. `accepted` means Spectrum returned a message ID, **not** independently verified handset delivery. `unknown` or `failed` never appears as “sent.”

The SDK owns the authenticated project connection and message stream; no public webhook route is exposed. The worker is a long-lived process and must not be placed inside a serverless request handler. Run one worker per project/storage set. On connection startup failure, fix dashboard/credentials and restart. Incoming event IDs are durably claimed before handling. Ambiguous outbound failures are deliberately not automatically retried, preventing duplicate replies. Retry with a new inbound message or new pairing code. A process crash after claiming an event may lose that reply; exactly-once delivery across the remote send boundary is not promised. Full provider receipt/reconciliation support remains future work.

The worker and web app share SQLite locally, or the same Supabase table. Messages use `PUBLIC_APP_URL`, defaulting to `https://navidate.us`, independently of the local `APP_URL`. The deployed website and worker MUST read the same storage for new share links to resolve. Local SQLite records are not uploaded by changing the public URL. Restart the Photon worker after pulling changes or editing environment variables. This change does not deploy anything.

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

### October 3 UI and editing update

Choose Food, Coffee, Something sweet, Outdoors, or Surprise me. A specific date type requires at least one matching stop; complementary activities can still appear. The same requirement applies to swaps. Existing saved criteria default to Surprise me.

The homepage restores your most recently saved date in the same browser. Its creator-only “Edit this date” action also returns to the homepage. Reloading creates a fresh editing draft; public share IDs never grant edit access. Use “Plan a new date” for a separate itinerary. Successful swaps update the existing share URL automatically; failed saves keep the association and offer Retry save. Unsaved edits themselves are not recovered after a reload—only the last successfully saved version is restored. Clearing the creator cookie still loses editing access.

The expanded list includes three Gimme! locations, Moosewood, Viva, Bickering Twins, Purity, Ithaca Bakery, Saigon Kitchen, and DeWitt Park. New coordinates, durations, prices and walking connectivity are estimates. Reviewed opening hours are recorded only where clear; unknown or conflicting hours remain null. No new walking geometry is claimed.

The form now uses React Aria Components for keyboard-accessible buttons, dropdowns, a calendar popover, and an AM/PM time field with quarter-hour suggestions. Any exact minute can still be typed. Escape dismisses menus and restores focus. The warm cream/coral theme lives in `src/app/controls.css`. The user-supplied two-pin heart logo is retained unchanged in `public/navidate-logo.png`.

Weather uses the [Open-Meteo forecast API](https://open-meteo.com/en/docs), with no API key. Wet-weather ranking starts at a 60% precipitation chance, 0.5 mm precipitation per hour, or any snow. These are planning heuristics, not safety guarantees. Missing hourly coverage and API failures show “Forecast unavailable” and allow planning to continue.

### Restaurant selection and Navi’s voice
Food searches reserve a separate Google Places request for restaurants so cafés cannot crowd them out. **Browse restaurants** searches near the starting point and downtown Ithaca, lets you filter by name, and pins a chosen restaurant into the planning request. This bounded list is not every restaurant in Ithaca. Prices remain estimates; feasibility checks still enforce hours, budget and travel.

Navi uses Ara with a gentle, unhurried speaking instruction. The logo reacts to output audio amplitude, and interruptions stop playback. Reduced-motion mode keeps the logo still. Voice appearance and handoff are tested with mocked audio; the subjective voice quality needs a real listening check.

### Natural iMessage planning and GPS
Start directly in chat: “Tomorrow at 7pm, from the Commons.” Navi asks one friendly question at a time for a missing starting point, day or time. Omitted budget, walking distance and mood have no preference constraint; date type and setting default to any. An omitted duration uses a disclosed three-hour planning window, with walking and available direct buses considered. The supported Ithaca area, real hours and travel feasibility still apply. Explicit limits take precedence, and “any budget” clears a previous budget limit.

“Use my current location” returns `/location` on the public host. The user explicitly taps the browser location button, then sends the coordinates using Messages or copies them. Full Apple/Google map links containing coordinates and Spectrum rich-link messages are accepted. Shortened links/native attachments without coordinates receive a location-page fallback; they are not silently geocoded. Coordinates become a private start used in Google directions, redacted from public itineraries. HTTPS and a configured `PHOTON_AGENT_ADDRESS` are needed for the live phone flow.

Opening messages contain a short summary and a Google Maps walking route built from stop names and addresses. A stop that is the same place as the start is not listed twice. Place ids stay out of that link so Maps does not label a stop `place_id:`. The public itinerary stays on the website. Messages already delivered cannot be changed by restarting the worker.
