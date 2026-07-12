#!/usr/bin/env python3
"""Rebuild L1/L3/L5 trips + stop_times from the operator timetables.

The markdown timetables in markdown/LINIJA_{1,3,5}.md are ground truth: each
day-type section is a table whose columns are individual departures and whose
rows are stops in travel order. A "-" cell means that departure skips the stop.

Rebuilding straight from those tables gives every trip its correct per-trip stop
pattern automatically (short vs full), which is what scripts/build_feed.py needs
to compose one shape per distinct pattern. Rows for other routes (L0, L1P, L2,
L4, L6) are copied through untouched.

Row order in every section of a route is identical, so we map row index -> stop
id with a fixed per-route list (STOP_MAPS). The list carries the A/B pole rule:
first pass of a twice-served stop = outbound "_A", second pass = return "_B".

Usage: python3 tools/gen_patterns.py
Then:  python3 web/build_map.py  (regenerate web data)
       python3 tools/coord_status.py
       scripts/validate.sh
"""
import csv
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GTFS = os.path.join(ROOT, "gtfs")
MD = os.path.join(ROOT, "markdown")

TARGET_ROUTES = ("L1", "L3", "L5")
HEADSIGN = {"L1": "Vinogorje", "L3": "Brodski Varoš – Bečic", "L5": "S. Radića – Jelas"}
SHAPE_ID = {"L1": "SHP_L1_0", "L3": "SHP_L3_0", "L5": "SHP_L5_0"}

# Missing stop referenced by L3 & L5 return legs (OSM bus-stop node).
KAUFLAND = ("STOP_KAUFLAND", "Petra Svačića - KAUFLAND", "45.161490", "18.018636",
            "OSM verified")

# Row index (0-based, in timetable travel order) -> stop_id, one list per route.
STOP_MAPS = {
    "L1": [
        "STOP_BUS_STN", "STOP_KORZO_A", "STOP_TRZNICA_A", "STOP_ZRINSKA_A",
        "STOP_GUPCEVA_A", "STOP_BR108_1", "STOP_BR108_2", "STOP_VINOGRADSKA_1",
        "STOP_VINOGRADSKA_2", "STOP_VINOGRADSKA_3_A", "STOP_DRAVSKA", "STOP_DUNAVSKA",
        "STOP_VINOGORSKA_1", "STOP_VINOGORSKA_2", "STOP_VINOGORSKA_3", "STOP_KERDENI_1",
        "STOP_KERDENI_2", "STOP_KERDENI_3", "STOP_TRG_SV_ANTUNA", "STOP_UL_SV_ANTUNA_1",
        "STOP_UL_SV_ANTUNA_2", "STOP_KUMICICEVA_1", "STOP_KUMICICEVA_2",
        "STOP_KUMICICEVA_3", "STOP_GUPCEVA_B", "STOP_ZRINSKA_B", "STOP_TRZNICA_B",
        "STOP_KORZO_B", "STOP_BUS_STN",
    ],
    "L3": [
        "STOP_BUS_STN", "STOP_TRZNICA_A", "STOP_KORZO_A", "STOP_BOROVSKA_A",
        "STOP_BUDAINKA_1", "STOP_BUDAINKA_2", "STOP_BUDAINKA_3", "STOP_BUDAINKA_4",
        "STOP_SJEVERNA_VEZNA", "STOP_MARINCI", "STOP_POZESKA", "STOP_BECIC_1",
        "STOP_BECIC_2", "STOP_BUDAINKA_4", "STOP_BUDAINKA_3", "STOP_BUDAINKA_2",
        "STOP_BUDAINKA_1", "STOP_KOLODVORSKA_1", "STOP_KOLODVORSKA_2",
        "STOP_M_GETALDICA", "STOP_JADRANSKA", "STOP_BOROVSKA_B", "STOP_KORZO_B",
        "STOP_TRZNICA_B", "STOP_KAUFLAND", "STOP_BUS_STN",
    ],
    "L5": [
        "STOP_BUS_STN", "STOP_TRZNICA_A", "STOP_KORZO_A", "STOP_BOROVSKA_A",
        "STOP_COLOSSEUM", "STOP_SV_N_TAVELICA", "STOP_P_SUBICA_1", "STOP_P_SUBICA_2",
        "STOP_GARDIJSKE_3", "STOP_I_VELIKANOVICA", "STOP_A_JARICA", "STOP_S_RADICA_1",
        "STOP_S_RADICA_2", "STOP_S_RADICA_3", "STOP_S_RADICA_4", "STOP_S_RADICA_3",
        "STOP_S_RADICA_2", "STOP_S_RADICA_1", "STOP_A_JARICA", "STOP_I_VELIKANOVICA",
        "STOP_GARDIJSKE_3", "STOP_P_SUBICA_2", "STOP_P_SUBICA_1", "STOP_SV_N_TAVELICA",
        "STOP_COLOSSEUM", "STOP_BOROVSKA_B", "STOP_KORZO_B", "STOP_TRZNICA_B",
        "STOP_KAUFLAND", "STOP_BUS_STN",
    ],
}

