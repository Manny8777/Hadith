#!/usr/bin/env python3
"""Read-only source evidence for the four semantic-review areas.

This script never opens the web database and never mutates the legacy source. It
records bounded structural facts from the Harf snapshot so the audit manifest
can document why the remaining namespace differences are not safe to guess.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "legacy-audit" / "harness"))
import legacy_reader as LR  # noqa: E402

ALLOWED_OUTPUT_ROOT = (ROOT / "db-backup").resolve()


def numeric_columns(db_root: str, table_name: str, names: list[str]) -> dict[str, list[int]]:
    table = LR.Table(db_root, table_name)
    count = table.count()
    return {
        name: LR.read_scalar_values(table, table.field(name), n=count)[0]
        for name in names
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--harf-db", help="HadithDB directory; defaults to HARF_DB or the known install path")
    parser.add_argument("--output", help="JSON output path under ignored db-backup/")
    args = parser.parse_args()

    db_root = LR.find_db(args.harf_db)
    output = Path(args.output) if args.output else ROOT / "db-backup" / f"semantic-review-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    output = output if output.is_absolute() else ROOT / output
    output = output.resolve()
    if not output.is_relative_to(ALLOWED_OUTPUT_ROOT) or output.suffix.lower() != ".json":
        raise RuntimeError("semantic evidence output must be a .json file under db-backup/")
    if output.exists():
        raise RuntimeError(f"refusing to overwrite existing evidence: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)

    translation = numeric_columns(db_root, "NounsTranslation", ["NounID", "ServiceMainID"])
    services = numeric_columns(db_root, "BookTOC_Services", ["MainID"])
    scientist_says = numeric_columns(db_root, "NounsScientistsSays", ["ID", "NScientistID"])
    scientists = numeric_columns(db_root, "NounsScientists", ["ID"])
    reader_ayat = numeric_columns(db_root, "QuranReadersAyat", ["ReaderID", "AyaID"])
    quran_ayat = numeric_columns(db_root, "QuranAyat", ["ID"])
    controversy_tree = numeric_columns(db_root, "HadithControversialTree", ["ID", "NodeID"])
    controversy_desc = numeric_columns(db_root, "HadithControverialDescrp", ["NodeID"])

    scientist_ids = set(scientists["ID"])
    resolved_say_indexes = [
        i for i, scientist_id in enumerate(scientist_says["NScientistID"])
        if scientist_id in scientist_ids
    ]
    tree_ids = set(controversy_tree["ID"])
    tree_node_ids = set(controversy_tree["NodeID"])

    payload = {
        "reportVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "legacyCatalog": str(Path(db_root) / "Catalog.xml"),
        "semanticReview": {
            "narrator_biography": {
                "sourceTable": "NounsTranslation + BookTOC_Services",
                "loader": "db/migrate_narrator_biography.js",
                "translationRows": len(translation["NounID"]),
                "distinctTranslationPairs": len(set(zip(translation["NounID"], translation["ServiceMainID"]))),
                "serviceRows": len(services["MainID"]),
                "decision": "derived_expansion",
                "reason": "NounsTranslation maps each narrator to service MainIDs; the loader streams matching BookTOC_Services rows into one biography row per narrator/service row. Raw mapping rows are not expected to equal destination rows.",
            },
            "narrator_criticism": {
                "sourceTables": ["NounsScientistsSays", "NounsScientists"],
                "loader": "db/migrate_narrator_criticism.js",
                "sourceRows": len(scientist_says["ID"]),
                "scientistRows": len(scientist_ids),
                "rowsResolvingDocumentedJoin": len(resolved_say_indexes),
                "distinctResolvedSayIds": len({scientist_says["ID"][i] for i in resolved_say_indexes}),
                "decision": "source_namespace_preserved",
                "reason": "The documented join is NounsScientistsSays.NScientistID = NounsScientists.ID. The destination intentionally retains resolved scientist identity and source say identity; unresolved/duplicate source lineage is not repaired by guessing.",
            },
            "quran_reader_ayat": {
                "sourceTable": "QuranReadersAyat",
                "relatedTable": "QuranAyat",
                "rows": len(reader_ayat["AyaID"]),
                "distinctReaderAyaIds": len(set(reader_ayat["AyaID"])),
                "directAyaIdMatches": len(set(reader_ayat["AyaID"]) & set(quran_ayat["ID"])),
                "minAyaId": min(reader_ayat["AyaID"]),
                "maxAyaId": max(reader_ayat["AyaID"]),
                "decision": "source_namespace_preserved",
                "reason": "All source AyaID values are outside the QuranAyat.ID namespace in this snapshot. The values are preserved; no sura/aya or encoded-ID remap is fabricated.",
            },
            "controversy_descriptions": {
                "sourceTable": "HadithControverialDescrp",
                "relatedTable": "HadithControversialTree",
                "rows": len(controversy_desc["NodeID"]),
                "directTreeIdMatches": len(set(controversy_desc["NodeID"]) & tree_ids),
                "directTreeNodeIdMatches": len(set(controversy_desc["NodeID"]) & tree_node_ids),
                "unmatchedDescriptionNodeIds": len(set(controversy_desc["NodeID"]) - tree_ids),
                "decision": "source_namespace_preserved",
                "reason": "The description table has a mixed source namespace: most NodeID values match tree IDs, but a residual set does not. The source values are preserved and no guessed remap is applied.",
            },
        },
    }

    temporary = output.with_name(output.name + f".tmp-{os.getpid()}")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, output)
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
