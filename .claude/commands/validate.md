---
description: Run the MobilityData GTFS validator against the feed and summarise notices
allowed-tools: Bash(./scripts/validate.sh:*), Bash(scripts/validate.sh:*), Read
---

Run the GTFS validator and report results.

1. Run `scripts/validate.sh $ARGUMENTS` (no args validates `gtfs/`; pass a zip/dir path to validate that instead).
2. Read the printed summary. If there are ERRORs, open `validation_report/report.json` and explain each error code, which file/rows it points to, and how to fix it.
3. For WARNINGs, give a one-line note on whether each is worth acting on for this feed (some are expected — e.g. intentional `stop_sequence` gaps).
4. Keep it concise: lead with the headline (clean / N errors / N warnings), then details only if there's something to fix.
