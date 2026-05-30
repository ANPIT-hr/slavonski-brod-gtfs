# Map viewer

Interactive maps of the Slavonski Brod feed: every stop as a pin, every
route + direction drawn as a line **snapped to the real road network**.

Two views, sharing the same generated `data.js`:
- **`index.html`** — fast 2D [Leaflet](https://leafletjs.com/) map. Switch the
  base layer (top-left control) between street map, satellite, and
  satellite + street names.
- **`cesium.html`** — 3D [CesiumJS](https://cesium.com/cesiumjs/) globe with
  satellite imagery; lines drape on the ground, drag to tilt/orbit.

Both pages link to each other in the panel header. **Neither needs an API key** —
satellite is free [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9),
and the Cesium page is configured so it never requests a Cesium Ion token.

## Two modes (top-left toggle)

`index.html` runs in one of two modes, switched by the **Razvoj | Produkcija**
toggle in the top-left corner. The mode persists in `localStorage` and can be
deep-linked with `?mode=dev` / `?mode=prod`. **Default is Production.** See
[`PLAN.md`](PLAN.md) for the full design.

- **Produkcija (Production)** — the rider-facing app:
  - **Planer puta** — pick *from* / *to* stop, a day, and a departure time; get
    the top-3 itineraries (which line(s), when, transfers) computed **in the
    browser** by a Connection-Scan algorithm over `schedule.js`. 📍 sets the
    origin to your nearest stop; tap an itinerary to highlight it on the map.
  - **Vozni red** — per-line, per-day timetable (honours holiday exceptions).
  - The PDF tracing overlay and all editing tools are hidden.
- **Razvoj (Development)** — the field/editing tools (GPS, PDF overlay, route
  tracing, stop dragging). New here: each stop popup has **✉ Pošalji prijedlog**
  which submits the stop's corrected position to a backend review queue (see
  [Backend](#backend--recommendations-queue) below) — in addition to the local
  `Izvezi stops.txt` export we use ourselves.

The trip planner needs the baked schedule: **`build_map.py` now also writes
`schedule.js`** (timed trips, the service calendar + exceptions, and walkable
transfers). It loads lazily the first time Production opens.

## Run it

Open `index.html` (or `cesium.html`) in a browser. `data.js` is plain
JavaScript, so the 2D map works from `file://` with no web server. Cesium loads
better over HTTP — run `python3 -m http.server` from this folder and open
`http://localhost:8000`.

- Right-hand panel toggles each line on/off ("Sve" / "Nijedna" = all / none).
- Click a stop for its name, pole, position in the line, and coordinates.

## Capturing real stop coordinates in the field (GPS)

For walking the network with a phone and recording where each pole actually is.
The **Moja lokacija (GPS)** panel section:

- **📍 Moja lokacija** starts live tracking — a blue dot with an accuracy circle
  follows you; the first fix recentres the map, later fixes don't (so you can
  pan freely). The status shows the current fix accuracy (`±N m`). Press again
  to stop.
- To stamp a stop: enter **Uredi stajališta**, pick the line, tap the stop you're
  standing at, then **📍 Postavi na GPS lokaciju** in its popup. It takes a fresh
  high-accuracy reading and moves the stop there (warning first if accuracy is
  worse than ±30 m). Fine-tune by dragging if you're not standing exactly on the
  pole.
- When done, **Izvezi stops.txt** downloads the updated file — drop it into
  `gtfs/` and run `python3 build_map.py`. Captures persist in `localStorage`, so
  you can collect over multiple sessions before exporting.

> **Geolocation needs a secure context.** Browsers only grant GPS over HTTPS or
> `localhost` — **not** `file://`. For field use, deploy to Vercel (below) and
> open the HTTPS URL on your phone, or run `python3 -m http.server` and use
> `http://localhost:8000` on the same machine.

## Deploy to Vercel

The viewer itself is static (`index.html`, `data.js`, `schedule.js`,
`overlay.png`). The only server-side code is two small functions under `api/`
for the recommendations queue (see below).

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new).
2. In project settings set **Root Directory** to `web` (framework preset
   "Other", no build command). Vercel serves `index.html` at the site root and
   auto-detects `api/*.js` as serverless functions (installing `@vercel/kv`).
3. Deploy. Open the resulting `https://…vercel.app` URL on your phone — HTTPS
   means the GPS feature works.

(Or from the CLI: `cd web && npx vercel`.)

The site deploys and works **without** the backend — the trip planner, timetable
and all viewing are client-side. Only the dev-mode **Pošalji prijedlog** button
and `review.html` need the steps below.

## Backend — recommendations queue

Development-mode corrections are `POST`ed to `/api/recommend`, validated
(inside the city bbox) and rate-limited per IP, then stored in **Vercel KV**.
We review them at **`/review.html`**.

**One-time setup in the Vercel dashboard:**

1. **Storage → Create → KV** and connect it to this project. Vercel injects the
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars that `@vercel/kv` reads.
   (If you provision via the Upstash marketplace integration instead, make sure
   those `KV_REST_API_*` vars exist — or the functions can't reach the store.)
2. **Settings → Environment Variables** → add **`REVIEW_TOKEN`** = a long random
   secret. This gates `GET/PATCH /api/recommendations` and `review.html`.
   (Optional: `IP_SALT` = any string, to salt the hashed IPs.)
3. Redeploy so the new env vars take effect.

**Reviewing:** open `https://…vercel.app/review.html`, paste the `REVIEW_TOKEN`
when prompted. Each card shows the proposed move (old → new) on a mini-map.
Use **⎘ stops.txt redak** to copy a paste-ready row, apply it to `gtfs/stops.txt`,
run `python3 build_map.py`, then mark the item **✓ Primijenjeno** (or **✕ Odbij**).

Tuning knobs live at the top of `api/recommend.js`: `BBOX`, `RATE_MAX`,
`RATE_WINDOW`. If submissions get abused, add a Turnstile/hCaptcha check there —
no front-end redesign needed.

## PDF overlay — tracing stops off the official map (2D map only)

The official transit-map PDF can be draped over the 2D map and georeferenced by
hand, so you can right-click a tagged stop on it and read off real coordinates
to enter into `gtfs/stops.txt`.

First raster the PDF once (re-run only if the source PDF changes):

    bash build_overlay.sh        # writes overlay.png from ../materials/…FINAL.pdf

Then in `index.html`, the **Podloga (PDF karta)** panel section:

- **Prikaži podlogu** — toggle the overlay on/off.
- **Prozirnost** — opacity slider (starts ~60% so streets show through).
  Keyboard **1–5** sets opacity to 0/25/50/75/100 %.
- **✎ Uredi podlogu** — enter edit mode. Handle markers appear:
  - the round **centre handle (✥)** drags the whole image to reposition it;
  - the four **square corner handles** resize it **proportionally** (the image
    keeps its aspect ratio — it scales, never stretches; the opposite corner
    stays anchored).
  - The map still pans/zooms when you drag *outside* the handles.
  - Click **✓ Završi uređivanje** to finish (handles hide, alignment saved).
  Align against the **Satelit** base layer — building footprints match.
- **Spremi položaj** saves the alignment; it also auto-saves after each drag and
  persists across reloads (`localStorage`). **Resetiraj** restores the default
  box. **Izvezi granice** copies the bounding box `[SW, NE]` to the clipboard —
  paste it into `DEFAULT_BOUNDS` in `index.html` to bake your alignment in as the
  new default.

The overlay is north-up (no rotation), which suits this city map; if you ever
need to rotate/skew it, that needs a warp library — say the word.

**Right-click anywhere** on the map (overlay or not) opens a popup with the
`lat, lon` at that point, a **Kopiraj** copy button, and the nearest existing
stop + distance — so you can tell whether a tagged stop is already in the feed.

## Drawing accurate route lines (trace → shapes.txt)

Without a `shapes.txt`, `build_map.py` asks OSRM to *guess* the road path between
stops, which often doesn't match the bus's real route. To fix a line, trace it:

In `index.html`, the **Crtanje rute (shapes)** panel section:

1. Turn the **PDF overlay** on (it shows the real, colour-coded route lines).
2. Pick the route+direction in the dropdown.
3. Click **✎ Crtaj rutu**, then click along the real path on the map. The line
   redraws as you go and **replaces the auto-routed line**. **↶ Poništi** removes
   the last point; **Obriši** clears the route. A **✓** marks traced routes.
   Traces persist in `localStorage`.
4. Click **Izvezi shapes.txt** to download a GTFS `shapes.txt`
   (`shape_id = SHP_<route>_<direction>`).

Then drop the file into `gtfs/shapes.txt` and re-run `python3 build_map.py` — it
uses each traced shape in place of OSRM, and falls back to OSRM for untraced
routes. (Wiring `shape_id` into `trips.txt` for full GTFS correctness is a
separate step — ask and I'll add it.)

## Regenerate after editing the feed

`data.js` is generated from `../gtfs`. Re-run after changing stops, trips, or
stop_times:

    python3 build_map.py

For each route + direction it picks the trip with the most stops as the
representative shape, then calls the public OSRM server to snap the stop
sequence to streets. If routing is unavailable it falls back to straight
stop-to-stop lines so the map still works offline.

Map: [Leaflet](https://leafletjs.com/) + OpenStreetMap tiles. Routing:
[OSRM](http://project-osrm.org/) demo server. No API keys required.
