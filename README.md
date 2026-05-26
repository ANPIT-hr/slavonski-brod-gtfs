# Slavonski Brod GTFS Feed

GTFS (General Transit Feed Specification) feed for the city bus network of **Slavonski Brod**, operated by **Terzić-bus d.o.o.**

This repository is the source of truth for the feed. Each release publishes a single `slavonski-brod-gtfs.zip` to GitHub Releases at a stable URL that Google Maps polls automatically:

```
https://github.com/ANPIT-hr/slavonski-brod-gtfs/releases/latest/download/slavonski-brod-gtfs.zip
```

The `latest/download/` URL never changes across versions — every new release replaces the file Google fetches.

---

## ⚠️ Not yet ready for Google submission

Two blockers before this feed can go live:

1. **Real stop coordinates** — all 95 stops still use placeholders.
2. **Clean run from the official MobilityData GTFS Validator.**

Details and the full TODO list: [docs/known-issues.md](docs/known-issues.md).

---

## Repository layout

The data flows in three stages — original PDFs, hand-checked markdown transcriptions, then the GTFS files built from them:

```
.
├── README.md                   ← this file
├── .gitignore
│
├── docs/                       ← reference & workflow documentation
│   ├── workflow.md             ← edit → build → validate → release steps
│   ├── gtfs-files.md           ← the eight GTFS files explained
│   └── known-issues.md         ← TODO before v1.0
│
├── materials/                  ← original PDF timetables (authoritative source)
│   ├── LINIJA_0_1-2024.pdf
│   ├── LINIJA_1_1-2024.pdf
│   └── ...
│
├── markdown/                   ← markdown transcriptions of every line's timetable
│   ├── LINIJA_0.md
│   ├── LINIJA_1.md
│   └── ...
│
├── gtfs/                       ← the eight GTFS source files (CSV, .txt extension)
│   ├── agency.txt
│   ├── feed_info.txt
│   ├── calendar.txt
│   ├── calendar_dates.txt
│   ├── routes.txt
│   ├── stops.txt
│   ├── trips.txt
│   └── stop_times.txt
│
├── worksheets/                 ← working files (not part of the feed)
│   └── stops_TODO.csv          ← worksheet for filling in real stop coordinates
│
└── dist/                       ← build output, gitignored
    └── slavonski-brod-gtfs.zip ← regenerated each release, attached to GitHub Releases
```

The published `slavonski-brod-gtfs.zip` is **not committed** — it's a build artifact, regenerated on each release and uploaded to GitHub Releases.

---

## Documentation

- **[docs/workflow.md](docs/workflow.md)** — how to update the feed, build the zip, validate it, push, cut a release, and submit to Google Maps.
- **[docs/gtfs-files.md](docs/gtfs-files.md)** — what each of the eight GTFS files contains, column by column, and when to edit it.
- **[docs/known-issues.md](docs/known-issues.md)** — outstanding blockers and the v1.0 TODO list.

---

## Quick start

```bash
# Build the feed bundle
mkdir -p dist
cd gtfs && zip ../dist/slavonski-brod-gtfs.zip *.txt && cd ..

# Validate (requires Java 11+)
java -jar gtfs-validator-cli.jar -i dist/slavonski-brod-gtfs.zip -o validation_report
```

See [docs/workflow.md](docs/workflow.md) for the full release flow.

---

Source: timetables published at slavonski-brod.hr (January 2024 edition).
