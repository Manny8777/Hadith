# Production operations

## Architecture

- **Web/API:** Next.js 16 standalone server in a multi-stage, non-root Alpine container.
- **Database:** Railway PostgreSQL, reached only through the private `DATABASE_URL`.
- **Health:** `GET /api/health` verifies both the application process and a live PostgreSQL connection.
- **Deployment:** Railway builds `Dockerfile` and starts `node server.js`. One replica is the cost-conscious default.

## Required and optional environment

| Variable | Required | Default | Purpose |
|---|---:|---:|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string; never commit it |
| `DB_POOL_MAX` | no | `5` | Maximum web-service connections, clamped to 1–20 |
| `DB_POOL_MIN` | no | `0` | Minimum idle connections, clamped to 0–5 |
| `DB_CONNECT_TIMEOUT_MS` | no | `10000` | PostgreSQL connection timeout |
| `DB_STATEMENT_TIMEOUT_MS` | no | `30000` | Server-side statement timeout |
| `DB_QUERY_TIMEOUT_MS` | no | `35000` | Client query timeout |
| `DB_IDLE_TIMEOUT_MS` | no | `30000` | Idle client eviction |
| `DB_MAX_USES` | no | `10000` | Recycle long-lived clients |

The zero minimum connection setting avoids paying for idle PostgreSQL clients. Keep the pool small unless traffic measurements show that more connections improve latency without exhausting the database.

## Release gate

Run these checks before every Railway deployment:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd run smoke -- https://hadith-web-production.up.railway.app
```

The smoke test uses public HTTP routes only and never prints environment variables or credentials.

## Database changes

1. Take and retain a fresh logical backup before applying a migration.
2. Prefer additive, idempotent SQL in `db/`.
3. Record row counts and set-level differences before and after.
4. Apply the smallest transaction possible; do not combine a long data repair with application deployment.
5. Roll back application code independently when a change is backward-compatible.

The 2026-09 takhrij and narrator-relation repairs are already represented in the tracked schema and full reloaders. Their production verification values are:

- `takhrij`: 280,259 distinct memberships
- `narrator_relations`: 11,518 distinct relations, all with `legacy_say_id`

## Railway operations

```powershell
railway.cmd status
railway.cmd logs --service hadith-web --lines 300
railway.cmd up
```

`railway.json` and the Railway dashboard must agree on the Dockerfile, `node server.js`, and `/api/health`. The current Config as Code format remains supported by Railway until at least 2026-12-01.

## Cost controls

- Run one web replica until CPU or latency requires another.
- Keep `DB_POOL_MIN=0` and cap the web pool.
- Retain indexes used by search, narrator, takhrij, and topic joins.
- Prefer pagination already exposed by APIs; do not fetch full tables into the browser.
- Use Railway usage metrics before changing plan or database size. Memory is normally the largest fixed cost for an always-on web and database pair.
- Backups and query optimization are preferable to an oversized application container.

## Incident response

1. Check `/api/health` and recent Railway logs.
2. If the database is unreachable, keep the health check failing rather than serving false-ready responses.
3. If one route regresses, use Railway's deployment rollback to the last successful image.
4. If a recent data repair is implicated, stop writes, restore or roll back transactionally, and compare table counts with the verification queries.
5. Never paste a connection string, `DATABASE_URL`, or Railway token into an issue, chat, or commit.