# Sanity check: the first-column stop labels each section must present, in order.
# (Bare stop names as they appear in the leftmost table cell; A/B suffix stripped
# because the tables label them inconsistently across routes.)
EXPECT_LABELS = {
    "L1": ["A. kolodvor", "Korzo", "Tržnica", "Zrinska", "Gupčeva",
           "108. brigade ZNG I", "108. brigade ZNG II", "Vinogradska I",
           "Vinogradska II", "Vinogradska III", "Dravska", "Dunavska",
           "Vinogorska I", "Vinogorska II", "Vinogorska III", "Kerdeni I",
           "Kerdeni II", "Kerdeni III", "Trg sv. Antuna", "Ulica sv. Antuna I",
           "Ulica sv. Antuna II", "Kumičićeva I", "Kumičićeva II", "Kumičićeva III",
           "Gupčeva", "Zrinska", "Tržnica", "Korzo", "A. kolodvor"],
    "L3": ["A. kolodvor", "Tržnica", "Korzo", "Borovska",
           "Budainka (samop.) - Zagrebačka I", "Budainka (škola) - Zagrebačka II",
           "Budainka - Zagrebačka III", "Budainka - Zagrebačka IV",
           "Sjeverna vezna cesta", "Marinci", "Požeška", "Bečic I", "Bečic II",
           "Budainka - Zagrebačka IV", "Budainka - Zagrebačka III",
           "Budainka (škola) - Zagrebačka II", "Budainka (samop.) - Zagrebačka I",
           "Kolodvorska I", "Kolodvorska II", "Marina Getaldića", "Jadranska",
           "Borovska", "Korzo", "Tržnica", "Petra Svačića - KAUFLAND",
           "Autobusni kolodvor"],
    "L5": ["A. kolodvor", "Tržnica", "Korzo", "Borovska", "Trg. centar Colosseum",
           "Sv. Nikole Tavelića", "Pavla Šubića I", "Pavla Šubića II",
           "3. gardijske brigade", "Ivana Velikanovića", "Augustina Jarića",
           "Stjepana Radića I", "Stjepana Radića II", "Stjepana Radića III",
           "Stjepana Radića IV", "Stjepana Radića III", "Stjepana Radića II",
           "Stjepana Radića I", "Augustina Jarića", "Ivana Velikanovića",
           "3. gardijske brigade", "Pavla Šubića II", "Pavla Šubića I",
           "Sv. Nikole Tavelića", "Trg. centar Colosseum", "Borovska", "Korzo",
           "Tržnica", "Petra Svačića - KAUFLAND", "A. kolodvor"],
}

SERVICE_BY_HEADER = [
    ("weekday", "WEEKDAY"),
    ("subota", "SATURDAY"),
    ("nedjelja", "SUNDAY"),
]


def label_of(cell):
    """Bare stop name for a leftmost table cell (drop a trailing ' A'/' B' pole
    marker so L1's 'Korzo A' compares equal to the plain expected label)."""
    return re.sub(r"\s+[AB]$", "", cell.strip())


def hhmm(t):
    """'6:10' -> ('06:10:00', '0610'). Empty/'-' -> (None, None)."""
    t = t.strip()
    if not t or t == "-":
        return None, None
    h, m = t.split(":")
    return f"{int(h):02d}:{int(m):02d}:00", f"{int(h):02d}{int(m):02d}"


