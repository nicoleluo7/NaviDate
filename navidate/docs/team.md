# A practical three-person split

1. **Experience and accessibility:** own `components/`, page presentation and `globals.css`. Validate keyboard navigation, focus, 375px layout and marker/timeline selection. Extend the Playwright flow when behavior changes.
2. **Planner and local knowledge:** own `lib/planner`, `lib/routing`, `lib/transit`, `data/` and the validator. Walk the demo paths, confirm venue hours/coordinates and prices, enter a small verified bus timetable and sources. Keep arithmetic and scheduling tests green.
3. **Integrations and persistence:** own `lib/integrations`, `lib/messaging`, `lib/storage`, API handlers and Spectrum worker. Activate Photon personally using the hackathon path, test real inbound pairing, configure xAI with a small quota, and exercise provider failures. Do not deploy or activate billing without a separate request.

Agree on changes to `src/types/index.ts` together. Use `npm ci` and Node 24 across the team. Before merging: typecheck, lint, tests, data validation and a production build. One person runs the complete local demo before the presentation.
