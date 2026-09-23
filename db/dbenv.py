"""db/dbenv.py — the one place a database URL is resolved for the Python scripts.

Reads DATABASE_URL from the environment, falling back to the repo's .env (gitignored). Never
hardcode a connection string: it leaks the credential into git history.

    import dbenv
    conn = psycopg2.connect(dbenv.url())
"""
from __future__ import annotations

import os
import re
from pathlib import Path

_PATTERN = re.compile(r'^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$', re.M)


def url() -> str:
    value = os.environ.get("DATABASE_URL")
    if value and value.strip():
        return value.strip()
    for candidate in (Path(__file__).resolve().parent.parent / ".env", Path.cwd() / ".env"):
        try:
            text = candidate.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        match = _PATTERN.search(text)
        if match:
            return match.group(1).strip()
    raise RuntimeError("DATABASE_URL is not set and no .env containing DATABASE_URL was found")
