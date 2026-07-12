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
1. **stops.txt** — ✅ DONE. `STOP_KAUFLAND` created (45.161490, 18.018636).
2. **stop_times.txt** — ✅ DONE. L1/L3/L5 trips fully rebuilt from the timetable
   columns by `tools/gen_patterns.py` (fixed per-route position→stop_id maps;
   skip `-` cells; exact times; renumbered `stop_sequence`). This also corrected
   the trip *sets*, which were wrong before: L3 12+10+4=26 trips (was 22, missing
   6:10/7:00/10:30/19:15 weekday etc.), L5 8+7+4=19 (was 23, wrong order/poles),
   L1 kept 27 but now models the weekday-5:00 skip. Each route now has 2 distinct
   patterns (full + short). L0/L1P/L2/L4/L6 untouched. Re-run with
   `python3 tools/gen_patterns.py`.
3. **Variant shapes** — ✅ DONE automatically. No `gen_shapes.py` naming refactor
   was needed: `scripts/build_feed.py` already composes **one shape per distinct
   (route, dir, stop pattern)** at feed-build time → `SHP_L3_0_P1` (short, 23) and
   `SHP_L3_0_P2` (full, 26), likewise L1/L5. 12 composed shapes total.
   - Known limitation: the SHORT patterns create stop-pairs absent from the
     traced geometry (e.g. L3 BUS→Budainka directly), so those hops fall back to
     straight lines ("N straight hop(s)" in build_feed output). The full patterns
     route correctly. Fixing the short shortcuts needs a hand-traced spur in the
     dev-mode editor (see step 7).
6. **Validated** — ✅ `scripts/validate.sh dist/…zip`: 0 ERRORS. The 6 WARNINGs /
   2 INFOs are all pre-existing on untouched routes (L2/L4 shapes,
   digit-initial stop names) — zero new issues from this work.

4/5. **build_map.py / web variant lines** — ✅ DONE. `web/build_map.py` now emits
   one `line` per distinct pattern for multi-pattern routes (L1/L3/L5): the
   fullest is the primary; each shorter one is a `variant` ("skraćeni") with its
   own **composed** geometry (via the shared `tools/shape_compose.py`), so a short
   line follows its real shortcut, not the full route. `MapController` draws
   variants dashed with their own toggle key, skips duplicate stop markers, and
   excludes them from the dev-mode shape editor's route picker (the editor still
   only edits the primary). `LinesPanel` lists each pattern as its own toggle
   ("L3 (puni)" / "L3 (skraćeni)"). `geometry.js` accumulates all patterns'
   geometry so the planner highlights rides against the right pattern.
   Single-pattern routes (L0/L1P/L2/L4/L6) render exactly as before.
7. **gen_shapes.py** — ✅ DONE. Short-pattern shortcuts traced as `_B1` spurs
   (`tools/add_short_spurs.py`, OSRM-routed): L1 BUS→Vinogradska, L3 BUS→Budainka,
   L5 BUS→Colosseum, plus `SHP_L3_0_B2` for the Jadranska→Borovska return gap.
   build_feed now composes all L1/L3/L5 patterns with **0 straight hops**. L3 & L5
   added to `LOCKED_SHAPES`; `gen_shapes.py` now also preserves `_B` spurs verbatim
   (it previously would have silently dropped them on a re-run).

## Pipeline / how to regenerate everything
```
python3 tools/gen_patterns.py      # rebuild L1/L3/L5 trips+stop_times from markdown
python3 tools/add_short_spurs.py   # (re)add short-pattern shortcut spurs (needs OSRM)
python3 web/build_map.py           # web data.json + schedule.json (variant lines)
python3 tools/coord_status.py      # refresh markdown coord-status blocks
python3 scripts/build_feed.py      # compose per-pattern shapes -> dist zip
scripts/validate.sh dist/slavonski-brod-gtfs.zip
```

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
