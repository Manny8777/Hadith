import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { currentUser, newToken, sha256 } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Personal MCP tokens of the signed-in reader. The token itself is shown once, when created.

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'سجّل الدخول أولًا' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim().slice(0, 60) || 'رمز MCP'
  const active = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM api_tokens WHERE user_id = $1 AND revoked_at IS NULL`, [user.id])
  if (active.rows[0].n >= 10) return NextResponse.json({ error: 'لك عشرة رموز فعّالة؛ ألغِ واحدًا أولًا' }, { status: 400 })
  const token = newToken('hd_')
  const r = await pool.query<{ id: number }>(
    `INSERT INTO api_tokens (user_id, name, token_hash) VALUES ($1, $2, $3) RETURNING id`,
    [user.id, name, sha256(token)])
  return NextResponse.json({ id: r.rows[0].id, name, token })
}

export async function DELETE(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'سجّل الدخول أولًا' }, { status: 401 })
  const id = Number(new URL(req.url).searchParams.get('id'))
  await pool.query(`UPDATE api_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, [id, user.id])
  return NextResponse.json({ ok: true })
}
