#!/usr/bin/env bash
#
# Run OpenTripPlanner locally against the GTFS feed in gtfs/ so you can
# preview trips on a map in your browser (a Google-Maps-style planner).
#
# Usage:
#   scripts/otp.sh            # build graph (if needed) + serve on :8080
#   scripts/otp.sh --rebuild  # force re-download OSM + rebuild graph
#
# First run downloads the OTP jar (~100 MB) and an OSM extract for the
# feed's bounding box. Both are cached in otp/ (gitignored).
# Requires: java 17+, curl, zip.

set -euo pipefail

VERSION="${OTP_VERSION:-2.4.0}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OTP_DIR="$REPO_ROOT/otp"
JAR="$OTP_DIR/otp-${VERSION}-shaded.jar"
JAR_URL="https://repo1.maven.org/maven2/org/opentripplanner/otp/${VERSION}/otp-${VERSION}-shaded.jar"
OSM_XML="$OTP_DIR/slavonski-brod.osm.xml"
OSM="$OTP_DIR/slavonski-brod.osm.pbf"
VENV="$OTP_DIR/venv"
GTFS_ZIP="$OTP_DIR/gtfs.zip"
GRAPH="$OTP_DIR/graph.obj"

# Bounding box of the feed (minlon,minlat,maxlon,maxlat), padded.
BBOX="17.9429,45.1101,18.0839,45.2249"

command -v java >/dev/null || { echo "error: java not found (need 17+)" >&2; exit 1; }
command -v zip  >/dev/null || { echo "error: zip not found" >&2; exit 1; }

mkdir -p "$OTP_DIR"

# 1. OTP jar
if [[ ! -f "$JAR" ]]; then
  echo "Downloading OpenTripPlanner v${VERSION} (~100 MB) ..."
  curl -fSL "$JAR_URL" -o "$JAR" || { echo "error: OTP download failed" >&2; rm -f "$JAR"; exit 1; }
fi

# 2. OSM extract. Overpass returns XML, but OTP 2.x only reads PBF, so we
#    convert with pyosmium (installed into a local venv on first run).
if [[ "${1:-}" == "--rebuild" || ! -f "$OSM" ]]; then
  echo "Downloading OSM extract for bbox ${BBOX} ..."
  curl -fSL "https://overpass-api.de/api/map?bbox=${BBOX}" -o "$OSM_XML" \
    || { echo "error: OSM download failed" >&2; rm -f "$OSM_XML"; exit 1; }

  if [[ ! -x "$VENV/bin/python" ]]; then
    echo "Setting up pyosmium (XML->PBF converter) ..."
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install --quiet osmium
  fi

  echo "Converting OSM XML -> PBF ..."
  "$VENV/bin/python" - "$OSM_XML" "$OSM" <<'PY'
import sys, osmium
src, dst = sys.argv[1], sys.argv[2]
w = osmium.SimpleWriter(dst)
for obj in osmium.FileProcessor(src):
    w.add(obj)
w.close()
PY
  rm -f "$OSM_XML" "$GRAPH"
fi

# 3. GTFS zip (OTP ingests a zip; rebuild each run so edits are picked up)
echo "Zipping gtfs/ -> $GTFS_ZIP ..."
rm -f "$GTFS_ZIP"
( cd "$REPO_ROOT/gtfs" && zip -q -r "$GTFS_ZIP" . )

# 4. Build graph if missing or rebuild requested
if [[ "${1:-}" == "--rebuild" || ! -f "$GRAPH" ]]; then
  echo "Building graph ..."
  java -Xmx2G -jar "$JAR" --build --save "$OTP_DIR"
fi

# 5. Serve. securePort defaults to 8081, which collides with Expo on this
#    machine, so move it to 8082. HTTP API + map UI stay on 8080.
PORT="${OTP_PORT:-8080}"
SECURE_PORT="${OTP_SECURE_PORT:-8090}"
echo
echo "Starting OTP. Open http://localhost:${PORT} in your browser."
echo "Press Ctrl-C to stop."
java -Xmx2G -jar "$JAR" --load "$OTP_DIR" --port "$PORT" --securePort "$SECURE_PORT"
