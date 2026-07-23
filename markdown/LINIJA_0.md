# LINIJA 0 — Centar (kružna)

<!-- COORD-STATUS:START -->
## Coordinate status — 9/9 stops set

Auto-generated from `gtfs/stops.txt`. ✅ = real coordinate set, ⬜ = still placeholder. Regenerate with `python3 tools/coord_status.py`.

- ✅ Autobusni kolodvor `STOP_BUS_STN`
- ✅ Trg. centar Colosseum `STOP_COLOSSEUM`
- ✅ Borovska `STOP_BOROVSKA_A`
- ✅ Korzo `STOP_KORZO_A`
- ✅ Tržnica `STOP_TRZNICA_A`
- ✅ Petra Svačića - KAUFLAND `STOP_KAUFLAND`
- ✅ Borovska `STOP_BOROVSKA_B`
- ✅ Tržnica `STOP_TRZNICA_B`
- ✅ Korzo `STOP_KORZO_B`

<!-- COORD-STATUS:END -->

L0 is a loop with **two directions**, each using a different pole at the shared mid-route stops:

- **Smjer A** (direction_id=0): A. kolodvor → Colosseum → Borovska A → Korzo A → Tržnica A → Petra Svačića-KAUFLAND → A. kolodvor
- **Smjer B** (direction_id=1): A. kolodvor → Petra Svačića-KAUFLAND → Tržnica B → Korzo B → Borovska B → Colosseum → A. kolodvor

"Petra Svačića-KAUFLAND" (`STOP_KAUFLAND`) is served in **both** directions per the operator PDF
(`materials/LINIJA_0_1-2024.pdf`) — 2nd-to-last in smjer A, and 2nd (right after A. kolodvor) in smjer B.

## Weekday (pon–pet) — Smjer A (kroz Colosseum prvo)

Prometuje: 1 2 3 4 5 (ponedjeljak–petak)

| Polazak # | 3 | 4 | 6 | 7 | 8 | 9 | 11 | 14 | 16 |
|---|---|---|---|---|---|---|---|---|---|
| A. kolodvor (BUS_STN) | 9:00 | 9:30 | 11:15 | 12:50 | 14:25 | 14:50 | 17:00 | 18:55 | 21:20 |
| Trg. centar Colosseum | 9:05 | 9:35 | 11:20 | 12:55 | 14:30 | 14:55 | 17:05 | 19:00 | 21:25 |
| Borovska A | 9:08 | 9:38 | 11:23 | 12:58 | 14:33 | 14:58 | 17:08 | 19:03 | 21:28 |
| Korzo A | 9:10 | 9:40 | 11:25 | 13:00 | 14:35 | 15:00 | 17:10 | 19:05 | 21:30 |
| Tržnica A | 9:15 | 9:45 | 11:30 | 13:05 | 14:40 | 15:05 | 17:15 | 19:10 | 21:35 |
| Petra Svačića-KAUFLAND | 9:18 | 9:48 | 11:33 | 13:08 | 14:43 | 15:08 | 17:18 | 19:13 | 21:38 |
| A. kolodvor (BUS_STN) | 9:20 | 9:50 | 11:35 | 13:10 | 14:45 | 15:10 | 17:20 | 19:15 | 21:40 |

## Weekday (pon–pet) — Smjer B (kroz Tržnicu prvo)

Prometuje: 1 2 3 4 5 (ponedjeljak–petak)

| Polazak # | 1 | 2 | 5 | 10 | 12 | 13 | 15 |
|---|---|---|---|---|---|---|---|
| A. kolodvor (BUS_STN) | 7:15 | 8:20 | 10:40 | 16:15 | 18:00 | 18:30 | 20:30 |
| Petra Svačića-KAUFLAND | 7:17 | 8:22 | 10:42 | 16:17 | 18:02 | 18:32 | 20:32 |
| Tržnica B | 7:20 | 8:25 | 10:45 | 16:20 | 18:05 | 18:35 | 20:35 |
| Korzo B | 7:25 | 8:30 | 10:50 | 16:25 | 18:10 | 18:40 | 20:40 |
| Borovska B | 7:27 | 8:32 | 10:52 | 16:27 | 18:12 | 18:42 | 20:42 |
| Trg. centar Colosseum | 7:30 | 8:35 | 10:55 | 16:30 | 18:15 | 18:45 | 20:45 |
| A. kolodvor (BUS_STN) | 7:35 | 8:40 | 11:00 | 16:35 | 18:20 | 18:50 | 20:50 |

## Subota, školski ljetni i zimski praznici (6, LJ, Z) — Smjer A

Prometuje: 6, LJ, Z

| Polazak # | 4 | 6 | 7 |
|---|---|---|---|
| A. kolodvor (BUS_STN) | 9:30 | 13:00 | 14:35 |
| Trg. centar Colosseum | 9:35 | 13:05 | 14:40 |
| Borovska A | 9:38 | 13:08 | 14:43 |
| Korzo A | 9:40 | 13:10 | 14:45 |
| Tržnica A | 9:45 | 13:15 | 14:50 |
| Petra Svačića-KAUFLAND | 9:48 | 13:18 | 14:53 |
| A. kolodvor (BUS_STN) | 9:50 | 13:20 | 14:55 |

## Subota, školski ljetni i zimski praznici (6, LJ, Z) — Smjer B

Prometuje: 6, LJ, Z

| Polazak # | 1 | 2 | 3 | 5 |
|---|---|---|---|---|
| A. kolodvor (BUS_STN) | 7:15 | 8:00 | 9:00 | 11:30 |
| Petra Svačića-KAUFLAND | 7:17 | 8:02 | 9:02 | 11:32 |
| Tržnica B | 7:20 | 8:05 | 9:05 | 11:35 |
| Korzo B | 7:25 | 8:10 | 9:10 | 11:40 |
| Borovska B | 7:27 | 8:12 | 9:12 | 11:42 |
| Trg. centar Colosseum | 7:30 | 8:15 | 9:15 | 11:45 |
| A. kolodvor (BUS_STN) | 7:35 | 8:20 | 9:20 | 11:50 |

## Notes

- LEGENDA: 1=ponedjeljak; 2=utorak; 3=srijeda; 4=četvrtak; 5=petak; 6=subota; LJ=ljetni praznici; Z=zimski praznici
- NEDJELJOM I BLAGDANIMA NE PROMETUJE!
- GTFS stop IDs: `STOP_BUS_STN`, `STOP_COLOSSEUM`, `STOP_BOROVSKA_A`/`_B`, `STOP_KORZO_A`/`_B`, `STOP_TRZNICA_A`/`_B`, `STOP_KAUFLAND`.
- GTFS direction IDs: smjer A = 0, smjer B = 1.
