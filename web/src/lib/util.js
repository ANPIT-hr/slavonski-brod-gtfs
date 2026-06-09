// Small framework-agnostic helpers shared by the planner, geocoder and UI.
// Ported verbatim from the original app.js so behaviour is identical.

const R = 6371000; // earth radius, metres

/** Great-circle distance in metres between (a,b) and (c,d). */
export function haversine(a, b, c, d) {
	const r = Math.PI / 180;
	const dLat = (c - a) * r,
		dLon = (d - b) * r;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

/** seconds-after-midnight -> "HH:MM" (handles 25:30 past-midnight trips). */
export function fmtT(sec) {
	const m = ((sec % 86400) + 86400) % 86400;
	return (
		String(Math.floor(m / 3600)).padStart(2, '0') +
		':' +
		String(Math.floor((m % 3600) / 60)).padStart(2, '0')
	);
}

/** "YYYYMMDD" -> 0=Mon … 6=Sun. */
export function dowMon0(ymd) {
	const d = new Date(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8));
	return (d.getDay() + 6) % 7;
}

export const pad2 = (n) => String(n).padStart(2, '0');

/** "YYYYMMDD" -> "YYYY-MM-DD" (HTML date input value). */
export const ymdToInput = (s) => s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);

/** "YYYY-MM-DD" -> "YYYYMMDD". */
export const inputToYmd = (s) => (s || '').replaceAll('-', '');

/** Strip diacritics + lowercase, for forgiving string matching. */
export const deburr = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Levenshtein edit distance. */
export function lev(a, b) {
	const m = a.length,
		n = b.length;
	if (!m) return n;
	if (!n) return m;
	let prev = Array.from({ length: n + 1 }, (_, i) => i),
		cur = new Array(n + 1);
	for (let i = 1; i <= m; i++) {
		cur[0] = i;
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
		}
		[prev, cur] = [cur, prev];
	}
	return prev[n];
}
