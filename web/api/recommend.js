// POST /api/recommend — a rider's stop correction (move / new stop) from
// Development mode. Validated + rate-limited, then pushed onto a Vercel KV list
// for us to review (see /api/recommendations and review.html). Open to anyone;
// the protection here is the whole gate, so keep it strict.
import { kv } from "@vercel/kv";
import crypto from "crypto";

// City bounding box — submitted coords must land inside Slavonski Brod.
const BBOX = { minLat: 45.10, maxLat: 45.25, minLon: 17.90, maxLon: 18.15 };
const RATE_MAX = 20;          // submissions allowed per IP per window
const RATE_WINDOW = 3600;     // seconds
const LIST_KEY = "recommendations";

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const ipHash = (ip) =>
  crypto.createHash("sha256").update(ip + (process.env.IP_SALT || "sb")).digest("hex").slice(0, 16);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method" });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    if (!["move", "new"].includes(body.type)) return res.status(400).json({ error: "type" });
    const lat = num(body.new && body.new.lat), lon = num(body.new && body.new.lon);
    if (lat === null || lon === null) return res.status(400).json({ error: "coords" });
    if (lat < BBOX.minLat || lat > BBOX.maxLat || lon < BBOX.minLon || lon > BBOX.maxLon)
      return res.status(400).json({ error: "bbox" });

    // Rate-limit by client IP (first hop in x-forwarded-for).
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    const rlKey = `rl:${ip}`;
    const n = await kv.incr(rlKey);
    if (n === 1) await kv.expire(rlKey, RATE_WINDOW);
    if (n > RATE_MAX) return res.status(429).json({ error: "rate" });

    const old = body.old && num(body.old.lat) !== null && num(body.old.lon) !== null
      ? { lat: num(body.old.lat), lon: num(body.old.lon) } : null;

    const rec = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "new",
      type: body.type,
      stop_id: typeof body.stop_id === "string" ? body.stop_id.slice(0, 80) : null,
      name: typeof body.name === "string" ? body.name.slice(0, 120) : null,
      old,
      new: { lat: +lat.toFixed(6), lon: +lon.toFixed(6) },
      line: typeof body.line === "string" ? body.line.slice(0, 40) : null,
      accuracy_m: num(body.accuracy_m),
      note: typeof body.note === "string" ? body.note.slice(0, 500) : "",
      ip_hash: ipHash(ip),
      server_ts: Date.now(),
    };
    await kv.lpush(LIST_KEY, rec);   // @vercel/kv serializes the object
    return res.status(200).json({ ok: true, id: rec.id });
  } catch (e) {
    return res.status(500).json({ error: "server" });
  }
}
