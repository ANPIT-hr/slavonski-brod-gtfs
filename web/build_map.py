#!/usr/bin/env python3
"""Build map data for the Slavonski Brod GTFS viewer.

Reads the GTFS feed in ../gtfs, works out the ordered stop sequence for each
route + direction, snaps each sequence to the real road network using the public
OSRM server, and writes web/src/lib/data/{data,schedule}.json — plain JSON
imported by the SvelteKit app at build time.

Re-run whenever stops.txt / stop_times.txt / trips.txt change:

    python3 web/build_map.py
"""
import csv
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GTFS = os.path.join(HERE, "..", "gtfs")
# Share the road-following shape composer with scripts/build_feed.py so the map's
# per-pattern variant lines match the geometry baked into the GTFS zip.
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
from shape_compose import compose  # noqa: E402
from shape_compose import load_traced as load_pieces  # noqa: E402

DATA_DIR = os.path.join(HERE, "src", "lib", "data")
OUT = os.path.join(DATA_DIR, "data.json")
SCHED_OUT = os.path.join(DATA_DIR, "schedule.json")
OSRM = "https://router.project-osrm.org/route/v1/driving/"

# Footpath transfers for the in-browser trip planner: any two stops within this
# distance are walkable. Walk time = distance / WALK_SPEED (m/s), floored at 30 s.
WALK_THRESHOLD_M = 250
WALK_SPEED = 1.3

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
    {"primary": [[lat, lon], ...], "branches": [[[lat, lon], ...], ...]}}.

    Shape ids look like `SHP_<route_id>_<direction_id>` for the main path; an
    optional `_B<n>` suffix (e.g. `SHP_L3_0_B2`) marks a branch spur that leaves
    the main path — a route can have several. Branches must be kept as separate
    segments: they fan out from a shared junction, so concatenating them into one
    polyline would draw bogus lines jumping back and forth across that junction."""
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
    for sid in sorted(rows):
        if not sid.startswith("SHP_"):
            continue
        body = sid[4:]
        m = re.search(r"_B\d+$", body)  # branch suffix, e.g. _B2
        base = body[: m.start()] if m else body
        rid, did = base.rsplit("_", 1)  # route_id may contain no '_'; dir is last
        seg = [[lat, lon] for _, lat, lon in sorted(rows[sid])]
        entry = out.setdefault((rid, did), {"primary": None, "branches": []})
        if m:
            entry["branches"].append(seg)
        else:
            entry["primary"] = seg
    return out


def parse_time(s):
    """'HH:MM:SS' -> seconds after midnight. GTFS allows >24h for trips that
    run past midnight (e.g. '25:30:00'), so we don't clamp the hour."""
    if not s:
        return None
    h, m, sec = (s.split(":") + ["0", "0"])[:3]
    return int(h) * 3600 + int(m) * 60 + int(sec)


