# SB prijevoz — web (SvelteKit)

Interactive map + rider trip-planner for the Slavonski Brod GTFS feed, built with
**[SvelteKit](https://svelte.dev/docs/kit)** (Svelte 5) + **Tailwind CSS**, the
**Leaflet** map, and an in-browser Connection-Scan planner. Deploys to Vercel via
`@sveltejs/adapter-vercel`.

## Two modes (top-left toggle, hidden until unlocked)

- **Produkcija** — rider-facing: a Google-Maps-style trip planner (from/to by
  address, map pin, or GPS), top-3 itineraries computed client-side, a per-line
  timetable, and tap-a-stop departure boards.
- **Razvoj** — field/editing tools: live GPS, the PDF tracing overlay, route
  shape tracing, and draggable stop editing with a "✉ Pošalji prijedlog" submit
  to the review queue.

The switcher is hidden from riders; reveal it with **three quick taps on
“Pronađi vožnju”** while from/to are empty (or open `?mode=dev`). Mode default is
Production and persists in `localStorage`.

## Structure

```
src/
  app.css                 # Tailwind + the shared (Google-Maps) styles
  lib/
    data/                 # GENERATED — committed, imported at build time
      data.json           #   stops, routes, line geometry  (build_map.py)
      schedule.json       #   trips, calendar, transfers     (build_map.py, lazy-loaded)
      streets.json        #   street names for fuzzy search   (scripts/build_streets.sh)
    util.js               # haversine, time/string helpers
    geo.js                # Nominatim geocode, Overpass fallback, OSRM routing
    planner.js            # createPlanner(D, SCH) — CSA, timetable, departure board
    geometry.js           # road-following highlight geometry
    stores.js             # shared reactive state
    map/MapController.js   # imperative Leaflet controller (all map features)
    components/            # SearchCard, PlannerResults, ItinCard, Timetable,
                           # StopBoard, LinesPanel, ModeToggle, devtools/*
  routes/
    +page.svelte          # the map app (composition + mobile bottom sheet)
    review/+page.svelte    # token-gated recommendations review queue
    api/recommend/+server.js          # POST: validated + rate-limited submit -> KV
    api/recommendations/+server.js    # GET/PATCH: the review queue (token-gated)
```

The map (`MapController`) is driven imperatively inside `+page.svelte`'s `onMount`
(browser-only — Leaflet is dynamically imported so SSR doesn't choke). UI
components talk to it through methods and observe it through `stores.js`.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # production build (adapter-vercel)
npm run preview
npm run check      # svelte-check
```

## Data pipeline

`schedule.json` / `data.json` are generated from `../gtfs` and **committed**
(regenerating hits the public OSRM server):

```sh
python3 web/build_map.py            # -> src/lib/data/{data,schedule}.json
bash   scripts/build_streets.sh     # -> src/lib/data/streets.json (rarely needed)
```

The Dev-mode editors export `stops.txt` / `shapes.txt` for `gtfs/`; re-run
`build_map.py` after saving them there.

## Backend (recommendations queue)

`api/recommend` validates (city bbox), rate-limits by IP, and `LPUSH`es onto an
Upstash/Vercel-KV list. `api/recommendations` + `/review` read it, gated by a
token. Set on Vercel:

- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `_TOKEN`)
- `REVIEW_TOKEN` — the review-page password
- `IP_SALT` — optional, for hashing submitter IPs

## Deploy

Vercel project **root directory = `web/`**; the SvelteKit preset is auto-detected
from `package.json`. `adapter-vercel` turns `api/*/+server.js` into serverless
functions.
