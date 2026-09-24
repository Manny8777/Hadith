#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Classify the legacy matn-comparison gap without mutating PostgreSQL."""
from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / "legacy-audit" / "harness"
sys.path.insert(0, str(HARNESS))
import legacy_reader as LR  # noqa: E402

MAX_HADITH_ID = 341616


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", default=str(HARNESS / "matn_hadith_export.jsonl.gz"))
    ap.add_argument("--output", default=str(ROOT / "db-backup" / "matn_hadith_gap_report.json"))
    args = ap.parse_args()

    db = LR.find_db(None)
    all_keys: set[tuple[int, int]] = set()
    valid: set[tuple[int, int]] = set()
    invalid: set[tuple[int, int]] = set()
    raw_rows = 0
    per_shard_duplicates = 0

    for shard in range(1, 34):
        table = LR.Table(db, f"HMatnComparison{shard}")
        n = table.count()
        masters, _ = LR.read_scalar_values(table, table.field("MasterMatnID"), n=n)
        slaves, _ = LR.read_scalar_values(table, table.field("SlaveMatnID"), n=n)
        seen: set[tuple[int, int]] = set()
        for raw_m, raw_s in zip(masters, slaves):
            raw_rows += 1
            key = (int(raw_m or 0), int(raw_s or 0))
            all_keys.add(key)
            if key in seen:
                per_shard_duplicates += 1
            seen.add(key)
            if 0 < key[0] <= MAX_HADITH_ID and 0 < key[1] <= MAX_HADITH_ID:
                valid.add(key)
            else:
                invalid.add(key)

    exported: set[tuple[int, int]] = set()
    with gzip.open(args.export, "rt", encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                row = json.loads(line)
                exported.add((int(row["m"]), int(row["s"])))

    report = {
        "legacy_raw_rows": raw_rows,
        "legacy_distinct_all": len(all_keys),
        "valid_hadith_pairs": len(valid),
        "invalid_distinct_pairs": len(invalid),
        "invalid_breakdown": {
            "nonpositive_component": sum(1 for m, s in invalid if m <= 0 or s <= 0),
            "out_of_range": sum(1 for m, s in invalid if m > MAX_HADITH_ID or s > MAX_HADITH_ID),
        },
        "within_shard_duplicate_rows": per_shard_duplicates,
        "exported_pairs": len(exported),
        "missing_valid_pairs": len(valid - exported),
        "extra_exported_pairs": len(exported - valid),
        "verdict": "resolved-as-invalid-source-placeholders"
        if valid == exported and len(invalid) == 238
        else "investigate",
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True, indent=2))
    return 0 if report["verdict"] == "resolved-as-invalid-source-placeholders" else 1


if __name__ == "__main__":
    raise SystemExit(main())
