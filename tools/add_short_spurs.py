#!/usr/bin/env python3
"""Add road-following spur shapes for the L1/L3/L5 SHORT stop patterns.

The short patterns skip the opening downtown loop and head straight out, e.g.
L3 goes A.kolodvor -> Budainka directly instead of via Tržnica/Korzo/Borovska.
That direct hop is absent from each route's traced primary shape, so
scripts/build_feed.py's shape composer falls back to a straight line for it.

This routes each shortcut hop via the public OSRM demo server and appends it to
gtfs/shapes.txt as a branch spur `SHP_<route>_0_B1`. build_feed.py (and the web
build) then compose the short pattern along real roads. The full patterns are
unaffected: the spur only covers the shortcut endpoints, so it never matches a
full-pattern hop.

Usage: python3 tools/add_short_spurs.py   (idempotent: re-adds the _B1 spurs)
"""
import csv
import json
import math
import os
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GTFS = os.path.join(ROOT, "gtfs")
SHAPES = os.path.join(GTFS, "shapes.txt")
OSRM = "https://router.project-osrm.org/route/v1/driving/"

# spur_id -> (from_stop, to_stop): a hop absent from the route's traced primary
# shape, routed here so build_feed's composer follows roads instead of a straight
# line. _B1 spurs are the short-pattern shortcuts (skip the opening downtown
# loop). SHP_L3_0_B2 fills a pre-existing gap on L3's return leg (Jadranska ->
# Borovska), which both L3 patterns traverse.
SHORTCUTS = {
    "SHP_L1_0_B1": ("STOP_BUS_STN", "STOP_VINOGRADSKA_1"),
    "SHP_L3_0_B1": ("STOP_BUS_STN", "STOP_BUDAINKA_1"),
    "SHP_L5_0_B1": ("STOP_BUS_STN", "STOP_COLOSSEUM"),
    "SHP_L3_0_B2": ("STOP_JADRANSKA", "STOP_BOROVSKA_B"),
}


def haversine(a, b):
    R = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


def osrm_route(frm, to):
    """[(lat, lon), ...] road geometry, or [frm, to] straight on failure."""
    path = f"{frm[1]:.6f},{frm[0]:.6f};{to[1]:.6f},{to[0]:.6f}"
    url = OSRM + urllib.parse.quote(path) + "?overview=full&geometries=geojson"
    req = urllib.request.Request(url, headers={"User-Agent": "sbprijevoz-shapes/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
        if d.get("code") == "Ok" and d.get("routes"):
            return [(lat, lon) for lon, lat in d["routes"][0]["geometry"]["coordinates"]]
    except Exception as e:  # noqa: BLE001
        print(f"    ! OSRM failed {frm}->{to}: {e}")
    return [frm, to]


def main():
    stops = {r["stop_id"]: (float(r["stop_lat"]), float(r["stop_lon"]))
             for r in csv.DictReader(open(os.path.join(GTFS, "stops.txt"),
                                          encoding="utf-8"))}
    with open(SHAPES, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    header, body = rows[0], rows[1:]
    # Drop any prior spur rows so re-runs stay idempotent.
    body = [r for r in body if r[0] not in SHORTCUTS]

    for sid, (a, b) in SHORTCUTS.items():
        poly = osrm_route(stops[a], stops[b])
        # de-dup near-identical consecutive points
        clean = []
        for p in poly:
            if not clean or haversine(clean[-1], p) > 0.5:
                clean.append(p)
        dist = 0.0
        for i, p in enumerate(clean):
            if i:
                dist += haversine(clean[i - 1], p)
            body.append([sid, f"{p[0]:.6f}", f"{p[1]:.6f}", str(i), f"{dist:.1f}"])
        straight = haversine(stops[a], stops[b])
        print(f"{sid}: {a}->{b}  {len(clean)} pts, {dist:.0f} m road "
              f"(straight {straight:.0f} m)")

    with open(SHAPES, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\r\n")
        w.writerow(header)
        w.writerows(body)
    print(f"Wrote {SHAPES}")


if __name__ == "__main__":
    main()
