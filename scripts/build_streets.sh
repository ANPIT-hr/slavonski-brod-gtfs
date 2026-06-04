#!/usr/bin/env bash
# Regenerate web/streets.js — the list of Slavonski Brod street names used by the
# planner's forgiving "did you mean" address search. Pulls every named highway in
# the city from Overpass (trying a few mirrors, since the main one rate-limits).
#
# Run occasionally (street names rarely change):  bash scripts/build_streets.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/web/streets.js"
QL='[out:json][timeout:60];area["name"="Slavonski Brod"]["admin_level"~"8|9|10"]->.a;way[highway][name](area.a);out tags;'

MIRRORS=(
  "https://overpass.kumi.systems/api/interpreter"
  "https://overpass-api.de/api/interpreter"
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
)

tmp="$(mktemp)"
for m in "${MIRRORS[@]}"; do
  echo "Trying $m ..."
  if curl -s --max-time 70 "$m" --data-urlencode "data=$QL" -H "User-Agent: sb-gtfs/1.0" -o "$tmp" \
     && python3 -c "import json,sys; d=json.load(open('$tmp')); sys.exit(0 if len([e for e in d.get('elements',[]) if e.get('tags',{}).get('name')])>50 else 1)"; then
    echo "  ok"
    break
  fi
  echo "  failed, trying next mirror"
done

python3 - "$tmp" "$OUT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
names = sorted({e["tags"]["name"] for e in d.get("elements", []) if e.get("tags", {}).get("name")})
if len(names) < 50:
    sys.exit("Too few street names (%d) — Overpass likely failed; not overwriting." % len(names))
with open(sys.argv[2], "w", encoding="utf-8") as f:
    f.write("// City street names (OSM, Slavonski Brod) for the planner's forgiving\n")
    f.write("// address search. Regenerate with scripts/build_streets.sh.\n")
    f.write("window.SB_STREETS = ")
    json.dump(names, f, ensure_ascii=False, indent=0)
    f.write(";\n")
print(f"Wrote {sys.argv[2]} with {len(names)} street names")
PY
rm -f "$tmp"
