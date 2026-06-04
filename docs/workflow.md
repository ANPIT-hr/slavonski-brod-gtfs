# Update, build, validate & release workflow

The data flows in three stages:

```
materials/ (PDFs)  →  markdown/ (transcriptions)  →  gtfs/ (GTFS .txt)  →  dist/ (built zip)  →  GitHub Release
```

`materials/` holds the operator's original PDF timetables — the authoritative source.
`markdown/` holds hand-checked transcriptions of those PDFs (one file per line), the human-readable layer the GTFS is built from.
`gtfs/` holds the eight GTFS source files.
`dist/` holds the built `slavonski-brod-gtfs.zip` (gitignored).

---

## Update workflow

Whenever something in the schedule changes:

1. Update the relevant `markdown/LINIJA_*.md` transcription if the source PDF changed.
2. Edit the relevant `.txt` file(s) in `gtfs/`.
3. Bump `feed_version` in `gtfs/feed_info.txt`.
4. If validity is extended, bump `feed_end_date` in `feed_info.txt` **and** `end_date` in `calendar.txt`, **and** add the new year's holidays/school breaks to `calendar_dates.txt`.
5. Build the zip (below).
6. Validate (below).
7. Push the source changes to GitHub.
8. Cut a release with the zip attached — this is what Google sees.

---

## Building the zip

```bash
python3 scripts/build_feed.py
```

The script writes `dist/slavonski-brod-gtfs.zip` with all `.txt` files **at the root** of the archive — not nested inside a folder (Google rejects a folder-wrapped layout). It does three things beyond plain zipping:

1. **Composes per-trip shapes.** `gtfs/shapes.txt` holds hand-traced pieces (one primary polyline per route + detached branch spurs, the way the map editor saves them). The script stitches one continuous shape per distinct stop pattern and adds the `shape_id` column to `trips.txt`. Routes with no traced geometry ship without `shape_id`.
2. **Strips internal markers.** `stop_desc` values containing `PLACEHOLDER` (the coordinate-verification tracker read by `tools/coord_status.py`) are blanked in the zip.
3. Reports straight-hop fallbacks — hops where no traced piece covers the street — so you can see which segments still need tracing.

Verify the layout:

```bash
unzip -l dist/slavonski-brod-gtfs.zip
# Should list 9 files at the root: agency.txt, calendar.txt, ..., shapes.txt
```

---

## Validation

Google requires a clean run from the official **MobilityData GTFS Validator** before they accept a feed.

**Option A — local CLI** (requires Java 11+):

```bash
wget https://github.com/MobilityData/gtfs-validator/releases/latest/download/gtfs-validator-cli.jar
java -jar gtfs-validator-cli.jar -i dist/slavonski-brod-gtfs.zip -o validation_report
# Open validation_report/report.html in a browser
```

**Option B — web validator:** https://gtfs-validator.mobilitydata.org/ (upload the zip, get an HTML report).

The validator output is gitignored. Errors must be fixed; warnings are advisory but most should be addressed.

---

## Pushing source changes to GitHub

The repo lives at https://github.com/ANPIT-hr/slavonski-brod-gtfs (origin already configured, tracking `main`).

Everyday flow after editing files in `gtfs/`:

```bash
git add gtfs/                                               # or specific files: git add gtfs/stop_times.txt
git commit -m "Update L1 weekday schedule for September 2026"
git push
```

Pushing the source files alone does **not** update the feed Google sees. Google fetches the zip attached to the latest GitHub Release. To make a change visible to Google, you must also cut a release (below).

A first-time clone on a different machine:

```bash
git clone https://github.com/ANPIT-hr/slavonski-brod-gtfs.git
cd slavonski-brod-gtfs
```

---

## Publishing a release (what Google actually sees)

Once the source is pushed and the zip is built and validated, cut a GitHub Release with the zip attached. Google polls the `/latest/download/` URL, which always points to the newest release's attached zip — the URL never changes across versions.

```bash
# Tag-and-attach in one go (gh CLI)
gh release create v2026.06 dist/slavonski-brod-gtfs.zip \
  --title "v2026.06 — June 2026 schedule" \
  --notes "Initial publication. Validity 2026-06-01 to 2027-05-31."
```

Tagging convention: `vYYYY.MM` based on when the schedule edition takes effect (e.g. `v2026.06`, `v2027.06`). For mid-cycle corrections add a patch suffix: `v2026.06.1`.

To replace the zip on an existing release without bumping the tag (e.g. fixing a validator error caught after publish):

```bash
gh release upload v2026.06 dist/slavonski-brod-gtfs.zip --clobber
```

The stable URL Google polls:

```
https://github.com/ANPIT-hr/slavonski-brod-gtfs/releases/latest/download/slavonski-brod-gtfs.zip
```

---

## Submitting to Google Maps

1. The submitting party (**Grad Slavonski Brod** or **Terzić-bus**, not a third party) registers as a Transit Partner: https://maps.google.com/transit/
2. In the Transit Partner Dashboard, register the `/latest/download/` URL as the feed source.
3. Google runs their own validation + a manual review (typically 1–6 weeks).
4. If they request fixes, iterate: edit → rebuild → cut a new release with the same tag scheme; the URL stays identical.
5. Goes live in Google Maps once approved.

After approval, Google re-polls the URL on a schedule, so future releases propagate automatically without re-submission.