def parse_sections(route):
    """Return [(service_id, [ [cell,...] per body row ])] for one route file."""
    path = os.path.join(MD, f"LINIJA_{route[1:]}.md")
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()

    sections = []
    service = None
    table = None
    for ln in lines:
        if ln.startswith("## "):
            low = ln.lower()
            service = next((sid for key, sid in SERVICE_BY_HEADER if key in low), None)
            table = None
            continue
        if service and ln.lstrip().startswith("|"):
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            if table is None:
                table = {"header": cells, "rows": []}
            elif set("".join(cells)) <= set("-: "):
                continue  # separator row |---|---|
            else:
                table["rows"].append(cells)
        elif table is not None:
            sections.append((service, table["rows"]))
            table = None
            service = None
    if table is not None:
        sections.append((service, table["rows"]))
    return sections


def build_route(route):
    stop_ids = STOP_MAPS[route]
    trips = []       # (route, service, trip_id, headsign, dir, shape)
    stop_times = []  # (trip_id, time, time, stop_id, seq, 0, 0)
    for service, rows in parse_sections(route):
        if len(rows) != len(stop_ids):
            raise SystemExit(f"{route}/{service}: {len(rows)} rows != "
                             f"{len(stop_ids)} stops in map")
        # Verify row labels line up with the fixed stop map.
        for i, row in enumerate(rows):
            got, want = label_of(row[0]), EXPECT_LABELS[route][i]
            if got != want:
                raise SystemExit(f"{route}/{service} row {i}: label '{got}' "
                                 f"!= expected '{want}'")
        ncols = len(rows[0]) - 1  # minus the label column
        for c in range(1, ncols + 1):
            dep0, tag = hhmm(rows[0][c])
            if dep0 is None:
                raise SystemExit(f"{route}/{service} col {c}: no A.kolodvor time")
            trip_id = f"{route}_{service}_{tag}"
            trips.append((route, service, trip_id, HEADSIGN[route], "0", SHAPE_ID[route]))
            seq = 0
            for i in range(len(rows)):
                t, _ = hhmm(rows[i][c])
                if t is None:
                    continue
                seq += 1
                stop_times.append((trip_id, t, t, stop_ids[i], str(seq), "0", "0"))
    return trips, stop_times


def main():
    all_trips, all_st = [], []
    for route in TARGET_ROUTES:
        tr, st = build_route(route)
        n_patterns = len({tuple(s[3] for s in st if s[0] == t[2]) for t in tr})
        print(f"{route}: {len(tr)} trips, {n_patterns} distinct stop pattern(s)")
        all_trips += tr
        all_st += st

    # --- stops.txt: add STOP_KAUFLAND if missing ---
    stops_path = os.path.join(GTFS, "stops.txt")
    with open(stops_path, encoding="utf-8") as f:
        stop_rows = list(csv.reader(f))
    if not any(r and r[0] == KAUFLAND[0] for r in stop_rows):
        stop_rows.append(list(KAUFLAND))
        with open(stops_path, "w", newline="", encoding="utf-8") as f:
            csv.writer(f, lineterminator="\r\n").writerows(stop_rows)
        print(f"Added {KAUFLAND[0]} to stops.txt")
    else:
        print(f"{KAUFLAND[0]} already in stops.txt")

    # --- trips.txt: replace target-route rows, keep the rest ---
    trips_path = os.path.join(GTFS, "trips.txt")
    with open(trips_path, encoding="utf-8") as f:
        rd = list(csv.reader(f))
    header, body = rd[0], rd[1:]
    kept = [r for r in body if r[0] not in TARGET_ROUTES]
    new = [[r[0], r[1], r[2], r[3], r[4], r[5]] for r in all_trips]
    with open(trips_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\r\n")
        w.writerow(header)
        w.writerows(kept + new)
    print(f"trips.txt: {len(kept)} kept + {len(new)} rebuilt = {len(kept)+len(new)}")

    # --- stop_times.txt: replace target-route trips, keep the rest ---
    st_path = os.path.join(GTFS, "stop_times.txt")
    with open(st_path, encoding="utf-8") as f:
        rd = list(csv.reader(f))
    header, body = rd[0], rd[1:]
    kept = [r for r in body if not any(r[0].startswith(rt + "_") for rt in TARGET_ROUTES)]
    with open(st_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\r\n")
        w.writerow(header)
        w.writerows(kept + [list(s) for s in all_st])
    print(f"stop_times.txt: {len(kept)} kept + {len(all_st)} rebuilt = "
          f"{len(kept)+len(all_st)}")


if __name__ == "__main__":
    main()
