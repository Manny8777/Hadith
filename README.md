# Hadith Encyclopedia

A web version of an Arabic hadith encyclopedia: 245 books, ~340,000 hadith entries, ~30,000 narrators,
isnad chains, topics, lexicon and Quran references. The UI is Arabic (RTL) throughout.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- PostgreSQL via the raw `pg` client (no ORM)
- Deployed on Railway with Docker (`output: 'standalone'`)

## Running locally

Requires Node 20+ and a PostgreSQL database loaded with the encyclopedia data.

```bash
npm install
echo 'DATABASE_URL=postgresql://postgres:localdev@localhost:5432/railway' > .env
docker compose up -d   # optional: local Postgres (restore a backup into it yourself)
npm run dev            # http://localhost:3000
```

`DATABASE_URL` is the only required setting. Never commit it: `.env*` is gitignored, and every
script in `db/` resolves the connection string through `db/dbenv.js`.

## Layout

- `app/` — pages and API routes (`app/api/`)
- `lib/` — database pool and shared helpers
- `db/` — schema, import and maintenance scripts
- `scripts/`, `tests/` — checks and tests (see `package.json` scripts)
- `docs/` — project notes

## License

Code is released under the [MIT License](LICENSE). The hadith texts and related data come from
their original sources and are not covered by this license.
