// POST /api/recommend — a rider's stop correction (move / new stop) from
// Development mode. Validated + rate-limited, then pushed onto a KV list for us
// to review (see /api/recommendations and /review). Open to anyone; the
// protection here is the whole gate, so keep it strict.
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

// Works with either the Vercel-KV-style env vars or the Upstash-style ones.
const kv = new Redis({
	url: env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL,
	token: env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
});

const BBOX = { minLat: 45.1, maxLat: 45.25, minLon: 17.9, maxLon: 18.15 };
const RATE_MAX = 20; // submissions allowed per IP per window
const RATE_WINDOW = 3600; // seconds
const LIST_KEY = 'recommendations';

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const ipHash = (ip) =>
	crypto
		.createHash('sha256')
		.update(ip + (env.IP_SALT || 'sb'))
		.digest('hex')
		.slice(0, 16);

export async function POST({ request, getClientAddress }) {
	try {
		const body = await request.json().catch(() => ({}));

		if (!['move', 'new'].includes(body.type)) return json({ error: 'type' }, { status: 400 });
		const lat = num(body.new && body.new.lat),
			lon = num(body.new && body.new.lon);
		if (lat === null || lon === null) return json({ error: 'coords' }, { status: 400 });
		if (lat < BBOX.minLat || lat > BBOX.maxLat || lon < BBOX.minLon || lon > BBOX.maxLon)
			return json({ error: 'bbox' }, { status: 400 });

		const ip = getClientAddress() || 'unknown';
		const rlKey = `rl:${ip}`;
		const n = await kv.incr(rlKey);
		if (n === 1) await kv.expire(rlKey, RATE_WINDOW);
		if (n > RATE_MAX) return json({ error: 'rate' }, { status: 429 });

		const old =
			body.old && num(body.old.lat) !== null && num(body.old.lon) !== null
				? { lat: num(body.old.lat), lon: num(body.old.lon) }
				: null;

		const rec = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			status: 'new',
			type: body.type,
			stop_id: typeof body.stop_id === 'string' ? body.stop_id.slice(0, 80) : null,
			name: typeof body.name === 'string' ? body.name.slice(0, 120) : null,
			old,
			new: { lat: +lat.toFixed(6), lon: +lon.toFixed(6) },
			line: typeof body.line === 'string' ? body.line.slice(0, 40) : null,
			accuracy_m: num(body.accuracy_m),
			note: typeof body.note === 'string' ? body.note.slice(0, 500) : '',
			ip_hash: ipHash(ip),
			server_ts: Date.now()
		};
		await kv.lpush(LIST_KEY, rec);
		return json({ ok: true, id: rec.id });
	} catch {
		return json({ error: 'server' }, { status: 500 });
	}
}
