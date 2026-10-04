# Navidate

**A date plan you can walk, share, and text.**

[navidate.us](https://navidate.us) plans a date around Cornell and Ithaca. You pick a start, a time, a budget, and a mood. Gemini turns nearby Google Places into a timed itinerary. The Grok Voice API lets you say those details out loud. Photon keeps the saved plan in iMessage, so you can ask when a stop closes or where you should be without opening the site again.

Built for BigRed//Hacks with Next.js, React, TypeScript, Google Maps, and Tailwind. Leaflet remains the map when a browser Maps key is absent.

## Hackathon tracks

### SpaceX Track — Make it Legendary

The project was built in Cursor. Navi’s voice uses the **Grok Voice API**:

- Model `grok-voice-latest`, voice Ara, with a calm one-question-at-a-time instruction.
- `POST /api/voice/session` issues a 60-second ephemeral token from xAI `/v1/realtime/client_secrets`. The permanent `XAI_API_KEY` stays on the server.
- The browser streams PCM audio over xAI’s realtime WebSocket. The logo reacts to her output level.
- When you confirm, Navi calls `submit_requirements`. Invalid or incomplete handoffs are rejected. Confirmed details go to the same Gemini planner as the form.

Daily voice sessions are capped in the app (`XAI_VOICE_DAILY_SESSION_LIMIT`, default 10). That cap is an application safeguard.

### Photon Track — Agents in iMessage

Navi in Messages is a Photon agent on the stable Spectrum SDK (`@spectrum-ts/core` and `@spectrum-ts/imessage`):

1. Save a date on the site. **Send to myself** registers that iMessage number on the Photon project and opens Messages with `pair CODE`.
2. The worker (`npm run worker:photon`) claims the inbound text and replies with the time, the stops, the cost, the weather, and a Google Maps walking route. A stop that repeats the starting place is listed once. The public itinerary stays on the website.
3. Follow-ups about the saved plan are answered locally: hours (“Cornell Dairy Bar is open 12 PM to 7:30 PM.”), address, when to leave, what’s next, and where you should be right now.
4. Open questions, such as a menu or a recommendation, go to Gemini once. If lookup fails, Navi says so.
5. A text cannot rebuild the date. Time, budget, and stop changes happen in the web planner.

Codes are random, single-use, and expire after 10 minutes. `accepted` means Spectrum returned a message id. The worker is a long-lived process and shares storage with the website, so a paired date resolves on the same Supabase table the deployed site uses.

### MLH — Best Use of Gemini API

Gemini (`GEMINI_MODEL`) is how a date gets chosen:

- Two bounded Nearby Search calls gather food and activities around the start. **Browse restaurants** can pin a specific place into that set.
- Gemini returns up to a few ordered itineraries as structured JSON. Code checks place IDs, hours, budget, weather, and Google route time. A failed candidate can be repaired once with the rejection reasons. It is never silently replaced by the local catalog.
- A swap rediscovers places, asks Gemini for one alternative, and recalculates the whole itinerary.
- iMessage venue questions use Gemini with Google Search grounding and source-aware fallbacks. Saved-plan facts skip Gemini so those replies are not waiting on a model.

`GEMINI_DAILY_CALL_LIMIT` defaults to 30. Costs and visit lengths stay estimates. Hours come from Google’s regular periods when the live planner is on.

### MLH — Best Domain Name from GoDaddy Registry

The live site is **[navidate.us](https://navidate.us)**. `PUBLIC_APP_URL` defaults to that host, so share links (`/date/[shareId]`), the “use my current location” page, and texts agree on one address. The creator’s edit session is an HTTP-only cookie on that site. The share link itself is view-only.

## Try the product

On [navidate.us](https://navidate.us), or locally:

1. Choose a Cornell or Ithaca start, a date and time, about three hours, a budget for two, and walking or driving. **Talk to Navi** can collect the same fields by voice.
2. Generate, open a plan, and select stops on the timeline and the map. Try another place for one stop.
3. Save. Open the share link in a private window to see the read-only page.
4. With the Photon worker running, send the plan to your phone, press Send on `pair CODE`, then ask “what’s next?”, “when does it close?”, or “where should we be?”.

Food, coffee, something sweet, outdoors, or surprise me can require a matching stop. Dietary notes are passed to the planner and are not a guarantee about a kitchen. Prices are estimates for two. Weather is an Open-Meteo snapshot for the planned window. Rain, snow, wind, and extreme temperatures steer the plan indoors. A missing forecast still lets planning continue.

## Run locally

Use **Node 24** (`.nvmrc`). From `navidate/`:

```bash
nvm use
npm ci
cp -n .env.example .env.local
npm run dev
```

Open http://localhost:3000. With no keys, planning uses the labeled local catalog. `DISABLE_EXTERNAL_APIS=true` turns off weather, routing, and AI calls. Map tiles still load in the browser.

```bash
npm run build
npm start
```

Hosted dates use Supabase (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, table from `supabase/migrations/001_storage.sql`). Local dates use SQLite at `.local/navidate.sqlite`. The website and the Photon worker have to use the same store or a new share link will not resolve in a text.

### Voice

Set `XAI_API_KEY`. `XAI_VOICE_MODEL` defaults to `grok-voice-latest`. Restart the dev server after changes. Microphone access needs HTTPS or localhost.

```bash
npm run test:voice
```

Those Playwright tests mock the microphone, the xAI socket, the token, and planning. They check an incomplete handoff, a valid one, duplicate tool events, cleanup, and a denied microphone.

### Gemini and Google Maps

1. Set `GEMINI_API_KEY` and `GEMINI_MODEL`.
2. Enable Maps JavaScript API, Places API (New), and Routes API on a billing-enabled Google project.
3. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is the browser key (Maps JavaScript, restricted by referrer). `GOOGLE_MAPS_API_KEY` is the server key (Places and Routes). The server does not fall back to the browser key.
4. Optional `NEXT_PUBLIC_GOOGLE_MAP_ID`. Advanced markers use `DEMO_MAP_ID` when it is unset.

The live path asks Gemini for candidate sequences, drops unknown IDs and duplicate stops, and draws only provider route geometry.

### Photon

1. Create a project in the [Photon dashboard](https://app.photon.codes/) and connect its managed iMessage line. Hackathon instructions include promo code `HACKWITHPHOTON`.
2. Set `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET` in `navidate/.env.local`.
3. Keep the web app running, then in another terminal in the same directory:

```bash
npm run worker:photon
```

Restart the worker after code or environment changes. It loads the messaging code once at startup. Only direct messages are handled. Group chats and the agent’s own outbound texts are ignored. Incoming event IDs are claimed before a reply is sent, so a duplicate delivery does not send twice.

```bash
npm run chat:local
```

That terminal runs the same handler without sending an iMessage.

### Checks

```bash
npm run validate:data
npm run test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest uses fixtures and blocks external APIs. Playwright covers the form, results, map markers, saving, the public share URL, unauthorized editing, and a 375px layout. Tests do not spend xAI credits or send iMessages.

## More detail

- [Architecture](docs/architecture.md)
- [Three-minute demo](docs/demo.md)
- [Team split](docs/team.md)
- [Documentation sources](docs/sources.md)

Venue records for local mode live in `data/places.json`. Hours use ISO weekdays and `HH:mm` windows. Unknown hours stay unknown. Walking connectivity for local mode is `data/walking/graph.json`. Real bus schedules are empty, so live planning walks or drives. Fictional transit fixtures stay in tests.
