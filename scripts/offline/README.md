# Offline database («الجامع دون إنترنت»)

The installed app can download the whole encyclopedia and then work with no connection. This folder
builds what it downloads.

## How it fits together

- `build_offline_db.py` turns the public `pg_dump` into one SQLite file (every public table, the
  site's indexes, and FTS5 search indexes that fold Arabic the way `normalize_hadith()` does), then
  cuts it into gzip chunks of about 27 MB with a `manifest.json`.
- The chunks are hosted as assets of a GitHub release tagged `offline-db`. Browsers can't fetch
  GitHub release downloads directly (no CORS headers), so the app reads them through
  `/api/offline/files/<name>` (`app/api/offline/files/[name]/route.ts`). Set `OFFLINE_DATA_URL` to
  serve them from somewhere else (a bucket or CDN); the route then fetches from there.
- In the browser, `public/offline/worker.mjs` downloads the chunks into the browser's private file
  system (resuming after a cut connection), joins them into the database, and answers queries with
  SQLite's WebAssembly build (`@sqlite.org/sqlite-wasm`, copied into `public/offline/sqlite/` by
  `copy-sqlite-wasm.mjs` before `dev` and `build`).
- `app/offline/` is the download screen and the offline reader. With no connection, `public/sw.js`
  answers every page with `/offline`, which shows the page that was asked for from the device copy.

## Publishing a new edition

1. Make a fresh public dump (see `db-backup/`), then build:

   ```
   python3 scripts/offline/build_offline_db.py db-backup/hadith-public-YYYY-MM-DD.dump out/offline-db
   ```

   It takes 15 to 30 minutes and needs about 12 GB free. The version is the dump's date.
2. On GitHub, open the `offline-db` release (Releases → `offline-db` → Edit), remove the old
   `aljami-*.part*.gz` files and `manifest.json`, and drag in the new `aljami-*.part*.gz` files and
   `manifest.json` from `out/offline-db`. Don't upload the `.sqlite` file; it's the unsplit copy
   for testing.
3. Installed apps see the new version on `/offline` and offer an update.

Upload the chunks before the manifest (or all together in one drop): the manifest is what tells
apps a new edition exists.
