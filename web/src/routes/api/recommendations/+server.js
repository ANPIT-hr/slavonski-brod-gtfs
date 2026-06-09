// GET/PATCH /api/recommendations — the review queue, for us only.
// Gated by REVIEW_TOKEN (Authorization: Bearer <token>, or ?token=<token>).
//   GET  ?status=new|applied|rejected   -> { items: [...] }
//   PATCH { id, status }                -> mark an item applied/rejected
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { Redis } from '@upstash/redis';

const kv = new Redis({
	url: env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL,
	token: env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
});

const LIST_KEY = 'recommendations';
const STATUSES = ['new', 'applied', 'rejected'];

function authed(request, url) {
	const tok = env.REVIEW_TOKEN;
	if (!tok) return false;
	const h = request.headers.get('authorization') || '';
	const bearer = h.startsWith('Bearer ') ? h.slice(7) : '';
	const q = url.searchParams.get('token') || '';
	return bearer === tok || q === tok;
}

const parse = (x) => (typeof x === 'string' ? JSON.parse(x) : x);

export async function GET({ request, url }) {
	if (!authed(request, url)) return json({ error: 'unauthorized' }, { status: 401 });
	try {
		const raw = await kv.lrange(LIST_KEY, 0, -1);
		const items = raw.map(parse);
		const status = url.searchParams.get('status');
		const out = status ? items.filter((i) => i.status === status) : items;
		return json({ ok: true, count: out.length, items: out });
	} catch {
		return json({ error: 'server' }, { status: 500 });
	}
}

export async function PATCH({ request, url }) {
	if (!authed(request, url)) return json({ error: 'unauthorized' }, { status: 401 });
	try {
		const body = await request.json().catch(() => ({}));
		if (!body.id || !STATUSES.includes(body.status)) return json({ error: 'bad' }, { status: 400 });
		const raw = await kv.lrange(LIST_KEY, 0, -1);
		for (let i = 0; i < raw.length; i++) {
			const item = parse(raw[i]);
			if (item.id === body.id) {
				item.status = body.status;
				await kv.lset(LIST_KEY, i, item);
				return json({ ok: true, item });
			}
		}
		return json({ error: 'notfound' }, { status: 404 });
	} catch {
		return json({ error: 'server' }, { status: 500 });
	}
}
