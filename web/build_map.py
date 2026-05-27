#!/usr/bin/env python3
"""Build map data for the Slavonski Brod GTFS viewer.

Reads the GTFS feed in ../gtfs, works out the ordered stop sequence for each
route + direction, snaps each sequence to the real road network using the public
OSRM server, and writes web/data.js — a plain JS file (not JSON) so the viewer
can be opened straight from disk with file:// without tripping CORS on fetch().

Re-run whenever stops.txt / stop_times.txt / trips.txt change:

    python3 web/build_map.py
"""
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GTFS = os.path.join(HERE, "..", "gtfs")
OUT = os.path.join(HERE, "data.js")
OSRM = "https://router.project-osrm.org/route/v1/driving/"

# route_color in routes.txt is the same brand blue for every line, which is
# useless for telling lines apart on a map. Assign a distinct, high-contrast
# colour per route_id instead.
PALETTE = {
    "L0": "#e6194b",
    "L1": "#3cb44b",
    "L1P": "#4363d8",
    "L2": "#f58231",
    "L3": "#911eb4",
    "L4": "#008080",
    "L5": "#9a6324",
    "L6": "#800000",
}
FALLBACK_COLORS = ["#46f0f0", "#f032e6", "#bcf60c", "#fabebe", "#808000"]


def read_csv(name):
    with open(os.path.join(GTFS, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def osrm_geometry(coords):
    """Snap an ordered list of (lon, lat) waypoints to roads. Returns a list of
    [lat, lon] points, or None if the routing request fails."""
    path = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in coords)
    url = OSRM + urllib.parse.quote(path) + "?overview=full&geometries=geojson"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = json.load(resp)
    except Exception as e:  # noqa: BLE001 - network of any kind failing -> fall back
        print(f"    OSRM request failed: {e}", file=sys.stderr)
        return None
    if data.get("code") != "Ok" or not data.get("routes"):
        print(f"    OSRM returned no route (code={data.get('code')})", file=sys.stderr)
        return None
    line = data["routes"][0]["geometry"]["coordinates"]  # [lon, lat]
    return [[lat, lon] for lon, lat in line]


def load_shapes():
    """Read gtfs/shapes.txt if present. Returns {(route_id, direction_id):
    [[lat, lon], ...]} keyed from shape_id `SHP_<route_id>_<direction_id>`."""
    path = os.path.join(GTFS, "shapes.txt")
    if not os.path.exists(path):
        return {}
    rows = {}  # shape_id -> [(seq, lat, lon)]
    for r in read_csv("shapes.txt"):
        rows.setdefault(r["shape_id"], []).append(
            (int(r["shape_pt_sequence"]),
             float(r["shape_pt_lat"]), float(r["shape_pt_lon"]))
        )
    out = {}
    for sid, pts in rows.items():
        if not sid.startswith("SHP_"):
            continue
        rid, did = sid[4:].rsplit("_", 1)  # route_id may contain no '_'; dir is last
        out[(rid, did)] = [[lat, lon] for _, lat, lon in sorted(pts)]
    return out


def main():
    stops = {}
    for r in read_csv("stops.txt"):
        stops[r["stop_id"]] = {
            "id": r["stop_id"],
            "name": r["stop_name"],
            "lat": float(r["stop_lat"]),
            "lon": float(r["stop_lon"]),
            "desc": r.get("stop_desc", ""),
        }

    routes_meta = {}
    fb = iter(FALLBACK_COLORS)
    for r in read_csv("routes.txt"):
        rid = r["route_id"]
        routes_meta[rid] = {
            "id": rid,
            "short_name": r.get("route_short_name", rid),
            "long_name": r.get("route_long_name", ""),
            "desc": r.get("route_desc", ""),
            "color": PALETTE.get(rid) or next(fb, "#666666"),
        }

    # trip_id -> route_id, direction_id, headsign
    trips = {}
    for r in read_csv("trips.txt"):
        trips[r["trip_id"]] = {
            "route_id": r["route_id"],
            "direction_id": r.get("direction_id", "0"),
            "headsign": r.get("trip_headsign", ""),
        }

    # trip_id -> ordered [stop_id]
    seq = {}
    for r in read_csv("stop_times.txt"):
        seq.setdefault(r["trip_id"], []).append(
            (int(r["stop_sequence"]), r["stop_id"])
        )
    for tid in seq:
        seq[tid] = [sid for _, sid in sorted(seq[tid])]

    # For each (route_id, direction_id) pick the trip with the most stops as the
    # representative shape — that captures the fullest variant of the line.
    rep = {}  # (route_id, direction_id) -> (trip_id, [stop_id])
    for tid, stop_ids in seq.items():
        t = trips.get(tid)
        if not t:
            continue
        key = (t["route_id"], t["direction_id"])
        if key not in rep or len(stop_ids) > len(rep[key][1]):
            rep[key] = (tid, stop_ids)

    # Hand-traced geometry, if present, wins over OSRM. shapes.txt rows look like
    # SHP_<route_id>_<direction_id>; we key them back to (route_id, direction_id).
    traced = load_shapes()
    if traced:
        print(f"Loaded {len(traced)} hand-traced shape(s) from shapes.txt")

    lines = []
    for (rid, did), (tid, stop_ids) in sorted(rep.items()):
        pts = [stops[s] for s in stop_ids if s in stops]
        coords = [(p["lon"], p["lat"]) for p in pts]
        label = f"{rid} dir {did}"
        if (rid, did) in traced:
            geom = traced[(rid, did)]
            print(f"Tracing {label}: {len(geom)} hand-traced points (shapes.txt)")
        else:
            print(f"Routing {label}: {len(coords)} stops ({tid})")
            geom = osrm_geometry(coords) if len(coords) >= 2 else None
            if geom is None:
                # Fall back to straight stop-to-stop so the line still shows.
                geom = [[p["lat"], p["lon"]] for p in pts]
                print(f"    -> fell back to straight segments")
            time.sleep(1)  # be polite to the public OSRM demo server
        lines.append(
            {
                "route_id": rid,
                "direction_id": did,
                "headsign": trips[tid]["headsign"],
                "stop_ids": stop_ids,
                "geometry": geom,
                "snapped": geom is not None and len(geom) > len(pts),
            }
        )

    payload = {
        "stops": list(stops.values()),
        "routes": routes_meta,
        "lines": lines,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by build_map.py — do not edit by hand.\n")
        f.write("window.GTFS_DATA = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")
    print(f"\nWrote {OUT}: {len(stops)} stops, {len(lines)} route shapes.")


if __name__ == "__main__":
    main()
