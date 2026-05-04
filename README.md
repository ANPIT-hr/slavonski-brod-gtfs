# Slavonski Brod GTFS Feed

GTFS (General Transit Feed Specification) feed for the city bus network of **Slavonski Brod**, operated by **Terzić-bus d.o.o.**

This repository is the source of truth for the feed. Each release publishes a single `slavonski-brod-gtfs.zip` to GitHub Releases at a stable URL that Google Maps polls automatically:

```
https://github.com/frenki1004/slavonski-brod-gtfs/releases/latest/download/slavonski-brod-gtfs.zip
```

The `latest/download/` URL never changes across versions — every new release replaces the file Google fetches.

---

## ⚠️ Not yet ready for Google submission

Two blockers before this feed can go live:

1. **Real stop coordinates.** All 95 stops currently have placeholder coordinates near the city center (45.16°N, 18.01°E). Fill in `stops_TODO.csv`, then propagate into `zip/stops.txt`.
2. **Clean run from the official MobilityData GTFS Validator.** Google rejects feeds with validator errors. See *Validation* below.

---

## Repository layout

```
.
├── README.md                   ← this file
├── .gitignore
├── stops_TODO.csv              ← worksheet for filling in real stop coordinates
├── voznjepdf/                  ← original PDF timetables (source of truth for schedules)
│   ├── LINIJA_0_1-2024.pdf
│   ├── LINIJA_1_1-2024.pdf
│   └── ...
└── zip/                        ← the eight GTFS source files (CSV, .txt extension)
    ├── agency.txt
    ├── feed_info.txt
    ├── calendar.txt
    ├── calendar_dates.txt
    ├── routes.txt
    ├── stops.txt
    ├── trips.txt
    └── stop_times.txt
```

The published `slavonski-brod-gtfs.zip` is **not committed** — it's a build artifact, regenerated on each release and uploaded to GitHub Releases.

---

## The eight GTFS files explained

GTFS files are plain CSV with a `.txt` extension. The first line is always a header. Order of columns matters less than column **names** matching the spec exactly. Full spec: https://gtfs.org/schedule/reference/

### `agency.txt` — who operates the service

One row. Identifies Terzić-bus.

| Column | Meaning |
|---|---|
| `agency_id` | Internal ID referenced by `routes.txt`. Currently `terzic-bus`. |
| `agency_name` | Display name shown in Google Maps. |
| `agency_url` | Operator website. |
| `agency_timezone` | `Europe/Zagreb` — must match the times in `stop_times.txt`. |
| `agency_lang` | `hr` (Croatian). |
| `agency_phone`, `agency_email` | Contact info. |

**When to edit:** if Terzić-bus changes phone, website, or email. Almost never.

---

### `feed_info.txt` — metadata about this feed

One row. Tells Google who publishes the feed and how long it's valid.

| Column | Meaning |
|---|---|
| `feed_publisher_name` | Org publishing the feed (Grad Slavonski Brod / Terzić-bus). |
| `feed_publisher_url` | URL of the publisher. |
| `feed_lang`, `default_lang` | `hr`. |
| `feed_start_date`, `feed_end_date` | Validity window in `YYYYMMDD` (e.g. `20260601` to `20270531`). Google rejects feeds whose end date has passed — always extend before expiry. |
| `feed_version` | Free-form version tag (e.g. `1.0-2026-06`). Match the GitHub Release tag. |
| `feed_contact_email` | Email Google can reach for issues. |

**When to edit:** every release — bump `feed_version`, and bump `feed_end_date` whenever the schedule's validity is extended.

---

### `calendar.txt` — recurring weekly service patterns

Three rows: `WEEKDAY`, `SATURDAY`, `SUNDAY`. Each row says "this service runs on these days of the week between these dates."

| Column | Meaning |
|---|---|
| `service_id` | Symbolic name (`WEEKDAY`, `SATURDAY`, `SUNDAY`). Referenced from `trips.txt`. |
| `monday … sunday` | `1` if the service runs that weekday, `0` otherwise. |
| `start_date`, `end_date` | Validity window, `YYYYMMDD`. Should match `feed_info.txt`. |

**When to edit:** when you extend the feed's validity (bump `start_date`/`end_date`), or if the operator introduces a new service pattern.

---

### `calendar_dates.txt` — exceptions to the weekly pattern

This is where the school-break and public-holiday logic lives. Each row says "on this specific date, add or remove this service."

| Column | Meaning |
|---|---|
| `date` | The exception date, `YYYYMMDD`. |
| `service_id` | Which service the exception affects. |
| `exception_type` | `1` = service is added on this date, `2` = service is removed. |

Two patterns in this file:

- **Public holiday** (e.g. Easter Monday): `WEEKDAY` removed, `SATURDAY` removed, `SUNDAY` added.
- **School break weekday** (summer holidays, winter break, spring break): `WEEKDAY` removed, `SATURDAY` added — because PDFs say "ljeti" (LJ) and "zimi" (Z) timetables run on weekdays during breaks.

