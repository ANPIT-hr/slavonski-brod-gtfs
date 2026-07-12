#!/usr/bin/env python3
"""Compose one continuous road-following polyline for a stop pattern from the
hand-traced pieces in shapes.txt (one primary per route+direction plus detached
`_B<n>` branch spurs).

Shared by scripts/build_feed.py (GTFS zip shapes) and web/build_map.py (map
variant lines) so both draw identical geometry. Pure functions — callers do I/O
and pass in parsed rows / stop coords.
"""
import math
import re
from collections import defaultdict

# Looser than the planner highlight: we project stops onto trace segments (not
# just vertices), and real road paths between stops run up to ~2.6x straight-line
# here, while wrong-pass loop detours are 4-15 km — so 3.0x + 100 m separates the
# two cleanly.
SNAP_OK_M = 130          # stop counts as "on" a piece if within this distance
DETOUR = (3.0, 100)      # reject sub-path longer than 3.0 * straight + 100 m
JUNCTION_M = 100         # a branch endpoint "touches" another piece within this
# Adjacent hops share a stop, so the next hop must start (about) where the
# previous ended — same pass of a loop, same side of a junction.
CONTINUITY_M = 200


def haversine_m(a, b):
    r = math.pi / 180.0
    dlat = (b[0] - a[0]) * r
    dlon = (b[1] - a[1]) * r
    h = (math.sin(dlat / 2) ** 2
         + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dlon / 2) ** 2)
    return 2 * 6371000.0 * math.asin(math.sqrt(h))


def load_traced(shape_rows):
    """{(route_id, direction_id): [piece, ...]} — primary first, then spurs.
    `shape_rows` is an iterable of dicts with shape_id / shape_pt_lat /
    shape_pt_lon / shape_pt_sequence. Each piece is a [(lat, lon), ...] line."""
    rows = defaultdict(list)
    for r in shape_rows:
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
    stretch of segments within `snap`. Returns [(seg_index, t, point, dist_m)]."""
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
    """Polyline between two projections on the same piece, oriented a -> b.
    Returns (points, length_m)."""
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
    pass through a junction."""
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
    if options:
        return options
    # Unique-projection rescue: the detour ceiling exists to pick the right pass
    # when a stop matches a loop trace more than once. If each stop projects onto
    # exactly one spot across all pieces (same piece), that sub-path is the only
    # way the trace connects them, so accept it even beyond the ceiling — e.g. a
    # drawn loop extension between two consecutive stops.
    uniq = []
    for piece in pieces:
        if len(piece) < 2:
            continue
        for a in candidates(piece, s1):
            for b in candidates(piece, s2):
                uniq.append((piece, a, b))
    if len(uniq) == 1:
        piece, a, b = uniq[0]
        sub, length = sub_between(piece, a, b)
        if length >= straight - 2 * SNAP_OK_M - 50:
            options.append((length + 2 * (a[3] + b[3]), sub))
    return options


def compose(pattern, stops, pieces):
    """One continuous polyline for a stop pattern: stitch the best sub-path for
    each consecutive stop pair, preferring options that continue from where the
    previous hop ended; a hop no piece covers falls back to straight. Returns
    (points, straight_hop_count). `stops` maps stop_id -> {"lat":..,"lon":..}."""
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
