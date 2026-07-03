#!/usr/bin/env python3
"""Generate road-following shapes.txt by snapping each route's stop sequence
onto the street network, and wire shape_id into trips.txt.

For every distinct stop pattern of every route, this routes CAR between each
consecutive pair of stops via a locally-running OpenTripPlanner instance
(see scripts/otp.sh) and stitches the returned street geometry into one shape.
The result is a polyline that follows the actual roads through the stops,
instead of straight lines.

Why regenerate rather than reuse the old shapes? The previously committed
shapes were drawn against an earlier version of the stops and sit 0.6-3 km away
from the current stop_times on most routes, so they could not be wired in.

Prereq: OTP running locally (scripts/otp.sh) on $OTP_URL (default :8080).
Run from repo root:  python3 tools/gen_shapes.py
Then: scripts/validate.sh  &&  scripts/otp.sh --rebuild

Idempotent: overwrites gtfs/shapes.txt and rewrites gtfs/trips.txt each run.
"""
import csv, json, math, os, pathlib, sys, urllib.parse, urllib.request
from collections import defaultdict, OrderedDict

ROOT = pathlib.Path(__file__).resolve().parent.parent
GTFS = ROOT / "gtfs"
OTP_URL = os.environ.get("OTP_URL", "http://localhost:8080")
ROUTER = f"{OTP_URL}/otp/routers/default/plan"
# A weekday/time is required by the API but irrelevant for CAR geometry.
DATE, TIME = "2026-06-29", "10:00"

# Shapes hand-corrected in the web editor (drag stops / redraw line). These are
# preserved VERBATIM from the current gtfs/shapes.txt and never regenerated, so
# manual route work survives a re-run. Remove an id here to let it regenerate.
LOCKED_SHAPES = {"SHP_L1_0", "SHP_L2_0"}


def haversine(a, b):
    R = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def decode_polyline(s):
    """Decode a Google-encoded polyline (precision 5) -> [(lat, lon), ...]."""
    pts, lat, lng, i, n = [], 0, 0, 0, len(s)
    while i < n:
        for is_lat in (True, False):
            shift, result = 0, 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                result |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            d = ~(result >> 1) if (result & 1) else (result >> 1)
            if is_lat:
                lat += d
            else:
                lng += d
        pts.append((lat / 1e5, lng / 1e5))
    return pts


def car_route(frm, to):
    """Road geometry [(lat,lon),...] from stop `frm` to `to`, or None."""
    q = urllib.parse.urlencode({
        "fromPlace": f"{frm[0]},{frm[1]}",
        "toPlace": f"{to[0]},{to[1]}",
        "date": DATE, "time": TIME, "mode": "CAR", "numItineraries": 1,
    })
    try:
        with urllib.request.urlopen(f"{ROUTER}?{q}", timeout=30) as r:
            d = json.load(r)
    except Exception as e:
        print(f"    ! routing error {frm}->{to}: {e}", file=sys.stderr)
        return None
    its = (d.get("plan") or {}).get("itineraries") or []
    if not its:
        return None
    pts = []
    for leg in its[0]["legs"]:
        g = (leg.get("legGeometry") or {}).get("points")
        if g:
            pts.extend(decode_polyline(g))
    return pts or None