**When to edit:**
- Every year before the feed renewal: re-enter Croatian public holidays for the new validity window.
- Every year: replace estimated school-break dates with the official ones from Ministarstvo znanosti i obrazovanja's *školski kalendar*.

Estimated school-break dates currently encoded:
- Summer 2026: 22 June – 6 September
- Winter 2026/27: 24 December – 7 January
- Spring 2027: 22 – 30 March (around Easter)

---

### `routes.txt` — the bus lines

One row per line (8 total: 0, 1, 1+, 2, 3, 4, 5, 6).

| Column | Meaning |
|---|---|
| `route_id` | Internal ID (e.g. `L0`, `L1`, `L1PLUS`). Referenced by `trips.txt`. |
| `agency_id` | Always `terzic-bus`. |
| `route_short_name` | Number shown on the bus / on the map (`0`, `1`, `1+`, …). |
| `route_long_name` | Human-readable description (e.g. `A. kolodvor ↔ Vinogorje`). |
| `route_desc` | Free-form description; can be empty. |
| `route_type` | `3` = bus. Always 3 here. |
| `route_color`, `route_text_color` | Hex colors (no `#`) for the line badge. Currently all `1F4E79` on `FFFFFF`. |

**When to edit:** if a line is added, removed, or renumbered.

---

### `stops.txt` — every physical stop on the network

95 rows. **This is where the placeholder coordinates currently live and need fixing.**

| Column | Meaning |
|---|---|
| `stop_id` | Internal ID (e.g. `STOP_BUS_STN`, `STOP_KORZO_A`). Referenced by `stop_times.txt`. |
| `stop_name` | Display name shown in Google Maps. |
| `stop_lat`, `stop_lon` | WGS84 decimal degrees. **Currently placeholders.** |
| `stop_desc` | Currently used to flag placeholder rows. Can be cleared once real coords are in. |

**Filling in real coordinates** — recommended workflow:
1. Use `stops_TODO.csv` as the worksheet. It already has some real coords (single-pole vs A/B-pole disambiguation). Anything still marked `XXXXX` needs work.
2. Sources, in order of preference:
   - Ask Terzić-bus directly: `terzicbus@gmail.com`, 035/273-102. They have an authoritative list.
   - OpenStreetMap — many SB stops are tagged `highway=bus_stop`.
   - Manual: open Google Maps in satellite view, right-click each stop, copy lat/lon.
3. Once `stops_TODO.csv` is complete, copy lat/lon into `zip/stops.txt` and clear the `PLACEHOLDER LOCATION` text from `stop_desc`.

A/B suffixes (`STOP_KORZO_A`, `STOP_KORZO_B`) distinguish two physical poles on opposite sides of the street — passengers stand on different sides depending on direction. Keep them as separate stops with their own coordinates.

---

### `trips.txt` — every individual departure

169 rows. One row per (line × direction × departure time × service pattern).

| Column | Meaning |
|---|---|
| `route_id` | Which line (`L0`, `L1`, …). |
| `service_id` | Which calendar (`WEEKDAY`, `SATURDAY`, `SUNDAY`). |
| `trip_id` | Unique ID, encodes line/service/time (e.g. `L0_WEEKDAY_0715`). Referenced by `stop_times.txt`. |
| `trip_headsign` | Destination shown on the front of the bus and on the map (e.g. `Vinogorje`, `A. kolodvor`). |
| `direction_id` | `0` = outbound, `1` = inbound. Must be consistent across the line. |

**When to edit:** when departure times change, lines are added, or directions are added/removed. Each change in `trips.txt` must be accompanied by matching changes in `stop_times.txt`.

---

### `stop_times.txt` — the actual timetable

4087 rows. The biggest file. One row per (trip × stop) — i.e. every cell of every PDF timetable.

| Column | Meaning |
|---|---|
| `trip_id` | Which trip (matches `trips.txt`). |
| `arrival_time`, `departure_time` | `HH:MM:SS`, 24-hour, in `Europe/Zagreb`. Identical for bus stops without dwell time. Times >24:00:00 are allowed for trips that cross midnight (not used here). |
| `stop_id` | Which stop (matches `stops.txt`). |
| `stop_sequence` | Order along the trip, starting at 1. Must increase strictly within a trip. |
| `pickup_type`, `drop_off_type` | `0` = regular pickup/drop-off. Both 0 everywhere here. |

**When to edit:** every time a schedule changes. This is the most error-prone file — automated regeneration from the PDFs is recommended over hand-editing.

---

## Update workflow

Whenever something in the schedule changes:

1. Edit the relevant `.txt` file(s) in `zip/`.
2. Bump `feed_version` in `zip/feed_info.txt`.
3. If validity is extended, bump `feed_end_date` in `feed_info.txt` **and** `end_date` in `calendar.txt`, **and** add the new year's holidays/school breaks to `calendar_dates.txt`.
4. Build the zip (next section).
5. Validate (section after that).
6. Push the source changes to GitHub (section after that).
7. Cut a release with the zip attached (last section) — this is what Google sees.

