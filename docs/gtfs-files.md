# The eight GTFS files explained

GTFS files are plain CSV with a `.txt` extension. The first line is always a header. Order of columns matters less than column **names** matching the spec exactly. Full spec: https://gtfs.org/schedule/reference/

All eight files live in `gtfs/`.

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
1. Use `worksheets/stops_TODO.csv` as the worksheet. It already has some real coords (single-pole vs A/B-pole disambiguation). Anything still marked `XXXXX` needs work.
2. Sources, in order of preference:
   - Ask Terzić-bus directly: `terzicbus@gmail.com`, 035/273-102. They have an authoritative list.
   - OpenStreetMap — many SB stops are tagged `highway=bus_stop`.
   - Manual: open Google Maps in satellite view, right-click each stop, copy lat/lon.
3. Once `worksheets/stops_TODO.csv` is complete, copy lat/lon into `gtfs/stops.txt` and clear the `PLACEHOLDER LOCATION` text from `stop_desc`.

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

**When to edit:** every time a schedule changes. This is the most error-prone file — automated regeneration from the markdown transcriptions in `markdown/` is recommended over hand-editing.
