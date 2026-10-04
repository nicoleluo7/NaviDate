# Navidate

**A date plan you can walk, share, and text.**

[navidate.us](https://navidate.us) turns “what should we do?” into a timed itinerary around Cornell and Ithaca. Choose a start, a time, a budget, and a mood. Navi builds the stops, draws them on a map, and stays with you in iMessage after you leave the site.

Built for BigRed//Hacks. The app lives in [`navidate/`](navidate/).

## How it works

1. **Say it or type it.** Talk to Navi with the Grok Voice API, or fill in the form. She collects the start, the New York date and time, how long you have, the budget for two, the vibe, and whether you want to walk or drive.
2. **Gemini plans it.** Nearby Google Places become an ordered date. Application code then checks hours, budget, weather, and the route before anything is shown.
3. **Share it.** Saving creates a public page on navidate.us. The person who saved it can keep editing in that browser. Everyone else gets a read-only itinerary.
4. **Text it.** Send the plan to yourself through Photon. Navi replies in iMessage with the stops and a Google Maps walking route, then answers questions about that saved date: when a place is open, the address, what’s next, and where you should be.

## Hackathon tracks

### SpaceX Track — Make it Legendary

Navidate was built in Cursor. Navi’s spoken conversation uses the **Grok Voice API** (`grok-voice-latest`). The server mints a short-lived realtime token, so the browser never sees the API key. Navi speaks in the Ara voice, asks one question at a time, and calls `submit_requirements` only after you confirm the details. Those details go to the same Gemini planner as the form.

### Photon Track — Agents in iMessage

A Spectrum worker (`npm run worker:photon`) listens on a Photon iMessage line. From a saved itinerary, **Send to myself** registers your number and opens Messages with `pair CODE`. Navi’s first reply is the plan and a Google Maps route built from stop names and addresses. Later texts read the saved date directly, so hours, addresses, and “where should we be?” do not wait on a model. Open questions, such as what to order, still go to Gemini. Changing the time, budget, or stops stays on the website.

### MLH — Best Use of Gemini API

Gemini is the planner. It receives places discovered from Google Places and returns structured itineraries. The app rejects unknown place IDs, duplicate stops, closed venues, and routes that do not fit the clock or the budget. Swapping one stop asks Gemini for a replacement and rebuilds the schedule. In iMessage, venue questions use Gemini with Google Search grounding, and fall back to a straight answer when a lookup fails.

### MLH — Best Domain Name from GoDaddy Registry

The public site is **[navidate.us](https://navidate.us)**. Share links, the location page, and the host Navi uses in texts all live on that domain.

## Run it

```bash
cd navidate
nvm use
npm ci
cp -n .env.example .env.local
npm run dev
```

Open http://localhost:3000. Node 24 is required. The local planner runs with no API keys. Voice, live places, and iMessage need the keys listed in `.env.example`.

Setup, tests, and provider notes: [`navidate/README.md`](navidate/README.md). Demo script: [`navidate/docs/demo.md`](navidate/docs/demo.md).
