# Documentation and data sources

Reviewed during implementation on 2026-10-02. Package versions are locked in `package-lock.json`; installed package types and the bundled Next.js documentation were also consulted. These are references, not claims of live API testing.

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) and bundled `node_modules/next/dist/docs` for current server/client boundaries and route handlers.
- [Leaflet 1.9 reference](https://leafletjs.com/reference.html): tile layers, markers, bounds, map cleanup and `invalidateSize`.
- [OSM raster tile policy](https://operations.osmfoundation.org/policies/tiles/): visible attribution, normal caching, no bulk/offline fetching, no guaranteed availability.
- [Open-Meteo forecast API](https://open-meteo.com/en/docs): daily weather, time zone and forecast window.
- [xAI model catalog](https://docs.x.ai/developers/models), [structured outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs), [Chat Completions](https://docs.x.ai/developers/model-capabilities/legacy/chat-completions).
- Photon **Stable**: [introduction](https://photon.codes/docs/spectrum-ts/introduction), [getting started](https://photon.codes/docs/spectrum-ts/getting-started), [message direction/IDs](https://photon.codes/docs/spectrum-ts/messages), [spaces and users](https://photon.codes/docs/spectrum-ts/spaces-and-users), [managed iMessage provider](https://photon.codes/docs/spectrum-ts/providers/imessage). Hackathon promo information came from the user's supplied organizer instructions, not an independently activated account.
- [Supabase upsert](https://supabase.com/docs/reference/javascript/upsert).
- [OpenRouteService directions](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/). The plan page redirected to a client-rendered HeiGIT account page; no-card eligibility remains unverified.
- [Johnson Museum visitor information](https://museum.cornell.edu/about/visit/): location, admission, published hours and the dated closure.
- [Cornell Arts Quad](https://events.cornell.edu/arts_quad), [Botanic Gardens](https://cornellbotanicgardens.org/visit), [Ithaca Commons](https://www.downtownithaca.com/visit-downtown/the-commons/), [Alley Cat Cafe](https://www.alleycatithaca.com/).
- [Downtown Ithaca venue directory](https://www.downtownithaca.com/directory/cafe-coffeeshops/): existence and addresses of downtown cafés/food stops. Descriptions are original brief activity suggestions; prices, coordinates and durations are original estimates. No venue photography was copied.

The project uses original CSS/SVG category illustrations and Lucide icons, with no generated or scraped venue photos.
