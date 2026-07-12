#!/usr/bin/env python3
"""Build dist/slavonski-brod-gtfs.zip from gtfs/.

gtfs/shapes.txt holds the hand-traced geometry the way the map editor saves it:
one primary polyline per route+direction (`SHP_<route>_<dir>`) plus detached
branch spurs (`..._B<n>`). That layout is right for drawing but wrong for GTFS,
where each trip needs ONE continuous shape along its actual stop sequence.

So at build time we compose feed shapes: for every distinct stop pattern, each
consecutive stop pair is matched to the best sub-path across all traced pieces
(primary + spurs) and the sub-paths are stitched into a single polyline. This
mirrors the planner's highlight logic in web/index.html (bestSub/rideRoadSeg).
Trips on routes with no traced geometry (e.g. L0) ship without a shape_id.

The repo's gtfs/*.txt stay untouched — composed shapes.txt and the shape_id
column on trips.txt exist only inside the zip.

Usage: python3 scripts/build_feed.py
"""
import csv
import io
import os
import sys
import zipfile
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GTFS = os.path.join(ROOT, "gtfs")
DIST = os.path.join(ROOT, "dist")
ZIP = os.path.join(DIST, "slavonski-brod-gtfs.zip")

# Road-following shape composition is shared with web/build_map.py so the feed
# and the map draw identical geometry.
sys.path.insert(0, os.path.join(ROOT, "tools"))
from shape_compose import compose  # noqa: E402
from shape_compose import load_traced as _load_traced  # noqa: E402

# Files copied into the zip verbatim. stops.txt, shapes.txt and trips.txt are
# generated: stops.txt to strip the internal "PLACEHOLDER LOCATION" tracking
# markers from stop_desc (tools/coord_status.py reads them; riders must not).
VERBATIM = [
    "agency.txt", "calendar.txt", "calendar_dates.txt", "feed_info.txt",
    "routes.txt", "stop_times.txt",
]


def read_csv(name):
    with open(os.path.join(GTFS, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_traced():
    """{(route_id, direction_id): [piece, ...]} — primary first, then spurs."""
    return _load_traced(read_csv("shapes.txt"))


def main():
    stops = {r["stop_id"]: {"lat": float(r["stop_lat"]), "lon": float(r["stop_lon"])}
             for r in read_csv("stops.txt")}
    trips = read_csv("trips.txt")
    traced = load_traced()

    seq = defaultdict(list)
    for r in read_csv("stop_times.txt"):
        seq[r["trip_id"]].append((int(r["stop_sequence"]), r["stop_id"]))
    pattern_of = {tid: tuple(s for _, s in sorted(rows)) for tid, rows in seq.items()}

    # Compose one feed shape per distinct (route, direction, stop pattern).
    shape_id_of = {}   # (rid, did, pattern) -> shape_id
    shape_rows = []    # rows for the generated shapes.txt
    counters = defaultdict(int)
    trip_shape = {}    # trip_id -> shape_id ("" when route has no traced geometry)
    for t in trips:
        rid, did = t["route_id"], t.get("direction_id", "0")
        pattern = pattern_of.get(t["trip_id"], ())
        pieces = traced.get((rid, did))
        if not pieces or len(pattern) < 2:
            trip_shape[t["trip_id"]] = ""
            continue
        key = (rid, did, pattern)
        if key not in shape_id_of:
            counters[(rid, did)] += 1
            sid = f"SHP_{rid}_{did}_P{counters[(rid, did)]}"
            poly, straight_hops = compose(pattern, stops, pieces)
            note = f" ({straight_hops} straight hop(s))" if straight_hops else ""
            print(f"{sid}: {len(pattern)} stops -> {len(poly)} pts{note}")
            for n, (la, lo) in enumerate(poly, 1):
                shape_rows.append([sid, f"{la:.6f}", f"{lo:.6f}", str(n)])
            shape_id_of[key] = sid
        trip_shape[t["trip_id"]] = shape_id_of[key]

    no_shape = sorted({t["route_id"] for t in trips if not trip_shape[t["trip_id"]]})
    if no_shape:
        print(f"No traced geometry for: {', '.join(no_shape)} — trips ship without shape_id")

    # trips.txt carrying the composed shape_id. The source trips.txt may already
    # have a shape_id column (raw trace ids like SHP_L0_1); overwrite it with the
    # composed per-pattern id (SHP_L0_1_P1) that matches the shapes.txt below —
    # appending a second column would duplicate the header (a validator ERROR).
    trip_fields = list(trips[0].keys())
    if "shape_id" not in trip_fields:
        trip_fields.append("shape_id")
    trips_buf = io.StringIO()
    w = csv.writer(trips_buf, lineterminator="\n")
    w.writerow(trip_fields)
    for t in trips:
        w.writerow([trip_shape[t["trip_id"]] if f == "shape_id" else t[f]
                    for f in trip_fields])

    shapes_buf = io.StringIO()
    w = csv.writer(shapes_buf, lineterminator="\n")
    w.writerow(["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"])
    w.writerows(shape_rows)

    # stops.txt minus the internal coordinate-tracking markers.
    stop_rows = read_csv("stops.txt")
    stop_fields = list(stop_rows[0].keys())
    stripped = 0
    stops_buf = io.StringIO()
    w = csv.writer(stops_buf, lineterminator="\n")
    w.writerow(stop_fields)
    for r in stop_rows:
        if "PLACEHOLDER" in (r.get("stop_desc") or ""):
            r["stop_desc"] = ""
            stripped += 1
        w.writerow([r[f] for f in stop_fields])
    if stripped:
        print(f"Stripped PLACEHOLDER marker from {stripped} stop_desc value(s)")

    os.makedirs(DIST, exist_ok=True)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for name in VERBATIM:  # files at archive root — Google rejects nesting
            z.write(os.path.join(GTFS, name), name)
        z.writestr("stops.txt", stops_buf.getvalue())
        z.writestr("trips.txt", trips_buf.getvalue())
        z.writestr("shapes.txt", shapes_buf.getvalue())
    print(f"\nWrote {os.path.relpath(ZIP, ROOT)}: {len(VERBATIM) + 3} files, "
          f"{len(shape_id_of)} composed shapes, {len(trips)} trips.")


if __name__ == "__main__":
    main()
