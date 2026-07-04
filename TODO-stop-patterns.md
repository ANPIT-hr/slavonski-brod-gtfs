# TODO — per-trip stop patterns + variant shapes (L1, L3, L5)

## Goal
Some trips skip the first few stops (e.g. L3's 6:10 & 7:00 rides skip Tržnica/
Korzo/Borovska outbound; L1's first ride and L5's first ride skip their opening
stops too). Right now **every trip on a route carries the identical stop list**,
so these skips aren't modelled and the map draws only one variant.

Model each distinct stop pattern properly and give **each pattern its own shape**
so every variant is visible/verifiable on the map.

## Decisions (confirmed with user)
- **Separate shape per pattern** — each distinct stop pattern gets its own
  `shape_id`; trips point to the matching one; the web shows each as its own line
  (e.g. "L3 puni" vs "L3 skraćeni").
- **Scope: L1, L3, L5** (do L3 first as the template, then L1 & L5).
- **Create the missing stop** `Petra Svačića – KAUFLAND` — it's in the L3
  timetable (return leg) but absent from the feed.
  OSM bus-stop node coords: **45.16149, 18.018636** (`STOP_KAUFLAND`).

## Ground truth
The operator timetables in `markdown/LINIJA_{1,3,5}.md` are authoritative and
list **every** stop with exact times; a `-` cell means that trip skips the stop.
A parser over those tables already works (splits the `|` tables into columns;
`-` → None). Map each GTFS trip to its timetable column by **A. kolodvor
departure time** (times are unique enough across day-types; values agree where
they overlap).

### L3 findings (analysed)
Full timetable stop order (26 rows), position → stop_id:
```
0 A.kolodvor=BUS_STN  1 Tržnica=TRZNICA_A  2 Korzo=KORZO_A  3 Borovska=BOROVSKA_A
4-7 Budainka I-IV=BUDAINKA_1..4  8 Sjeverna=SJEVERNA_VEZNA  9 Marinci=MARINCI
10 Požeška=POZESKA  11 Bečic I=BECIC_1  12 Bečic II=BECIC_2
13-16 Budainka IV-I=BUDAINKA_4..1  17-18 Kolodvorska I/II=KOLODVORSKA_1/2
19 M.Getaldića=M_GETALDICA  20 Jadranska=JADRANSKA  21 Borovska=BOROVSKA_B
22 Korzo=KORZO_B  23 Tržnica=TRZNICA_B  24 Petra Svačića-KAUFLAND=KAUFLAND
25 A.kolodvor=BUS_STN
```
- **Missing from current GTFS L3 stop_times:** TRZNICA_A, KORZO_A (outbound),
  KORZO_B, TRZNICA_B, KAUFLAND (return). All 22 trips currently have 21 stops;
  full pattern should be 26.
- **Two patterns:** FULL (26 stops) and SHORT (deps 6:10 & 7:00 → positions
  1,2,3 are `-`, i.e. skip Tržnica/Korzo/Borovska outbound → 23 stops).
- Trip→column mapping verified: every GTFS L3 trip's dep time matches exactly
  one timetable column.

### L1, L5 findings (TODO — not yet analysed)
- L1: first ride skips its opening stops — parse `markdown/LINIJA_1.md`, find the
  `-` columns, derive patterns + position→stop_id map.
- L5: first ride skips — parse `markdown/LINIJA_5.md` likewise.
- Build position→stop_id maps per route (watch A/B: first occurrence = outbound
  `_A`, second = return `_B`; single-occurrence stops keep their sole id).

## Implementation steps
1. **stops.txt** — create `STOP_KAUFLAND` (45.16149, 18.018636).
2. **stop_times.txt** — rebuild L3/L1/L5 trips from their timetable columns
   (skip `-` cells, exact times, renumber `stop_sequence`). This yields correct
   per-trip patterns automatically.
3. **Variant shapes** — one shape per distinct pattern. Naming scheme + parser
   update needed:
   - Pick a scheme, e.g. `SHP_<route>_<dir>_p<n>` (p0 = fullest). Update
     `web/build_map.py` `load_shapes()` (currently `base.rsplit("_",1)` →
     route,dir) to also carry the pattern index, and `tools/gen_shapes.py`
     naming + `LOCKED_SHAPES`.
   - FULL L3 shape ≈ current `SHP_L3_0` (already routes via Tržnica; must also
     pass KAUFLAND on the return). SHORT L3 shape = same but outbound goes
     BUS → Budainka directly (no Tržnica/Korzo/Borovska).
4. **build_map.py** — group trips by `(route, dir, stop-pattern signature)`;
   emit one `line` per pattern with its own shape + a variant label
   (e.g. "puni"/"skraćeni"); assign `shape_id` per trip in trips.txt.
5. **web** — show/toggle the variant lines so each pattern is verifiable
   (`lines[]` already carries per-line geometry; add a variant label field).
6. Rebuild (`build_map.py`), validate (`scripts/validate.sh`), render each
   variant, confirm with user.
7. Re-lock shapes in `gen_shapes.py` once approved.

## Already done this session (committed)
- **L3 shape**: rerouted the eastern loop down through Tржnica via the Štampara
  roundabout (Tржnica now 5 m from shape). L3 currently **unlocked** in
  `gen_shapes.py` for this pattern work.
- **L4 shape**: installed the hand-drawn loops, then removed the redundant
  Slavka Martinovića / Babinac I detour. Locked.
- **L5 shape**: rebuilt as an out-and-back (L3-style stem + far-end retrace to
  Stjepana Radića IV) that serves Tржnica.
- **MapController fix**: saved localStorage traces now render **only in dev mode**
  (`?mode=dev`); prod always shows the built geometry from `data.json`. This was
  why fixed routes appeared to "still show 2 lines" / "just the loop".
- Locks in `gen_shapes.py`: `LOCKED_SHAPES = {SHP_L1_0, SHP_L2_0, SHP_L4_0}`
  (L3 intentionally unlocked pending the pattern work above).

## Notes / gotchas
- `web/build_map.py` reads `shapes.txt` verbatim for locked/traced shapes; the
  public OSRM (`router.project-osrm.org`, needs `User-Agent`) is used for
  road-routing gaps (guard against dead-ends: skip if road ≫ straight-line).
- Adding stops changes `schedule.json`; times come straight from the timetable so
  no interpolation needed.
- Calendar mapping is non-obvious (holiday→SUNDAY, school-break→SATURDAY); match
  trips to timetable columns by **time**, not by service_id name.
