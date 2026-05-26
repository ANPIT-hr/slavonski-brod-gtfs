# Known issues / TODO before v1.0

## ⚠️ Two blockers before Google submission

1. **Real stop coordinates.** All 95 stops currently have placeholder coordinates near the city center (45.16°N, 18.01°E). Fill in `worksheets/stops_TODO.csv`, then propagate into `gtfs/stops.txt`.
2. **Clean run from the official MobilityData GTFS Validator.** Google rejects feeds with validator errors. See [workflow.md](workflow.md#validation).

---

### 1. Stop coordinates (mandatory)
See the `stops.txt` section in [gtfs-files.md](gtfs-files.md#stopstxt--every-physical-stop-on-the-network).

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

### 5. `shapes.txt` not included
Optional file that draws the actual road path on the map. Without it, Google draws straight lines between stops — usable but uglier. Adding it requires GPS traces of each route. Recommended for v1.1.

---

Source: timetables published at slavonski-brod.hr (January 2024 edition).
