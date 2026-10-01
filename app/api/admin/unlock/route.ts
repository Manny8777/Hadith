import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { clientIp } from '@/lib/analytics'
import { isAdmin, noteFailure, passwordMatches, passwordSet, tooManyTries, unlockCookie } from '@/lib/adminGate'

export const dynamic = 'force-dynamic'

// POST { password } — opens the /admin statistics for 12 hours
export async function POST(req: Request) {
  const user = await currentUser()
  if (!isAdmin(user)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!passwordSet()) return NextResponse.json({ error: 'لم تُضبط كلمة المرور (ADMIN_PASSWORD) على الخادم' }, { status: 503 })
  const ip = clientIp(req)
  if (tooManyTries(ip)) return NextResponse.json({ error: 'محاولاتٌ كثيرة؛ حاول بعد ربع ساعة' }, { status: 429 })
  const body = await req.json().catch(() => ({}))
  if (!passwordMatches(String(body.password ?? ''))) {
    noteFailure(ip)
    return NextResponse.json({ error: 'كلمة المرور غير صحيحة' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(unlockCookie(user!.id))
  return res
}