---

## Building the zip

The zip must contain the eight `.txt` files **at the root** of the archive — not nested inside a folder. Google rejects feeds with a folder-wrapped layout.

```bash
cd zip
zip ../slavonski-brod-gtfs.zip *.txt
cd ..
```

Verify the layout:

```bash
unzip -l slavonski-brod-gtfs.zip
# Should list 8 files at the root: agency.txt, calendar.txt, ...
```

---

## Validation

Google requires a clean run from the official **MobilityData GTFS Validator** before they accept a feed.

**Option A — local CLI** (requires Java 11+):

```bash
wget https://github.com/MobilityData/gtfs-validator/releases/latest/download/gtfs-validator-cli.jar
java -jar gtfs-validator-cli.jar -i slavonski-brod-gtfs.zip -o validation_report
# Open validation_report/report.html in a browser
```

**Option B — web validator:** https://gtfs-validator.mobilitydata.org/ (upload the zip, get an HTML report).

The validator output is gitignored. Errors must be fixed; warnings are advisory but most should be addressed.

---

## Pushing source changes to GitHub

The repo lives at https://github.com/frenki1004/slavonski-brod-gtfs (origin already configured, tracking `main`).

Everyday flow after editing files in `zip/`:

```bash
git add zip/                                                # or specific files: git add zip/stop_times.txt
git commit -m "Update L1 weekday schedule for September 2026"
git push
```

Pushing the source files alone does **not** update the feed Google sees. Google fetches the zip attached to the latest GitHub Release. To make a change visible to Google, you must also cut a release (next section).

A first-time clone on a different machine:

```bash
git clone https://github.com/frenki1004/slavonski-brod-gtfs.git
cd slavonski-brod-gtfs
```

---

## Publishing a release (what Google actually sees)

Once the source is pushed and the zip is built and validated, cut a GitHub Release with the zip attached. Google polls the `/latest/download/` URL, which always points to the newest release's attached zip — the URL never changes across versions.

```bash
# Tag-and-attach in one go (gh CLI)
gh release create v2026.06 slavonski-brod-gtfs.zip \
  --title "v2026.06 — June 2026 schedule" \
  --notes "Initial publication. Validity 2026-06-01 to 2027-05-31."
```

Tagging convention: `vYYYY.MM` based on when the schedule edition takes effect (e.g. `v2026.06`, `v2027.06`). For mid-cycle corrections add a patch suffix: `v2026.06.1`.

To replace the zip on an existing release without bumping the tag (e.g. fixing a validator error caught after publish):

```bash
gh release upload v2026.06 slavonski-brod-gtfs.zip --clobber
```

The stable URL Google polls:

```
https://github.com/frenki1004/slavonski-brod-gtfs/releases/latest/download/slavonski-brod-gtfs.zip
```

---

## Submitting to Google Maps

1. The submitting party (**Grad Slavonski Brod** or **Terzić-bus**, not a third party) registers as a Transit Partner: https://maps.google.com/transit/
2. In the Transit Partner Dashboard, register the `/latest/download/` URL as the feed source.
3. Google runs their own validation + a manual review (typically 1–6 weeks).
4. If they request fixes, iterate: edit → rebuild → cut a new release with the same tag scheme; the URL stays identical.
5. Goes live in Google Maps once approved.

After approval, Google re-polls the URL on a schedule, so future releases propagate automatically without re-submission.

---

## Known issues / TODO before v1.0

### 1. Stop coordinates (mandatory)
See *`stops.txt`* above.

### 2. School calendar verification
See *`calendar_dates.txt`* above. Verify against the official školski kalendar.

### 3. Stop name disambiguation
A few stops have similar names that may be the same physical location:
- "Trg sv. Antuna" (L1) vs "Trg Sv. Antuna - Podvinje" (L2)
- "Sv. Antuna I/II" (L2) vs "Ulica sv. Antuna I/II" (L1)
- "E. Kumičića I/II" (L2) vs "Kumičićeva I/II/III" (L1)
- "Vinogorska" (L1+) and "Kerdeni" (L1+) — match to which numbered stop?
- L4 "Marinci" vs L3 "Marinci" — likely different physical locations

Once real coordinates are in, merge identical stops or split mistaken merges.

### 4. Line 4 trip-pattern simplification
L4 has two trip patterns in the PDF (some trips skip the Šestina C extension stops). v1 uses the long pattern for all L4 trips, so short-pattern trips will show extra phantom stops. Fix in v1.1.

### 5. `shapes.txt` not included
Optional file that draws the actual road path on the map. Without it, Google draws straight lines between stops — usable but uglier. Adding it requires GPS traces of each route. Recommended for v1.1.

---

Source: timetables published at slavonski-brod.hr (January 2024 edition).
