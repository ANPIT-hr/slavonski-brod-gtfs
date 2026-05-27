#!/usr/bin/env bash
# Raster the official city transit-map PDF into a web overlay image.
# Re-run only if ../materials/AUTOBUSNE LINIJE-A-2 - FINAL.pdf changes.
#
#   bash build_overlay.sh
#
# A2 at full DPI is needlessly huge for a browser overlay, so scale to 2400px
# wide — plenty sharp for tracing stops, still a light download.
set -euo pipefail
cd "$(dirname "$0")"
SRC="../materials/AUTOBUSNE LINIJE-A-2 - FINAL.pdf"
pdftocairo -png -singlefile -scale-to 2400 "$SRC" overlay
echo "Wrote $(pwd)/overlay.png"
