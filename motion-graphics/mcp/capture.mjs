// Captures the hadith.dev pages the MCP film shows (motion-graphics/mcp/shots/*.png) from a running
// copy of the site in development (its sign-in returns the link instead of emailing it). A demo
// account and a demo client named «Claude» are created for the consent page and removed afterwards.
//   node motion-graphics/mcp/capture.mjs [--base http://localhost:3000]
import { chromium } from 'playwright'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:3000'
const EMAIL = 'reader@example.com'
const shot = name => path.join(here, 'shots', `${name}.png`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
const tidy = () => p.addStyleTag({ content: 'nextjs-portal{display:none!important}' })

// 1. login page, with the email typed
await p.goto(BASE + '/login?next=/account', { waitUntil: 'networkidle' })
await tidy()
await p.fill('#login-email', EMAIL)
await p.screenshot({ path: shot('login') })

// 2. sign in (development returns the link), then the account page
const res = await (await fetch(BASE + '/api/auth/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, next: '/account' }) })).json()
await p.goto(res.devLink, { waitUntil: 'networkidle' })
await tidy()
await p.screenshot({ path: shot('account') })

// 3. consent page for a client named «Claude»
const client = await (await fetch(BASE + '/api/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }) })).json()
const challenge = createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url')
await p.goto(`${BASE}/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: challenge, code_challenge_method: 'S256', state: 'x' })}`, { waitUntil: 'networkidle' })
await tidy()
await p.screenshot({ path: shot('consent') })

// 4. the developers page, MCP section
await p.goto(BASE + '/developers', { waitUntil: 'networkidle' })
await tidy()
await p.locator('#mcp').scrollIntoViewIfNeeded()
await p.evaluate(() => window.scrollTo(0, document.getElementById('mcp').getBoundingClientRect().top + scrollY - 90))
await p.waitForTimeout(400)
await p.screenshot({ path: shot('developers') })
await browser.close()

// clean up the demo account and client
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.query(`DELETE FROM users WHERE email = $1`, [EMAIL])
await db.query(`DELETE FROM login_links WHERE email = $1`, [EMAIL])
await db.query(`DELETE FROM oauth_clients WHERE client_id = $1`, [client.client_id])
await db.end()
console.log('shots → motion-graphics/mcp/shots')
