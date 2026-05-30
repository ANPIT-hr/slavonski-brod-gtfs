// GET/PATCH /api/recommendations — the review queue, for us only.
// Gated by REVIEW_TOKEN (Authorization: Bearer <token>, or ?token=<token>).
//   GET  ?status=new|applied|rejected   -> { items: [...] }
//   PATCH { id, status }                -> mark an item applied/rejected
import { Redis } from "@upstash/redis";

// Accepts either KV_REST_API_* (Vercel KV) or UPSTASH_REDIS_REST_* (Upstash).
const kv = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const LIST_KEY = "recommendations";
const STATUSES = ["new", "applied", "rejected"];

function authed(req) {
  const tok = process.env.REVIEW_TOKEN;
  if (!tok) return false;
  const h = req.headers["authorization"] || "";
  const bearer = h.startsWith("Bearer ") ? h.slice(7) : "";
  const q = (req.query && req.query.token) || "";
  return bearer === tok || q === tok;
}

const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);

export default async function handler(req, res) {
  if (!authed(req)) return res.status(401).json({ error: "unauthorized" });
  try {
    if (req.method === "GET") {
      const raw = await kv.lrange(LIST_KEY, 0, -1);
      const items = raw.map(parse);
      const status = req.query && req.query.status;
      const out = status ? items.filter((i) => i.status === status) : items;
      return res.status(200).json({ ok: true, count: out.length, items: out });
    }
    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (!body.id || !STATUSES.includes(body.status)) return res.status(400).json({ error: "bad" });
      const raw = await kv.lrange(LIST_KEY, 0, -1);
      for (let i = 0; i < raw.length; i++) {
        const item = parse(raw[i]);
        if (item.id === body.id) {
          item.status = body.status;
          await kv.lset(LIST_KEY, i, item);
          return res.status(200).json({ ok: true, item });
        }
      }
      return res.status(404).json({ error: "notfound" });
    }
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: "server" });
  }
}
