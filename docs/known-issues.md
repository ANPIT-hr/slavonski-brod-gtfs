# Known issues / TODO before v1.0

The former blockers are resolved: every stop has coordinates and the feed passes the MobilityData GTFS Validator with 0 errors. What remains before calling it v1.0:

### 1. Stop coordinate field verification
All stops have plausible coordinates, but many are still flagged `PLACEHOLDER` in `stop_desc` pending verification against the real pole locations. Track progress with `tools/coord_status.py` (per-line ✅/⬜ checklists in `markdown/LINIJA_*.md`). The flag is stripped from the released zip at build time.

### 2. School calendar verification
See the `calendar_dates.txt` section in [gtfs-files.md](gtfs-files.md#calendar_datestxt--exceptions-to-the-weekly-pattern). Verify against the official školski kalendar.

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

### 5. Route geometry gaps in `shapes.txt`
Per-trip shapes are composed from the hand-traced geometry at build time (see [workflow.md](workflow.md#building-the-zip)). L0 geometry, the L1P Janiševac loop, and the full L3 route are now hand-traced; every pattern composes with 0 straight hops. Remaining gaps:
- **L4** Mirka Turčinovića and Nas. M. Majstorovića sit 110–117 m from the traced line (the two remaining validator warnings); the segment needs a finer trace.
- **L2** one stop pair matches the traced loop out of order (validator warning `stops_match_shape_out_of_order`).

---

Source: timetables published at slavonski-brod.hr (January 2024 edition).
