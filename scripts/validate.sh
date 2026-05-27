#!/usr/bin/env bash
#
# Validate the GTFS feed in gtfs/ with the MobilityData Canonical GTFS Validator.
#
# Usage:
#   scripts/validate.sh                 # validate gtfs/ , report -> validation_report/
#   scripts/validate.sh dist/foo.zip    # validate a specific zip or directory
#   GTFS_VALIDATOR_VERSION=8.0.1 scripts/validate.sh
#
# The validator jar is cached in tools/ (gitignored) and downloaded once.
# Requires: java 17+, curl.

set -euo pipefail

VERSION="${GTFS_VALIDATOR_VERSION:-8.0.1}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT="${1:-$REPO_ROOT/gtfs}"
OUT="$REPO_ROOT/validation_report"
TOOLS_DIR="$REPO_ROOT/tools"
JAR="$TOOLS_DIR/gtfs-validator-${VERSION}-cli.jar"
URL="https://github.com/MobilityData/gtfs-validator/releases/download/v${VERSION}/gtfs-validator-${VERSION}-cli.jar"

command -v java >/dev/null || { echo "error: java not found (need 17+)" >&2; exit 1; }

# Download & cache the jar on first run.
if [[ ! -f "$JAR" ]]; then
  echo "Downloading GTFS validator v${VERSION} ..."
  mkdir -p "$TOOLS_DIR"
  curl -fSL "$URL" -o "$JAR" || { echo "error: download failed: $URL" >&2; rm -f "$JAR"; exit 1; }
fi

[[ -e "$INPUT" ]] || { echo "error: input not found: $INPUT" >&2; exit 1; }

echo "Validating: $INPUT"
rm -rf "$OUT"
java -jar "$JAR" --input "$INPUT" --output_base "$OUT"

# Summarise notices by severity from the JSON report.
REPORT="$OUT/report.json"
if [[ -f "$REPORT" ]]; then
  echo
  echo "===== Summary ($REPORT) ====="
  python3 - "$REPORT" <<'PY'
import json, sys
from collections import Counter
r = json.load(open(sys.argv[1]))
notices = r.get("notices", [])
by_sev = Counter()
for n in notices:
    by_sev[n.get("severity", "?")] += n.get("totalNotices", 0)
order = ["ERROR", "WARNING", "INFO"]
for sev in order + [s for s in by_sev if s not in order]:
    if by_sev.get(sev):
        print(f"  {sev:8} {by_sev[sev]}")
if not notices:
    print("  clean — no notices")
print()
for sev in order:
    rows = [n for n in notices if n.get("severity") == sev]
    if not rows:
        continue
    print(f"-- {sev} --")
    for n in sorted(rows, key=lambda x: -x.get("totalNotices", 0)):
        print(f"  {n['code']} x{n.get('totalNotices', 0)}")
    print()
errs = by_sev.get("ERROR", 0)
sys.exit(1 if errs else 0)
PY
else
  echo "warning: no report.json produced at $REPORT" >&2
fi
