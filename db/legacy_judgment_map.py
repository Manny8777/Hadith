"""
Recover the legacy SayID for every row of hadith_judgments.

Why
---
`db/seed.py` loaded hadith_judgments from legacy HadithJudgmentHits + HadithJudgmentSays but stored
only (hadith_id, scientist_id, say_text), dropping the legacy SayID. The source tables
(hadith_judgment_hits.say_id -> hadith_judgment_links.say_id) key on exactly that SayID, so the
provenance of every "قول العالم" was unrecoverable in the app and the detail page guessed each
saying's book from a death year instead.

HadithJudgmentHits has 236,933 records and hadith_judgments has 236,933 rows: the loader inserted one
row per hit in file order, so row id = hit index. This writes that map out; the companion
`db/add_judgment_legacy_say_id.js` verifies the hypothesis against the live rows before applying it.

Usage:  python db/legacy_judgment_map.py [out.tsv]
Needs:  the gitignored legacy-audit/harness/legacy_reader.py and the original app's data root.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
HARNESS = os.path.join(os.path.dirname(HERE), "legacy-audit", "harness")
sys.path.insert(0, HARNESS)

import legacy_reader as lr  # noqa: E402


def main(out_path):
    db = lr.find_db()
    table = lr.Table(db, "HadithJudgmentHits")
    says, _ = lr.read_scalar_values(table, table.field("SayID"))
    hadiths, _ = lr.read_scalar_values(table, table.field("HadithMainID"))
    if len(says) != len(hadiths):
        sys.exit("column length mismatch: %d vs %d" % (len(says), len(hadiths)))

    with open(out_path, "w", encoding="utf-8") as fh:
        for i, (say_id, hadith_id) in enumerate(zip(says, hadiths), start=1):
            fh.write("%d\t%d\t%d\n" % (i, say_id, hadith_id))

    print("wrote %s: %d rows (HadithJudgmentHits records: %d)" % (out_path, len(says), table.count()))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "judgment_map.tsv")
