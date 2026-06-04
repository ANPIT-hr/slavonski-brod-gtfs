#!/usr/bin/env python3
"""Regenerate the 'Coordinate status' block in each markdown/LINIJA_*.md.

Source of truth = gtfs/stops.txt: a stop's coordinate is considered SET unless
its stop_desc contains 'PLACEHOLDER'. Stops per line and their order come from
gtfs/stop_times.txt (longest trip of the route) + gtfs/trips.txt.

Idempotent: replaces the content between the COORD-STATUS markers, or inserts a
fresh block right after the H1 title if no markers exist.

Run from repo root:  python3 tools/coord_status.py
"""
import csv, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
GTFS = ROOT / "gtfs"
MD = ROOT / "markdown"

ROUTE_TO_FILE = {"L0":"LINIJA_0","L1":"LINIJA_1","L2":"LINIJA_2","L3":"LINIJA_3",
                 "L4":"LINIJA_4","L5":"LINIJA_5","L6":"LINIJA_6","L1P":"LINIJA_7"}

START = "<!-- COORD-STATUS:START -->"
END = "<!-- COORD-STATUS:END -->"

def load_stops():
    out = {}
    with open(GTFS/"stops.txt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            desc = r.get("stop_desc","") or ""
            out[r["stop_id"]] = (r["stop_name"], "PLACEHOLDER" not in desc)
    return out

def load_trip_routes():
    out = {}
    with open(GTFS/"trips.txt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            out[r["trip_id"]] = r["route_id"]
    return out

def load_route_stop_order(trip_routes):
    # per route: trip_id -> [(seq, stop_id)]
    trips = {}
    with open(GTFS/"stop_times.txt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            trips.setdefault(r["trip_id"], []).append((int(r["stop_sequence"]), r["stop_id"]))
    route_order = {}
    route_allstops = {}
    for tid, seqs in trips.items():
        route = trip_routes.get(tid)
        if not route: continue
        ordered = [sid for _, sid in sorted(seqs)]
        route_allstops.setdefault(route, set()).update(ordered)
        # keep the longest trip's order as canonical
        if route not in route_order or len(ordered) > len(route_order[route]):
            route_order[route] = ordered
    # append any stops missing from the canonical longest trip
    for route, alls in route_allstops.items():
        seen = set(route_order[route])
        for sid in alls - seen:
            route_order[route].append(sid)
    return route_order

def build_block(route, order, stops):
    # dedupe by stop_id, preserving first-occurrence order (loops revisit the terminal)
    seen = set()
    order = [s for s in order if not (s in seen or seen.add(s))]
    lines = []
    total = len(order)
    nset = sum(1 for sid in order if stops.get(sid, ("",False))[1])
    lines.append(START)
    lines.append(f"## Coordinate status — {nset}/{total} stops set")
    lines.append("")
    lines.append("Auto-generated from `gtfs/stops.txt`. ✅ = real coordinate set, ⬜ = still placeholder. Regenerate with `python3 tools/coord_status.py`.")
    lines.append("")
    for sid in order:
        name, is_set = stops.get(sid, (sid, False))
        mark = "✅" if is_set else "⬜"
        lines.append(f"- {mark} {name} `{sid}`")
    lines.append("")
    lines.append(END)
    return "\n".join(lines)

def splice(text, block):
    if START in text and END in text:
        return re.sub(re.escape(START)+r".*?"+re.escape(END), lambda m: block, text, flags=re.S)
    # insert after first line (H1 title)
    nl = text.find("\n")
    head, rest = text[:nl+1], text[nl+1:]
    return head + "\n" + block + "\n" + rest

def main():
    stops = load_stops()
    trip_routes = load_trip_routes()
    order = load_route_stop_order(trip_routes)
    for route, fname in ROUTE_TO_FILE.items():
        if route not in order:
            continue
        path = MD / f"{fname}.md"
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        block = build_block(route, order[route], stops)
        path.write_text(splice(text, block), encoding="utf-8")
        uniq = list(dict.fromkeys(order[route]))
        nset = sum(1 for sid in uniq if stops.get(sid,("",False))[1])
        print(f"{fname}: {nset}/{len(uniq)} set")

if __name__ == "__main__":
    main()
