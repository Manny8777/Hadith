# MCP server for الجامع (plan)

Status: built (v1). Open endpoint `https://hadith.dev/mcp` (50 tool calls/day per IP, anonymous answers carry a note inviting sign-up); `https://hadith.dev/mcp/account` behind OAuth sign-in, and personal `hd_…` tokens for `/mcp` (1,000/day). Code: `lib/mcp/` (JSON-RPC over Streamable HTTP, stateless, hand-written — no SDK), `lib/oauth.ts`, `lib/auth.ts` (email-link sign-in via Resend), tables in `db/add_accounts.js`. Tools: search_hadith, get_hadith, get_parallels, search_narrators, get_narrator, list_books. The plan below is kept for reference. Goal: let users connect their AI assistant (Claude, ChatGPT, Cursor, VS Code…)
to the encyclopedia with one URL, so it can search hadiths, read the sanad/matn/takhrij and cite
hadith.dev pages.

## Shape

- **Remote MCP server inside the site**: `https://hadith.dev/mcp`, Streamable HTTP transport.
- One route, `app/mcp/route.ts` (GET/POST/DELETE handlers), built with the official
  `@modelcontextprotocol/sdk` (or Vercel's `mcp-handler`, which wraps it for Next.js route handlers).
  Stateless mode — no session store needed on Railway.
- Reuses `lib/db.ts` and the SQL already behind `app/api/*` (search, hadith, narrators, narrator-info,
  books, lexicon, topics); each tool is a thin wrapper, input validated with zod.
- Read-only and public: no accounts, no OAuth. Deploys with the site; no new env vars.
- Before writing code: read the Next.js 16 route-handler docs in `node_modules/next/dist/docs/`
  (see AGENTS.md) and check the SDK version works with the standalone build.

## Tools (v1)

| Tool | Input | Returns |
|---|---|---|
| `search_hadith` | `query`, `scope` (matn / tarf / all), optional `book_id`, `narrator_id`, `limit` ≤ 20 | id, book, number, matn snippet, link |
| `get_hadith` | `id` (or `book_id` + printed number) | sanad, matn, tarf, المرجع (book, author, edition, ج/ص, مطبوع, حرف), نوع الحديث, الراوي, Dorar ruling, link |
| `get_takhrij` | `id`, `limit` | the other narrations (book, number, matn snippet, link) and mutaba'at/shawahid counts |
| `get_isnad` | `id` | chains: narrators in order, with ids, grades and صيغة التحديث |
| `search_narrators` | `name`, `limit` | id, name, death year, grade |
| `get_narrator` | `id` | biography data, grades, criticism (narrator_criticism), counts, link |
| `list_books` | — | the 245 collections with author, death year, hadith count |
| `lookup_word` | `word` | lexicon (gharib) entries |

Every result carries its `https://hadith.dev/...` link so answers cite the site. Text is returned
with tashkeel as stored; search is diacritic-insensitive via `normalize_arabic()` /
`normalize_hadith()`.

Later: `get_sharh` (commentary texts from hadith_services), `list_topics` / topic items, Qur'an refs,
MCP resources (`hadith://{id}`) and prompts (e.g. «خرّج هذا الحديث»).

## Safeguards

- Hard caps on `limit` (20) and on returned text length per item.
- Per-IP rate limit on `/mcp` (e.g. 60 requests/min), in memory — one Railway instance.
- `statement_timeout` on the heavy search queries so one call can't hold the pool.
- Tool descriptions in Arabic and English, stating that rulings are Dorar's summary of the muhaddith's
  judgment and must be cited as such.

## How users connect (goes on a «للمطورين / MCP» page, in Arabic)

- **Claude (web / desktop)**: Settings → Connectors → Add custom connector → `https://hadith.dev/mcp`
- **Claude Code**: `claude mcp add --transport http hadith https://hadith.dev/mcp`
- **ChatGPT (developer mode), Cursor, VS Code**: add a remote MCP server with the same URL.
- List it in the public MCP registry, and add an `llms.txt` pointing to it.

## Steps

1. Add the SDK + zod; `app/mcp/route.ts` with `search_hadith` and `get_hadith`; test with
   MCP Inspector (`npx @modelcontextprotocol/inspector`) against `npm run dev`.
2. Add the other v1 tools, the caps, the rate limit and the timeouts.
3. Try it from Claude Code and Claude web on a real question («خرّج حديث إنما الأعمال بالنيات»).
4. The developers page + footer link; registry listing.

Estimate: about a day for v1.
