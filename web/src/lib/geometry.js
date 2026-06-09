// Road-following geometry for a ride leg: project the board/alight stops onto
// the route's drawn polyline and slice it, so a highlighted route hugs the
// street. Ported verbatim from app.js (which mirrors scripts/build_feed.py):
// projects onto trace *segments* not just vertices, tries every candidate
// projection (loop routes pass a street twice), and stitches trunk<->branch
// hops through a junction. Untraced hops are upgraded to OSRM road geometry.
import { haversine } from './util.js';
import { osrmGeom } from './geo.js';

const HL_SNAP = 130,
	HL_DK = 3.0,
	HL_DC = 100,
	HL_JUNC = 100,
	HL_CONT = 200;

const _hv = (p, q) => haversine(p[0], p[1], q[0], q[1]);
const _cmp = (a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
const _plausible = (len, straight) =>
	len >= straight - 2 * HL_SNAP - 50 && len <= HL_DK * straight + HL_DC;

function projCands(piece, s, snap) {
	const hits = [];
	for (let i = 0; i < piece.length - 1; i++) {
		const a = piece[i],
			b = piece[i + 1],
			dx = b[0] - a[0],
			dy = b[1] - a[1],
			den = dx * dx + dy * dy;
		const t = den === 0 ? 0 : Math.max(0, Math.min(1, ((s[0] - a[0]) * dx + (s[1] - a[1]) * dy) / den));
		const p = [a[0] + t * dx, a[1] + t * dy],
			d = _hv(p, s);
		if (d <= snap) hits.push([i, t, p, d]);
	}
	const out = [];
	for (const h of hits) {
		if (out.length && h[0] - out[out.length - 1][0] <= 2) {
			if (h[3] < out[out.length - 1][3]) out[out.length - 1] = h;
		} else out.push(h);
	}
	return out;
}

function subBetween(piece, a, b) {
	const rev = _cmp(a, b) > 0,
		lo = rev ? b : a,
		hi = rev ? a : b;
	let sub = [lo[2]].concat(piece.slice(lo[0] + 1, hi[0] + 1)).concat([hi[2]]);
	if (rev) sub = sub.slice().reverse();
	let len = 0;
	for (let k = 0; k < sub.length - 1; k++) len += _hv(sub[k], sub[k + 1]);
	return [sub, len];
}

function hopOptions(pieces, s1, s2) {
	const straight = _hv(s1, s2),
		opts = [];
	for (const piece of pieces) {
		if (piece.length < 2) continue;
		for (const a of projCands(piece, s1, HL_SNAP))
			for (const b of projCands(piece, s2, HL_SNAP)) {
				const [sub, len] = subBetween(piece, a, b);
				if (_plausible(len, straight)) opts.push([len + 2 * (a[3] + b[3]), sub]);
			}
	}
	if (opts.length) return opts;
	for (const X of pieces) {
		const cA = projCands(X, s1, HL_SNAP);
		if (!cA.length) continue;
		for (const Y of pieces) {
			if (Y === X || Y.length < 2) continue;
			const cB = projCands(Y, s2, HL_SNAP);
			if (!cB.length) continue;
			for (const j of [X[0], X[X.length - 1], Y[0], Y[Y.length - 1]])
				for (const jx of projCands(X, j, HL_JUNC))
					for (const jy of projCands(Y, j, HL_JUNC))
						for (const a of cA) {
							const [legA, lenA] = subBetween(X, a, jx);
							for (const b of cB) {
								const [legB, lenB] = subBetween(Y, jy, b);
								if (_plausible(lenA + lenB, straight))
									opts.push([lenA + lenB + 2 * (a[3] + b[3]), legA.concat(legB.slice(1))]);
							}
						}
		}
	}
	return opts;
}

function hopSub(pieces, s1, s2, prevEnd) {
	let options = pieces.length ? hopOptions(pieces, s1, s2) : [];
	if (prevEnd && options.length) {
		const cont = options.filter((o) => _hv(o[1][0], prevEnd) <= HL_CONT);
		if (cont.length) options = cont;
	}
	return options.length ? options.reduce((m, o) => (o[0] < m[0] ? o : m))[1] : null;
}

/**
 * @param {object} D       GTFS_DATA (for lines geometry + stops)
 * @param {(id:string)=>object} getTrip  planner.tripById
 */
export function createGeometry(D, getTrip) {
	const stopById = {};
	D.stops.forEach((s) => (stopById[s.id] = s));
	const lineGeoms = {};
	D.lines.forEach((ln) => {
		const k = ln.route_id + '|' + ln.direction_id;
		lineGeoms[k] = [ln.geometry]
			.concat(ln.branches || [])
			.filter((p) => Array.isArray(p) && p.length >= 2);
	});

	function rideLeg(l) {
		const t = getTrip(l.trip);
		if (!t) return null;
		let bi = t.stops.findIndex((s) => s[0] === l.from && s[2] === l.dep);
		let ai = t.stops.findIndex((s) => s[0] === l.to && s[1] === l.arr);
		if (bi < 0) bi = t.stops.findIndex((s) => s[0] === l.from);
		if (ai < 0) ai = t.stops.findIndex((s, i) => i > bi && s[0] === l.to);
		if (bi < 0 || ai <= bi) return null;
		const legStops = t.stops
			.slice(bi, ai + 1)
			.map((s) => stopById[s[0]])
			.filter(Boolean);
		if (legStops.length < 2) return null;
		return { legStops, pieces: lineGeoms[l.rid + '|' + t.direction_id] || [] };
	}

	// Synchronous: matched sub-paths where traced, straight chords where not.
	function rideRoadSeg(l) {
		const a = stopById[l.from],
			b = stopById[l.to];
		const fallback = a && b ? [[a.lat, a.lon], [b.lat, b.lon]] : null;
		const leg = rideLeg(l);
		if (!leg) return fallback;
		const out = [];
		let prevEnd = null;
		for (let i = 0; i < leg.legStops.length - 1; i++) {
			const s1 = [leg.legStops[i].lat, leg.legStops[i].lon],
				s2 = [leg.legStops[i + 1].lat, leg.legStops[i + 1].lon];
			const sub = hopSub(leg.pieces, s1, s2, prevEnd) || [s1, s2];
			for (let k = out.length ? 1 : 0; k < sub.length; k++) out.push(sub[k]);
			prevEnd = sub[sub.length - 1];
		}
		return out.length >= 2 ? out : fallback;
	}

	// Async: untraced hops routed via OSRM driving so even unmapped segments
	// follow the road. Returns the full path only if a hop was actually filled.
	async function fillRideSeg(l) {
		const leg = rideLeg(l);
		if (!leg) return null;
		const out = [];
		let prevEnd = null,
			filled = false;
		for (let i = 0; i < leg.legStops.length - 1; i++) {
			const s1 = [leg.legStops[i].lat, leg.legStops[i].lon],
				s2 = [leg.legStops[i + 1].lat, leg.legStops[i + 1].lon];
			let sub = hopSub(leg.pieces, s1, s2, prevEnd);
			if (!sub) {
				const road = await osrmGeom('driving', s1, s2);
				if (road && road.length >= 2) {
					sub = road;
					filled = true;
				} else sub = [s1, s2];
			}
			for (let k = out.length ? 1 : 0; k < sub.length; k++) out.push(sub[k]);
			prevEnd = sub[sub.length - 1];
		}
		return filled && out.length >= 2 ? out : null;
	}

	return { rideRoadSeg, fillRideSeg };
}