def haversine_m(a_lat, a_lon, b_lat, b_lon):
    R = 6371000.0
    r = math.pi / 180.0
    dlat = (b_lat - a_lat) * r
    dlon = (b_lon - a_lon) * r
    h = (math.sin(dlat / 2) ** 2
         + math.cos(a_lat * r) * math.cos(b_lat * r) * math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


def build_schedule(stops):
    """Bake everything the in-browser planner/timetable needs into schedule.js:
    timed trips, the service calendar (+ exceptions), and walkable transfers.
    Times are seconds-after-midnight ints so past-midnight trips stay ordered."""
    # trip_id -> meta
    tmeta = {}
    for r in read_csv("trips.txt"):
        tmeta[r["trip_id"]] = {
            "route_id": r["route_id"],
            "direction_id": r.get("direction_id", "0"),
            "service_id": r.get("service_id", ""),
            "headsign": r.get("trip_headsign", ""),
        }

    # trip_id -> [(seq, stop_id, arr_sec, dep_sec)]
    raw = {}
    for r in read_csv("stop_times.txt"):
        raw.setdefault(r["trip_id"], []).append((
            int(r["stop_sequence"]), r["stop_id"],
            parse_time(r["arrival_time"]), parse_time(r["departure_time"]),
        ))

    trips_out = []
    for tid, rows in raw.items():
        meta = tmeta.get(tid)
        if not meta:
            continue
        rows.sort()
        stop_list = [[sid, arr, dep] for _, sid, arr, dep in rows]
        trips_out.append({
            "id": tid,
            "route_id": meta["route_id"],
            "direction_id": meta["direction_id"],
            "service_id": meta["service_id"],
            "headsign": meta["headsign"],
            "stops": stop_list,
        })
    trips_out.sort(key=lambda t: (t["route_id"], t["direction_id"],
                                  t["stops"][0][2] if t["stops"] else 0))

    # Service calendar: weekday mask + validity window.
    calendar = {}
    for r in read_csv("calendar.txt"):
        calendar[r["service_id"]] = {
            "days": [int(r[d]) for d in ("monday", "tuesday", "wednesday",
                                         "thursday", "friday", "saturday", "sunday")],
            "start": r["start_date"],
            "end": r["end_date"],
        }

    # Exceptions (add=1 / remove=2 a service on a specific date).
    cal_dates = []
    if os.path.exists(os.path.join(GTFS, "calendar_dates.txt")):
        for r in read_csv("calendar_dates.txt"):
            cal_dates.append({
                "service_id": r["service_id"],
                "date": r["date"],
                "exception": int(r["exception_type"]),
            })

    # Walkable footpaths between nearby stops (both directions).
    slist = list(stops.values())
    transfers = []
    for i in range(len(slist)):
        a = slist[i]
        for j in range(i + 1, len(slist)):
            b = slist[j]
            d = haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
            if d <= WALK_THRESHOLD_M:
                w = max(30, round(d / WALK_SPEED))
                transfers.append([a["id"], b["id"], w])
                transfers.append([b["id"], a["id"], w])

    payload = {
        "trips": trips_out,
        "calendar": calendar,
        "calendar_dates": cal_dates,
        "transfers": transfers,
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SCHED_OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
        f.write("\n")
    print(f"Wrote {SCHED_OUT}: {len(trips_out)} trips, "
          f"{len(calendar)} services, {len(transfers)} transfer links.")


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

    # Distinct stop patterns per (route_id, direction_id), fullest first. A route
    # whose trips skip some stops (e.g. L3's 6:10/7:00 rides skip the downtown
    # loop) has more than one pattern; each gets its own line + variant label so
    # every pattern is visible on the map. Single-pattern routes keep one line.
    pat_map = {}  # (rid, did) -> {stop_ids_tuple: rep_trip_id}
    for tid, stop_ids in seq.items():
        t = trips.get(tid)
        if not t:
            continue
        key = (t["route_id"], t["direction_id"])
        pat_map.setdefault(key, {}).setdefault(tuple(stop_ids), tid)

    # Hand-traced geometry, if present, wins over OSRM. shapes.txt rows look like
    # SHP_<route_id>_<direction_id>; we key them back to (route_id, direction_id).
    traced = load_shapes()          # primary + branch spurs, for single-pattern routes
    pieces = load_pieces(read_csv("shapes.txt"))  # composer input, per (rid, did)
    if traced:
        print(f"Loaded {len(traced)} hand-traced shape(s) from shapes.txt")

    lines = []
    for (rid, did) in sorted(pat_map):
        # fullest pattern first; the rest are "skraćeni" (shortened) variants.
        pats = sorted(pat_map[(rid, did)].items(), key=lambda kv: -len(kv[0]))
        multi = len(pats) > 1
        for idx, (stop_ids_t, tid) in enumerate(pats):
            stop_ids = list(stop_ids_t)
            pts = [stops[s] for s in stop_ids if s in stops]
            variant = None if idx == 0 else ("skraćeni" if len(pats) == 2
                                             else f"varijanta {idx + 1}")
            label = f"{rid} dir {did}" + (f" [{variant}]" if variant else "")
            branches = []
            if multi and (rid, did) in pieces:
                # Compose this exact pattern along the traced pieces so short
                # variants follow their real shortcut instead of the full route.
                geom, straight = compose(stop_ids, stops, pieces[(rid, did)])
                note = f" ({straight} straight hop(s))" if straight else ""
                print(f"Composing {label}: {len(stop_ids)} stops -> {len(geom)} pts{note}")
            elif (rid, did) in traced:
                entry = traced[(rid, did)]
                branches = entry["branches"]
                geom = entry["primary"]
                if geom is None:  # only branches traced — promote first to primary
                    geom = branches.pop(0) if branches else [[p["lat"], p["lon"]] for p in pts]
                total = len(geom) + sum(len(b) for b in branches)
                bnote = f" + {len(branches)} branch(es)" if branches else ""
                print(f"Tracing {label}: {len(geom)} primary{bnote} pts, {total} total")
            else:
                coords = [(p["lon"], p["lat"]) for p in pts]
                print(f"Routing {label}: {len(coords)} stops ({tid})")
                geom = osrm_geometry(coords) if len(coords) >= 2 else None
                if geom is None:
                    geom = [[p["lat"], p["lon"]] for p in pts]
                    print(f"    -> fell back to straight segments")
                time.sleep(1)  # be polite to the public OSRM demo server
            lines.append(
                {
                    "route_id": rid,
                    "direction_id": did,
                    "headsign": trips[tid]["headsign"],
                    "variant": variant,
                    "stop_ids": stop_ids,
                    "geometry": geom,
                    "branches": branches,
                    "snapped": geom is not None and len(geom) > len(pts),
                }
            )

    payload = {
        "stops": list(stops.values()),
        "routes": routes_meta,
        "lines": lines,
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
        f.write("\n")
    print(f"\nWrote {OUT}: {len(stops)} stops, {len(lines)} route shapes.")

    build_schedule(stops)


if __name__ == "__main__":
    main()