def main():
    stops = {r["stop_id"]: (float(r["stop_lat"]), float(r["stop_lon"]))
             for r in csv.DictReader(open(GTFS / "stops.txt"))}

    # Preserve locked (hand-corrected) shapes verbatim from the current file.
    existing_shapes = defaultdict(list)
    if (GTFS / "shapes.txt").exists():
        for r in csv.DictReader(open(GTFS / "shapes.txt")):
            existing_shapes[r["shape_id"]].append(r)

    # Ordered stop sequence per trip.
    seq_rows = defaultdict(list)
    for r in csv.DictReader(open(GTFS / "stop_times.txt")):
        seq_rows[r["trip_id"]].append((int(r["stop_sequence"]), r["stop_id"]))
    trip_seq = {t: tuple(s for _, s in sorted(v)) for t, v in seq_rows.items()}

    trips = list(csv.DictReader(open(GTFS / "trips.txt")))
    trip_fields = list(trips[0].keys())

    # One shape per (route_id, direction_id), named SHP_<route>_<dir>. The
    # representative path is the trip with the most stops in that group (the
    # fullest variant) -- this matches how web/build_map.py picks its line, so
    # the GTFS feed and the web app share identical road geometry.
    group_trips = defaultdict(list)  # (route, dir) -> [trip]
    for t in trips:
        group_trips[(t["route_id"], t["direction_id"])].append(t)

    trip_shape = {}             # trip_id -> shape_id
    shape_seqs = OrderedDict()  # shape_id -> representative ordered stop tuple
    for (route, direction) in sorted(group_trips):
        ts = group_trips[(route, direction)]
        rep = max(ts, key=lambda t: len(trip_seq[t["trip_id"]]))
        sid = f"SHP_{route}_{direction}"
        shape_seqs[sid] = trip_seq[rep["trip_id"]]
        for t in ts:
            trip_shape[t["trip_id"]] = sid

    # Build road geometry per shape, caching per stop-pair.
    pair_cache = {}
    shapes_out = OrderedDict()
    quality = {}
    for sid, pat in shape_seqs.items():
        if sid in LOCKED_SHAPES and sid in existing_shapes:
            print(f"  {sid}: LOCKED — keeping existing hand-corrected geometry")
            continue
        print(f"  {sid}: routing {len(pat)-1} legs through {len(pat)} stops ...")
        poly = []
        for a, b in zip(pat, pat[1:]):
            if (a, b) not in pair_cache:
                geom = car_route(stops[a], stops[b])
                if geom is None:
                    print(f"    ! no route {a}->{b}; using straight segment", file=sys.stderr)
                    geom = [stops[a], stops[b]]
                pair_cache[(a, b)] = geom
            geom = pair_cache[(a, b)]
            for p in geom:
                if not poly or haversine(poly[-1], p) > 0.5:  # drop dup/jitter
                    poly.append(p)
        shapes_out[sid] = poly
        # Quality: farthest stop from its own shape.
        md = max(min(haversine(stops[s], q) for q in poly) for s in pat)
        quality[sid] = md

    # Write shapes.txt
    with open(GTFS / "shapes.txt", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["shape_id", "shape_pt_lat", "shape_pt_lon",
                    "shape_pt_sequence", "shape_dist_traveled"])
        for sid in shape_seqs:
            if sid in LOCKED_SHAPES and sid in existing_shapes:
                for r in existing_shapes[sid]:
                    w.writerow([sid, r["shape_pt_lat"], r["shape_pt_lon"],
                                r["shape_pt_sequence"], r.get("shape_dist_traveled", "")])
                continue
            poly = shapes_out[sid]
            dist = 0.0
            for i, p in enumerate(poly):
                if i:
                    dist += haversine(poly[i - 1], p)
                w.writerow([sid, f"{p[0]:.6f}", f"{p[1]:.6f}", i, round(dist, 1)])

    # Rewrite trips.txt with shape_id appended (if absent).
    if "shape_id" not in trip_fields:
        trip_fields.append("shape_id")
    for t in trips:
        t["shape_id"] = trip_shape[t["trip_id"]]
    with open(GTFS / "trips.txt", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=trip_fields)
        w.writeheader()
        w.writerows(trips)

    print(f"\nWrote {len(shapes_out)} shapes; wired shape_id into {len(trips)} trips.")
    print("Max stop-to-shape distance per shape (should be small, <~50 m):")
    for sid in shapes_out:
        flag = "" if quality[sid] < 60 else "  <-- CHECK"
        print(f"  {sid:12} {quality[sid]:6.0f} m  ({len(shapes_out[sid])} pts){flag}")


if __name__ == "__main__":
    main()
