# Offline database («الجامع دون إنترنت»)

The installed app can download the whole encyclopedia and then work with no connection: every page
of the site except sign-in, the reader's library and admin, rendered by the site's own code. This
folder builds what it downloads and the offline build of the site.

## How it fits together

- **The database on the device is the site's PostgreSQL database**, run in the browser by PGlite
  (PostgreSQL compiled to WebAssembly, with `pg_trgm` and `unaccent`), so every query the pages make
  runs unchanged. It lives in the browser's private file system (OPFS) in PGlite's `opfs-ahp` layout.
- **The site, built for the browser.** `build-offline-app.mjs` bundles every page, layout and API
  route under `app/` with esbuild into `public/offline/app/`, swapping `@/lib/db` and `next/*` for
  the shims in `lib/offline/runtime/shims/`. `lib/offline/runtime/` renders server components in the
  browser (`resolve.ts`), routes addresses to pages (`core.ts`, `router.ts`), and answers the client
  components' `/api/…` calls with the site's own route handlers (`entry-browser.tsx`). It runs before
  `dev` and `build`, after `copy-offline-assets.mjs` copies PGlite into `public/offline/pglite/`.
- **Downloading.** The data directory is packed as gzip chunks of about 27 MB with a `manifest.json`
  (`pack-pglite.mjs`), hosted as assets of the GitHub release tagged `offline-pg`. Browsers can't
  fetch GitHub release downloads directly (no CORS headers), so the app reads them through
  `/api/offline/files/<name>`; set `OFFLINE_DATA_URL` to serve them from elsewhere. In the browser,
  `public/offline/worker.mjs` fetches the chunks and unpacks them straight into the database's files,
  resuming after a cut connection; `public/offline/pg-worker.mjs` then opens the database.
- **Offline.** `public/sw.js` keeps `/offline`, the offline build and PGlite, and answers every page
  with `/offline` when there is no connection; `app/offline/OfflineApp.tsx` loads the offline build,
  which renders the page that was asked for.
- **Speed.** A phone runs PostgreSQL on one slow core. `offline-indexes.sql` adds indexes only the
  device needs, and `build-query-cache.mjs` stores the answers of the slowest queries (the big
  analysis pages) in the table `offline_query_cache`, read by `lib/offline/runtime/cache.ts`.

## Publishing a new edition

1. Make a fresh public dump (see `db-backup/`), then (about an hour, 25 GB free):

   ```
   python3 scripts/offline/pgdump_to_sql.py db-backup/hadith-public-YYYY-MM-DD.dump out/sql
   node scripts/offline/build-pglite-db.mjs out/sql out/pgdata
   node scripts/offline/build-query-cache.mjs out/pgdata
   node scripts/offline/pack-pglite.mjs out/pgdata out/offline-db YYYY-MM-DD
   ```

2. On GitHub, open the `offline-pg` release (Releases → `offline-pg` → Edit), remove the old
   chunk files and `manifest.json`, and upload the new chunks and `manifest.json` from
   `out/offline-db`.
3. Installed apps see the new version on `/offline` and offer an update.

Upload the chunks before the manifest (or all together in one drop): the manifest is what tells
apps a new edition exists. The site and the edition must match: deploy a site change that the
database build depends on (a new index, a new table) together with a new edition.

## Checking parity

`build-offline-app.mjs --node <file>` builds the same site for Node. To compare a page offline with
the real site on the same data, serve the data directory over the PostgreSQL protocol with
`@electric-sql/pglite-socket`, run `next dev` with `DATABASE_URL` pointing at it, and compare the
text of each page with `renderPathToHtml()` from the Node build.
