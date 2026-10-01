// First-party statistics for /admin (tables: db/add_analytics.js). No cookies: a visitor is a hash
// of IP + browser + day, so the same person counts once a day and cannot be followed across days.
import { createHash } from 'node:crypto'
import pool from '@/lib/db'

const BOT_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|slack|discord|preview|headless|lighthouse|python|curl|wget|httpclient|okhttp|axios|node-fetch|go-http|java\/|ahrefs|semrush|mj12|petal|yandex|baidu|duckduck|gptbot|claude|perplexity|bytespider|amazonbot|applebot|isnad-project/i

export const isBot = (ua: string) => !ua || BOT_UA.test(ua)
export const deviceOf = (ua: string) => /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop'

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
}

export function visitorHash(ip: string, ua: string): string {
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${ip}|${ua}|${day}|${process.env.ANALYTICS_SALT ?? 'hadith.dev'}`).digest('hex').slice(0, 16)
}

/** Records an MCP event without making the caller wait (a failure is only logged). */
export function logMcpEvent(e: { subject: string; userId: number | null; kind: 'connect' | 'call'; client?: string | null; tool?: string | null; ok?: boolean | null; ms?: number | null }) {
  pool.query(
    `INSERT INTO mcp_events (subject, user_id, kind, client, tool, ok, ms) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [e.subject, e.userId, e.kind, e.client?.slice(0, 80) ?? null, e.tool ?? null, e.ok ?? null, e.ms ?? null],
  ).catch(err => console.error('[mcp_events]', err.message))
}
