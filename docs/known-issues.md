# Known issues / TODO before v1.0

The former blockers are resolved: every stop has coordinates and the feed passes the MobilityData GTFS Validator with 0 errors. What remains before calling it v1.0:

### 1. Stop coordinate field verification
All stops have plausible coordinates, but many are still flagged `PLACEHOLDER` in `stop_desc` pending verification against the real pole locations. Track progress with `tools/coord_status.py` (per-line ✅/⬜ checklists in `markdown/LINIJA_*.md`). The flag is stripped from the released zip at build time.

### 2. School calendar verification
See the `calendar_dates.txt` section in [gtfs-files.md](gtfs-files.md#calendar_datestxt--exceptions-to-the-weekly-pattern). Verify against the official školski kalendar.

### 3. Stop name disambiguation
A few stops have similar names that may be the same physical location:
- "Trg sv. Antuna" (L1) vs "Trg Sv. Antuna - Podvinje" (L2)
- "Sv. Antuna I/II" (L2) vs "Ulica sv. Antuna I/II" (L1) — one pair merged (see below); the other
  ("Ulica sv. Antuna I" `STOP_UL_SV_ANTUNA_1` ≈ "Sv. Antuna II" `STOP_SV_ANTUNA_2`, ~95 m on placeholder
  coords) is likely the same pole too — verify once real coords confirm it.
- "E. Kumičića I/II" (L2) vs "Kumičićeva I/II/III" (L1) — "E. Kumičića I" `STOP_E_KUMICICA_1` and
  "Kumičićeva III" `STOP_KUMICICEVA_3` are ~5 m apart; likely the same pole, verify and merge.
- "Vinogorska" (L1+) and "Kerdeni" (L1+) — match to which numbered stop?
- L4 "Marinci" vs L3 "Marinci" — likely different physical locations

Once real coordinates are in, merge identical stops or split mistaken merges.

**Resolved (v1.3):** "Sv. Antuna I" `STOP_SV_ANTUNA_1` (L2) and "Ulica sv. Antuna II" `STOP_UL_SV_ANTUNA_2`
(L1) were 1.87 m apart — the same pole. Google Transit flagged them (Stops Too Close). Merged into
`STOP_SV_ANTUNA_1`; the redundant id was removed and L1 stop_times repointed.

### 6. Line 4+ (Bukovlje) not yet in the feed
The operator's website lists a **Linija 4+ → Bukovlje** with no timetable in `materials/` or `markdown/`.
Google Transit flagged the feed as not matching the published lines. Blocked until Grad Slavonski Brod /
Terzić-bus supply the 4+ schedule (stops + departure times) — then add it as route `L4P`, mirroring the
`L1P` (1+) pattern.

### 7. Schedule / route discrepancies vs website (Google cases)
Google opened cases reporting that some trip times and route details in the feed don't match the
timetables published on the agency website (reference screenshots are attached in the Transit Data Sharing
Portal). Needs a line-by-line reconciliation of `stop_times.txt` against the current website timetables
once those attachments are in hand.

### 4. Line 4 trip-pattern simplification
L4 has two trip patterns in the PDF (some trips skip the Šestina C extension stops). v1 uses the long pattern for all L4 trips, so short-pattern trips will show extra phantom stops. Fix in v1.1.

### 5. Route geometry gaps in `shapes.txt`
Per-trip shapes are composed from the hand-traced geometry at build time (see [workflow.md](workflow.md#building-the-zip)). L0 geometry, the L1P Janiševac loop, and the full L3 route are now hand-traced; every pattern composes with 0 straight hops. Remaining gaps:
- **L4** Mirka Turčinovića and Nas. M. Majstorovića sit 110–117 m from the traced line (the two remaining validator warnings); the segment needs a finer trace.
- **L2** one stop pair matches the traced loop out of order (validator warning `stops_match_shape_out_of_order`).

---

Source: timetables published at slavonski-brod.hr (January 2024 edition).
