// In-browser trip planner: a Connection-Scan algorithm over the baked schedule,
// plus the per-line timetable and per-stop departure-board queries. Ported
// verbatim from the original app.js — only reshaped into a factory that takes
// the static data (D) and loaded schedule (SCH) instead of reading globals.
import { haversine, fmtT, dowMon0 } from './util.js';

const WALK_MAX = 1000; // metres a rider will walk to/from a stop

/**
 * @param {object} D   GTFS_DATA  (stops, routes, lines)
 * @param {object} SCH GTFS_SCHEDULE (trips, calendar, calendar_dates, transfers)
 */
export function createPlanner(D, SCH) {
	const stopById = {};
	D.stops.forEach((s) => (stopById[s.id] = s));
	const stopName = (id) => (stopById[id] ? stopById[id].name : id);
	const routeMeta = (rid) => D.routes[rid] || { color: '#666', short_name: rid };

	// ---- Connection index (built once) ----
	let ALL_CONNS = [];
	const TRF = {};
	for (const t of SCH.trips) {
		for (let i = 0; i < t.stops.length - 1; i++) {
			const a = t.stops[i],
				b = t.stops[i + 1];
			if (a[2] == null || b[1] == null) continue;
			ALL_CONNS.push({
				ds: a[0],
				dt: a[2],
				as: b[0],
				at: b[1],
				trip: t.id,
				rid: t.route_id,
				svc: t.service_id
			});
		}
	}
	ALL_CONNS.sort((x, y) => x.dt - y.dt);
	for (const [f, to, w] of SCH.transfers) (TRF[f] = TRF[f] || []).push([to, w]);

	const tripById = (id) => SCH.trips.find((t) => t.id === id);

	function servicesForDate(ymd) {
		const dow = dowMon0(ymd),
			active = new Set();
		for (const sid in SCH.calendar) {
			const c = SCH.calendar[sid];
			if (c.days[dow] && ymd >= c.start && ymd <= c.end) active.add(sid);
		}
		for (const e of SCH.calendar_dates) {
			// exceptions override the mask
			if (e.date === ymd)
				e.exception === 1 ? active.add(e.service_id) : active.delete(e.service_id);
		}
		return active;
	}

	function feedWindow() {
		let mn = null,
			mx = null;
		for (const sid in SCH.calendar) {
			const c = SCH.calendar[sid];
			if (!mn || c.start < mn) mn = c.start;
			if (!mx || c.end > mx) mx = c.end;
		}
		return { min: mn, max: mx };
	}

	// A/B poles are separate stops sharing a name; a walk between same-named
	// stops is just crossing the street, so hide it from the itinerary.
	function displayLegs(it) {
		const legs = it.legs.filter((l) => {
			if (l.kind !== 'walk') return true;
			if (l.origin || l.dest) return l.arr - l.dep >= 60; // hide trivial access/egress walks
			return stopName(l.from) !== stopName(l.to); // hide same-pole transfer walks
		});
		return legs.length ? legs : it.legs;
	}

	// Stops walkable from an arbitrary point: those within WALK_MAX (else just
	// the single nearest), nearest first, capped — returns [[stop_id, walkSec]].
	function stopsNear(pt) {
		const ranked = D.stops
			.map((s) => ({ s, d: haversine(pt.lat, pt.lon, s.lat, s.lon) }))
			.sort((a, b) => a.d - b.d);
		const within = ranked.filter((x) => x.d <= WALK_MAX);
		return (within.length ? within : ranked.slice(0, 1))
			.slice(0, 6)
			.map((x) => [x.s.id, Math.max(30, Math.round(x.d / 1.3))]);
	}

	// ---- Connection Scan between two arbitrary points ----
	function planPoints(fromPt, toPt, depSec, ymd) {
		const active = servicesForDate(ymd);
		const arr = {},
			inc = {},
			tripInfo = {};
		for (const [sid, w] of stopsNear(fromPt)) {
			const t = depSec + w;
			if (t < (arr[sid] ?? Infinity)) {
				arr[sid] = t;
				inc[sid] = { k: 'origin', w };
			}
		}
		for (const c of ALL_CONNS) {
			if (!active.has(c.svc)) continue;
			let ti = tripInfo[c.trip];
			if (!ti && (arr[c.ds] ?? Infinity) <= c.dt)
				ti = tripInfo[c.trip] = { boardStop: c.ds, boardTime: c.dt, rid: c.rid };
			if (!ti) continue;
			if (c.at < (arr[c.as] ?? Infinity)) {
				arr[c.as] = c.at;
				inc[c.as] = { k: 'ride', trip: c.trip };
				(TRF[c.as] || []).forEach(([t, w]) => {
					if (c.at + w < (arr[t] ?? Infinity)) {
						arr[t] = c.at + w;
						inc[t] = { k: 'walk', from: c.as, to: t, w, dep: c.at };
					}
				});
			}
		}
		let best = null;
		for (const [sid, w] of stopsNear(toPt)) {
			if (arr[sid] != null) {
				const a = arr[sid] + w;
				if (!best || a < best.a) best = { sid, w, a };
			}
		}
		if (!best) return null;
		const rev = [];
		let cur = best.sid,
			guard = 0;
		while (inc[cur] && inc[cur].k !== 'origin' && guard++ < 100000) {
			const ic = inc[cur];
			if (ic.k === 'walk') {
				rev.push({ kind: 'walk', from: ic.from, to: ic.to, dep: ic.dep, arr: ic.dep + ic.w });
				cur = ic.from;
			} else {
				const ti = tripInfo[ic.trip];
				rev.push({
					kind: 'ride',
					trip: ic.trip,
					rid: ti.rid,
					from: ti.boardStop,
					to: cur,
					dep: ti.boardTime,
					arr: arr[cur]
				});
				cur = ti.boardStop;
			}
		}
		const originWalk = inc[cur] && inc[cur].k === 'origin' ? inc[cur].w : 0;
		rev.push({ kind: 'walk', origin: true, to: cur, dep: depSec, arr: depSec + originWalk });
		const legs = rev.reverse();
		const fr = legs.find((l) => l.kind === 'ride');
		if (fr && legs[0] && legs[0].kind === 'walk' && legs[0].origin) {
			const wdur = legs[0].arr - legs[0].dep;
			legs[0].dep = fr.dep - wdur;
			legs[0].arr = fr.dep;
		}
		legs.push({ kind: 'walk', dest: true, from: best.sid, dep: arr[best.sid], arr: best.a });
		return { legs, arr: best.a };
	}

	function planTopPoints(fromPt, toPt, depSec, ymd, n = 3) {
		const out = [];
		let d = depSec,
			guard = 0;
		while (out.length < n && guard++ < 25) {
			const j = planPoints(fromPt, toPt, d, ymd);
			if (!j) break;
			out.push(j);
			const firstRide = j.legs.find((l) => l.kind === 'ride');
			if (!firstRide) break;
			d = firstRide.dep + 1;
		}
		return out;
	}

	function planTopArrive(fromPt, toPt, arrSec, ymd, n = 3) {
		const MAX_J = 4 * 3600;
		const arrAt = (d) => {
			const j = planPoints(fromPt, toPt, d, ymd);
			return j ? j.arr : Infinity;
		};
		const out = [];
		let target = arrSec;
		for (let k = 0; k < n; k++) {
			let lo = Math.max(0, target - MAX_J),
				hi = target,
				depStar = -1;
			if (arrAt(lo) > target) break;
			while (lo <= hi) {
				const mid = (lo + hi) >> 1;
				if (arrAt(mid) <= target) {
					depStar = mid;
					lo = mid + 1;
				} else hi = mid - 1;
			}
			if (depStar < 0) break;
			const j = planPoints(fromPt, toPt, depStar, ymd);
			if (!j) break;
			out.push(j);
			target = j.arr - 1;
		}
		return out;
	}

	// Stops travelled on a ride leg: hop count + intermediate stop names + headsign.
	function rideStops(l) {
		const t = tripById(l.trip);
		if (!t) return { count: 1, between: [], headsign: '' };
		let bi = t.stops.findIndex((s) => s[0] === l.from && s[2] === l.dep);
		let ai = t.stops.findIndex((s) => s[0] === l.to && s[1] === l.arr);
		if (bi < 0) bi = t.stops.findIndex((s) => s[0] === l.from);
		if (ai < 0) ai = t.stops.findIndex((s, i) => i > bi && s[0] === l.to);
		const between =
			bi >= 0 && ai > bi ? t.stops.slice(bi + 1, ai).map((s) => stopName(s[0])) : [];
		return { count: Math.max(1, ai - bi), between, headsign: t.headsign || '' };
	}

	// ---- Per-line timetable for one service day ----
	function timetable(key, ymd) {
		const active = servicesForDate(ymd);
		const [rid, did] = key.split('|');
		const trips = SCH.trips
			.filter((t) => t.route_id === rid && t.direction_id === did && active.has(t.service_id))
			.sort((a, b) => (a.stops[0] ? a.stops[0][2] : 0) - (b.stops[0] ? b.stops[0][2] : 0));
		if (!trips.length) return null;
		const rep = trips.reduce((m, t) => (t.stops.length > m.stops.length ? t : m), trips[0]);
		const repIds = rep.stops.map((s) => s[0]);
		const cols = trips.map((t) => {
			const cells = new Array(repIds.length).fill('');
			let cur = 0;
			for (const st of t.stops) {
				let j = cur;
				while (j < repIds.length && repIds[j] !== st[0]) j++;
				if (j < repIds.length) {
					cells[j] = fmtT(st[2]);
					cur = j + 1;
				}
			}
			return cells;
		});
		return { rows: repIds.map((sid) => stopName(sid)), cols, count: trips.length };
	}

	// ---- Next departures from a stop across all lines, on a service day ----
	function departureBoard(stopId, ymd, fromSec) {
		const active = servicesForDate(ymd);
		const deps = [];
		for (const t of SCH.trips) {
			if (!active.has(t.service_id)) continue;
			for (const st of t.stops) {
				if (st[0] === stopId && st[2] != null)
					deps.push({ dep: st[2], rid: t.route_id, headsign: t.headsign });
			}
		}
		deps.sort((a, b) => a.dep - b.dep);
		const upcoming = deps.filter((d) => d.dep >= fromSec);
		const list = (upcoming.length ? upcoming : deps).slice(0, 12);
		return { name: stopName(stopId), rows: list, wholeDay: upcoming.length === 0 };
	}

	return {
		stopById,
		stopName,
		routeMeta,
		servicesForDate,
		feedWindow,
		displayLegs,
		stopsNear,
		planPoints,
		planTopPoints,
		planTopArrive,
		rideStops,
		tripById,
		timetable,
		departureBoard
	};
}
