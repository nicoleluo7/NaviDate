# Architecture and assumptions

One Next.js App Router app and one optional Spectrum worker, all TypeScript. No login, Python service, queue infrastructure, or monorepo. Client components handle forms, Google Maps (Leaflet fallback) and Navi voice; server modules own credentials, feasibility, authorization and storage.

```text
Form / typed preferences ───────┐
Navi ↔ Grok voice → confirmed ──┼─ criteria → weather + Google Places discovery
Spectrum worker ───────────────┘                          ↓
                                           Gemini chooses ordered Place IDs
                                                          ↓
                                       Routes + hours + budget + weather checks
                                                          ↓
                                       validated options → draft → save/share
```

`src/types` defines Zod contracts. `lib/planner` owns candidate generation, schedules and hours. `lib/routing` exposes a walking interface and estimate-graph fallback. `lib/transit` owns calendars and direct-trip matching. `lib/integrations` validates provider responses. `lib/messaging` owns pairing, durable conversation context and idempotency. `lib/storage` is a four-operation durable interface (`get`, `put`, atomic `claim`, `remove`). Its atomic claim has the same behavior under SQLite and a Postgres primary-key constraint.

## Feasibility boundary

Live mode discovers up to 60 venues and checks at most six Gemini candidates per attempt (two attempts maximum). Local fallback considers at most 12 venues and 300 sequences; each sequence has two or three distinct stops. Diverse results cannot be permutations of an identical venue set. Ranking favors the requested vibe, category variety and shorter walking. The planner is heuristic, not an exhaustive optimizer; it may miss a feasible combination outside the bounded pool. Live mode never pads Gemini results with local candidates. Unknown IDs, repeated full meals/cafés, infeasible travel lower bounds, invalid routes, and schedule failures are rejected without deleting stops. Costs are category/Google price-level allowances, not model arithmetic. Unknown opening hours are allowed with a visible material-uncertainty warning. Cost feasibility means estimated spending, not a promise about final prices.

Temporal resolves all wall-clock input in America/New_York. Nonexistent and repeated times at DST transitions are rejected instead of silently choosing an offset. Elapsed travel and activity minutes operate on instants. Bus service times over 24:00 are mapped to the appropriate next calendar day, retaining the original service date. Candidates consider preceding, current and next service days. Ambiguous DST bus times are skipped. Opening windows can cross midnight; exception dates override weekly hours. Midnight travel is rendered with both dates.

## Ownership and privacy

Generating a draft issues an HTTP-only creator cookie. Draft ownership is checked before swap/save; saving only accepts a server-issued plan ID, not client-authored plan data. Private edit tokens never appear in URLs. Public APIs and pages contain only a sanitized plan. Precise private starts and initial/return geometry are redacted. No conversation, owner hash or phone number is exposed.

Same-origin mutations are checked, cookies use SameSite=Strict, and production cookies are Secure. Public mutation inputs are Zod-validated and limited to 16KB. A durable global 40-mutation-per-minute limit suits one hackathon instance; a per-user/IP distributed limiter and record retention/cleanup would be appropriate before public operation. xAI additionally has a shared durable daily attempt cap. The local database contains private criteria and should be treated as application data.

## Messaging failure semantics

Only authenticated SDK-stream direct text messages are processed. Event claims prevent duplicate responses across concurrent calls/restarts. Pairing binds through an incoming message and consumes a one-use code. Outbound status is accepted, failed or unknown, never a fake delivered receipt. The send boundary cannot be made atomic with the local database; automatic retries after an ambiguous send are omitted. Users can send a new request or generate another pairing code. One worker processes incoming messages serially, preventing local conversation races. Multiple workers per project are unsupported in this version.

## Deliberate limitations

The local graph has curated connectivity and estimated distances but needs field verification. No street-following line is invented. Venue coordinates are approximate and most hours remain unknown. Bus schedules are not seeded. Weather uses validated Open-Meteo hourly timestamps and the itinerary’s actual elapsed-time window, including overnight and DST transitions. Conditions rank indoor stops higher; thunderstorms or strong winds exclude outdoor activities. Missing coverage falls back honestly. Saved plans retain forecast snapshots for schedule recalculation. Dietary preferences and free text are soft preferences, never guarantees. Navi uses ephemeral xAI WebSocket credentials, browser AudioWorklet PCM and a Zod-validated requirements tool. Voice gathers requirements only; Gemini owns live recommendations. Stop/unmount/disconnection closes the socket, audio context and microphone tracks. The browser enforces a three-minute session; token quotas are durable.

Google Places, Gemini recommendations, Google Routes and mobile Maps were live-checked. xAI voice authentication/session configuration was live-checked, but real microphone conversation still needs manual testing. Supabase and ORS remain untested live. The default OSM tile server is not an availability SLA. Serving a phone-accessible share URL remains a separate deployment decision.

## Dependency audit

The lockfile pins stable releases. A compatible OpenTelemetry core override (2.11.0) removes the Spectrum dependency's inherited runtime advisory. `npm audit --omit=dev` reports zero vulnerabilities at verification. The full audit still reports five inherited high-severity findings in the Next.js ESLint toolchain (`braces` / `micromatch` / `fast-glob`). npm's proposed fix downgrades the Next.js lint configuration to a different major, so it was not applied. No patched stable `braces` version was available from the registry at verification. These packages run in local lint tooling, not the app's production request path; revisit when upstream releases a compatible fix.

### Resuming and updating saved dates

`creator:last:<owner hash>` stores a pointer to the most recently saved itinerary. `/api/resume` verifies the HTTP-only creator credential before returning private criteria and issues a new one-hour draft. `/?date=<public ID>` selects an itinerary for authorized editing; the query parameter carries no authority. `/api/save` rechecks ownership for updates, and the client retains the share ID after an automatic-save failure. Date types are checked in scheduling, which also covers swaps and messaging-generated plans.

Food discovery has a dedicated restaurant query. An optional restaurantId is resolved against provider data and enforced by both candidate validation and the scheduler. The restaurant browser performs at most two Nearby Search requests, not an exhaustive directory search.

Google directions URLs use names/addresses in waypoints and a parallel waypoint_place_ids list only when every intermediate stop has an ID. Existing saved itinerary links are rebuilt on read/resume. See https://developers.google.com/maps/documentation/urls/get-started.
