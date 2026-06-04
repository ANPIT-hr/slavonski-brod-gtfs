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
import math
import os
import zipfile
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GTFS = os.path.join(ROOT, "gtfs")
DIST = os.path.join(ROOT, "dist")
ZIP = os.path.join(DIST, "slavonski-brod-gtfs.zip")

# Looser than the planner highlight (web/index.html): we project stops onto
# trace segments (not just vertices), and real road paths between stops run up
# to ~2.6x the straight-line distance here, while wrong-pass loop detours are
# 4-15 km — so 3.0x + 100 m still separates the two cleanly.
SNAP_OK_M = 130          # stop counts as "on" a piece if within this distance
DETOUR = (3.0, 100)      # reject sub-path longer than 3.0 * straight + 100 m
JUNCTION_M = 100         # a branch endpoint "touches" another piece within this

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


def haversine_m(a, b):
    r = math.pi / 180.0
    dlat = (b[0] - a[0]) * r
    dlon = (b[1] - a[1]) * r
    h = (math.sin(dlat / 2) ** 2
         + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dlon / 2) ** 2)
    return 2 * 6371000.0 * math.asin(math.sqrt(h))


def load_traced():
    """{(route_id, direction_id): [piece, ...]} — primary first, then spurs.
    Each piece is a [(lat, lon), ...] polyline."""
    rows = defaultdict(list)
    for r in read_csv("shapes.txt"):
        rows[r["shape_id"]].append(
            (int(r["shape_pt_sequence"]),
             float(r["shape_pt_lat"]), float(r["shape_pt_lon"])))
    out = defaultdict(list)
    for sid in sorted(rows):  # SHP_L3_0 sorts before SHP_L3_0_B1 — primary first
        body = sid[4:]
        base = body.rsplit("_B", 1)[0] if "_B" in body else body
        rid, did = base.rsplit("_", 1)
        out[(rid, did)].append([(la, lo) for _, la, lo in sorted(rows[sid])])
    return out


def candidates(piece, s, snap=SNAP_OK_M):
    """All plausible projections of point s onto the polyline: one per contiguous
    stretch of segments within `snap`. A loop route passes the same street more
    than once, so a stop can legitimately project at several spots along the
    trace — each is a candidate, and best_sub picks the pair that yields a sane
    path length. Returns [(seg_index, t, point, dist_m), ...]."""
    hits = []
    for i in range(len(piece) - 1):
        a, b = piece[i], piece[i + 1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        denom = dx * dx + dy * dy
        t = 0.0 if denom == 0 else max(0.0, min(1.0, (
            (s[0] - a[0]) * dx + (s[1] - a[1]) * dy) / denom))
        p = (a[0] + t * dx, a[1] + t * dy)
        d = haversine_m(p, s)
        if d <= snap:
            hits.append((i, t, p, d))
    out = []
    for h in hits:  # keep the best hit of each contiguous run of segments
        if out and h[0] - out[-1][0] <= 2:
            if h[3] < out[-1][3]:
                out[-1] = h
        else:
            out.append(h)
    return out


def sub_between(piece, a, b):
    """Polyline between two projections on the same piece (a, b as returned by
    candidates), oriented a -> b. Returns (points, length_m)."""
    lo, hi = (a, b) if (a[0], a[1]) <= (b[0], b[1]) else (b, a)
    sub = [lo[2]] + piece[lo[0] + 1:hi[0] + 1] + [hi[2]]
    if (a[0], a[1]) > (b[0], b[1]):
        sub = sub[::-1]
    return sub, sum(haversine_m(sub[k], sub[k + 1]) for k in range(len(sub) - 1))


def plausible(length, straight):
    """Road length must sit between straight-line (minus snap slack) and the
    detour ceiling — outside that it's a wrong-pass match on a loop."""
    return (straight - 2 * SNAP_OK_M - 50) <= length <= (DETOUR[0] * straight + DETOUR[1])


def hop_options(pieces, s1, s2):
    """Every plausible road sub-path between two consecutive stops, as a list of
    (score, sub) — single-piece paths plus two-leg trunk<->spur composites that
    pass through a junction (a spur endpoint that lies on the other piece). All
    candidate projections are tried, so loop routes that pass a street twice
    yield one option per pass; compose() picks the one that keeps the shape
    continuous."""
    straight = haversine_m(s1, s2)
    options = []
    for piece in pieces:
        if len(piece) < 2:
            continue
        for a in candidates(piece, s1):
            for b in candidates(piece, s2):
                sub, length = sub_between(piece, a, b)
                if plausible(length, straight):
                    options.append((length + 2 * (a[3] + b[3]), sub))
    if options:
        return options
    # No single piece holds both stops — try crossing pieces at a junction.
    for X in pieces:
        cA = candidates(X, s1)
        if not cA:
            continue
        for Y in pieces:
            if Y is X or len(Y) < 2:
                continue
            cB = candidates(Y, s2)
            if not cB:
                continue
            for j in (X[0], X[-1], Y[0], Y[-1]):
                for jx in candidates(X, j, snap=JUNCTION_M):
                    for jy in candidates(Y, j, snap=JUNCTION_M):
                        for a in cA:
                            legA, lenA = sub_between(X, a, jx)
                            for b in cB:
                                legB, lenB = sub_between(Y, jy, b)
                                if plausible(lenA + lenB, straight):
                                    options.append((lenA + lenB + 2 * (a[3] + b[3]),
                                                    legA + legB[1:]))
    return options


# Adjacent hops share a stop, so the next hop must start (about) where the
# previous one ended — same pass of the loop, same side of a junction. Two
# projections of one stop can still differ a little (trunk vs spur fan-out).
CONTINUITY_M = 200


def compose(pattern, stops, pieces):
    """One continuous polyline for a stop pattern: stitch the best sub-path for
    each consecutive stop pair, preferring options that continue from where the
    previous hop ended; a hop no piece covers falls back to straight."""
    pts = [(stops[s]["lat"], stops[s]["lon"]) for s in pattern]
    out = []
    straight_hops = 0
    prev_end = None
    for i in range(len(pts) - 1):
        options = hop_options(pieces, pts[i], pts[i + 1])
        if prev_end is not None:
            cont = [o for o in options if haversine_m(o[1][0], prev_end) <= CONTINUITY_M]
            options = cont or options
        if options:
            sub = min(options)[1]
        else:
            sub = [pts[i], pts[i + 1]]
            straight_hops += 1
        out.extend(sub[1:] if out else sub)  # skip shared junction point
        prev_end = sub[-1]
    return out, straight_hops


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

    # trips.txt with the shape_id column appended.
    trip_fields = list(trips[0].keys()) + ["shape_id"]
    trips_buf = io.StringIO()
    w = csv.writer(trips_buf, lineterminator="\n")
    w.writerow(trip_fields)
    for t in trips:
        w.writerow([t[f] for f in trip_fields[:-1]] + [trip_shape[t["trip_id"]]])

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
