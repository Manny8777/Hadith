#!/usr/bin/env python3
"""Optional legacy-side evidence producer for the phase-1 read-only audit.

This never writes PostgreSQL. It reads the optional Harf column store through
legacy-audit/harness/legacy_reader.py and emits a small source-evidence JSON file
for db/audit_data_readonly.js --source-evidence.

The output is intentionally not a full parity report. The JavaScript audit remains
responsible for bounded destination checks; this producer only fingerprints an
available source snapshot and records deterministic table/field layout metadata.

Usage:
  python db/audit_legacy_evidence.py [--harf-db <HadithDB directory>]
                                    [--output <db-backup path>]

The source root may be set with HARF_DB. A hard-coded path is never the only option.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import stat as stat_module
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_OUTPUT_ROOT = ROOT / "db-backup"
HARNESS = ROOT / "legacy-audit" / "harness"
sys.path.insert(0, str(HARNESS))

try:
    import legacy_reader as LR  # type: ignore
except ImportError as exc:  # pragma: no cover - depends on optional local tooling
    raise SystemExit(
        "legacy-audit/harness/legacy_reader.py is unavailable; the web audit "
        "continues with explicit source_unavailable evidence"
    ) from exc


# The roadmap mappings that this optional producer can prove only at source-layout/raw-count level.
SOURCE_TABLES = [
    "Book",
    "BookTOC_Hadith",
    "BookTOC_Services",
    "HadithsServices",
    "HadithsServicesTypes",
    "HadithServicesState",
    "Nouns",
    "NounsTranslation",
    "NounsGarh",
    "NounsGarhLinks",
    "NounsScientistsSays",
    "NounsScientistsSaysLinks",
    "NounsShyoukhTalamize",
    "NounsRelations",
    "HTakhreeg",
    "LexiconItems",
    "LexiconDescrp",
    "Subject",
    "SubjectHit",
    "QuranAyat",
    "QuranAyatKerat",
    "QuranAyatDescrp",
    "QuranReaders",
    "QuranReadersAyat",
    "AsanedHadiths",
    "HadithJudgmentHits",
    "HadithJudgmentLinks",
    "HadithControversialTree",
    "HadithControverialDescrp",
    *[f"HMatnComparison{i}" for i in range(1, 34)],
]


def sha256_file(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def path_is_within(parent: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(parent)
        return True
    except ValueError:
        return False


def lstat_if_present(path: Path):
    try:
        return path.lstat()
    except FileNotFoundError:
        return None


def nearest_existing_path(path: Path) -> Path:
    current = path.absolute()
    while not lstat_if_present(current):
        if current.parent == current:
            raise RuntimeError(f"cannot find an existing parent for output path: {path}")
        current = current.parent
    return current


def git_check(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def is_ignored(path: Path) -> bool:
    result = git_check("check-ignore", "--quiet", "--", str(path))
    if result.returncode == 0:
        return True
    if result.returncode == 1:
        return False
    raise RuntimeError(
        f"git check-ignore failed for {path} with exit code {result.returncode}"
    )


def is_tracked(path: Path) -> bool:
    try:
        relative = path.absolute().relative_to(ROOT)
    except ValueError:
        return False
    result = git_check("ls-files", "--error-unmatch", "--", str(relative))
    if result.returncode == 0:
        return True
    if result.returncode == 1:
        return False
    raise RuntimeError(
        f"git ls-files failed for {path} with exit code {result.returncode}"
    )


def assert_no_link_between(target: Path, boundary: Path, label: str) -> None:
    target = target.absolute()
    boundary = boundary.absolute()
    if not path_is_within(boundary, target):
        raise RuntimeError(f"{label} {target} is outside allowed root {boundary}")

    current = target
    while True:
        stat = lstat_if_present(current)
        is_reparse = False
        is_symlink = stat is not None and stat_module.S_ISLNK(stat.st_mode)
        if stat is not None:
            is_reparse = bool(getattr(stat, "st_file_attributes", 0) & 0x400) if os.name == "nt" else False
        if is_symlink or is_reparse:
            raise RuntimeError(
                f"{label} {target} traverses a symlink or junction at {current}"
            )
        if current == boundary:
            return
        if current.parent == current:
            raise RuntimeError(f"{label} path traversal did not reach {boundary}")
        current = current.parent


def assert_safe_output_parent(path: Path) -> None:
    root = ROOT.resolve(strict=True)
    allowed_root = ALLOWED_OUTPUT_ROOT.absolute()
    if not path_is_within(allowed_root, path.absolute()) or not path_is_within(root, allowed_root):
        raise RuntimeError(
            f"audit output must be contained in ignored db-backup/: {path}"
        )
    if not is_ignored(allowed_root) or not is_ignored(path.absolute().parent):
        raise RuntimeError(f"audit output path is not ignored by Git: {path}")

    assert_no_link_between(allowed_root, root, "audit output root")
    allowed_stat = lstat_if_present(allowed_root)
    if allowed_stat is not None and os.name == "nt" and getattr(allowed_stat, "st_file_attributes", 0) & 0x400:
        raise RuntimeError(f"audit output root traverses a symlink or junction: {allowed_root}")
    parent = path.absolute().parent
    parent_stat = lstat_if_present(parent)
    if parent_stat is not None and not stat_module.S_ISDIR(parent_stat.st_mode):
        raise RuntimeError(f"audit output parent is not a directory: {parent}")
    if parent_stat is not None and os.name == "nt" and getattr(parent_stat, "st_file_attributes", 0) & 0x400:
        raise RuntimeError(f"audit output parent traverses a symlink or junction: {parent}")
    assert_no_link_between(parent, root, "audit output parent")

    physical_parent = Path(os.path.realpath(parent))
    physical_root = Path(os.path.realpath(allowed_root))
    if not path_is_within(physical_root, physical_parent):
        raise RuntimeError(
            f"audit output redirects outside ignored db-backup/: {parent}"
        )


def atomic_create_json(output: Path, payload: dict) -> None:
    # Validate the closest existing physical parent before creating anything. This is
    # important when a not-yet-created custom output directory is requested.
    assert_safe_output_parent(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    assert_safe_output_parent(output)
    if lstat_if_present(output) is not None:
        raise RuntimeError(f"refusing to overwrite an existing audit evidence file: {output}")
    temp = output.with_name(
        f"{output.name}.tmp-{os.getpid()}-{os.urandom(8).hex()}"
    )
    try:
        with temp.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        if lstat_if_present(output) is not None:
            raise RuntimeError(f"refusing to overwrite an existing audit evidence file: {output}")
        os.link(temp, output)
        temp.unlink()
    finally:
        try:
            temp.unlink()
        except FileNotFoundError:
            pass


def safe_output_path(raw_output: str) -> Path:
    if "\x00" in raw_output:
        raise RuntimeError("audit output path contains a NUL byte")
    output = Path(raw_output)
    if not output.is_absolute():
        output = ROOT / output
    output = output.absolute()
    if output.name in {"", ".", ".."}:
        raise RuntimeError("audit output must name a regular evidence JSON file")
    if output.suffix.lower() != ".json":
        raise RuntimeError("audit output must use a .json extension")
    if not path_is_within(ALLOWED_OUTPUT_ROOT, output):
        raise RuntimeError(
            f"audit output must be contained in ignored db-backup/: {output}"
        )
    if not is_ignored(output):
        raise RuntimeError(f"audit output path is not ignored by Git: {output}")
    if is_tracked(output):
        raise RuntimeError(f"refusing to overwrite tracked audit evidence: {output}")

    assert_safe_output_parent(output)
    stat = lstat_if_present(output)
    if stat is not None and not stat.is_file():
        raise RuntimeError(f"refusing to overwrite a non-regular audit evidence file: {output}")
    if stat is not None and os.name == "nt" and getattr(stat, "st_file_attributes", 0) & 0x400:
        raise RuntimeError(f"refusing to overwrite a redirected audit evidence file: {output}")
    if stat is not None:
        assert_no_link_between(output, ROOT, "audit evidence file")
        physical = Path(os.path.realpath(output))
        if not path_is_within(Path(os.path.realpath(ALLOWED_OUTPUT_ROOT)), physical):
            raise RuntimeError(
                f"audit evidence redirects outside ignored db-backup/: {output}"
            )
    return output


def catalog_fingerprint(db_root: Path) -> dict:
    catalog = db_root / "Catalog.xml"
    if not catalog.is_file():
        raise FileNotFoundError(f"root Catalog.xml not found: {catalog}")
    return {
        "algorithm": "sha256",
        "catalogFile": "Catalog.xml",
        "catalogSha256": sha256_file(catalog),
        "catalogBytes": catalog.stat().st_size,
    }


def source_table_evidence(db_root: Path) -> dict:
    evidence = {}
    for name in SOURCE_TABLES:
        table_dir = db_root / name
        if not table_dir.is_dir():
            evidence[name] = {
                "status": "unavailable",
                "reason": "table directory is absent",
            }
            continue
        try:
            table = LR.Table(str(db_root), name)
            count = table.count()
            catalog = table_dir / "Catalog.xml"
            evidence[name] = {
                "status": "available",
                "rawRows": int(count),
                "fieldCount": len(table.fields),
                "catalogSha256": sha256_file(catalog) if catalog.is_file() else None,
            }
        except Exception as exc:  # optional source; preserve a clear failure per table
            evidence[name] = {
                "status": "error",
                "reason": f"{type(exc).__name__}: {exc}",
            }
    return evidence


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--harf-db", default=None, help="HarfDB root containing Catalog.xml")
    parser.add_argument(
        "--output",
        default=str(ROOT / "db-backup" / "source-audit-evidence.json"),
        help="evidence JSON output path (default: ignored db-backup/source-audit-evidence.json)",
    )
    args = parser.parse_args()

    try:
        db_root = Path(LR.find_db(args.harf_db)).resolve()
    except SystemExit as exc:
        print(json.dumps({
            "status": "unavailable",
            "reason": str(exc),
            "next": "Run the web audit without --source-evidence; it will record source_unavailable.",
        }, ensure_ascii=False, indent=2))
        return 2

    try:
        output = safe_output_path(args.output)
    except (OSError, RuntimeError) as exc:
        print(json.dumps({
            "status": "failed",
            "error": f"{type(exc).__name__}: {exc}",
            "next": "Use a new --output file under ignored db-backup/ inside the workspace.",
        }, ensure_ascii=False, indent=2))
        return 2

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "producer": "db/audit_legacy_evidence.py",
        "sourceRevision": "Harf column-store snapshot; no Git revision applies",
        "sourceFingerprint": {
            "algorithm": "sha256",
            "catalogSha256": catalog_fingerprint(db_root)["catalogSha256"],
            "catalogBytes": catalog_fingerprint(db_root)["catalogBytes"],
            "sourceRootBasename": db_root.name,
            "platform": platform.platform(),
        },
        "sourceRoot": "provided path (not a machine-specific hard-coded path)",
        "sourceTables": source_table_evidence(db_root),
        "scope": {
            "fullSourceKeyParity": False,
            "webAuditStillRequired": True,
            "note": "This producer fingerprints source layout/raw counts only. It does not claim set parity or write to PostgreSQL.",
        },
    }
    try:
        atomic_create_json(output, result)
    except (OSError, RuntimeError) as exc:
        print(json.dumps({
            "status": "failed",
            "error": f"{type(exc).__name__}: {exc}",
        }, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps({
        "status": "written",
        "output": str(output),
        "catalogSha256": result["sourceFingerprint"]["catalogSha256"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
