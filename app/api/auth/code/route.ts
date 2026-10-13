import { NextResponse } from 'next/server'
import { createSession, normalizeEmail, redeemLoginCode, sessionCookie } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST { email, code } → the 6-digit code from the sign-in email, typed into the window that asked
// for it (an assistant's connection window): starts the session there and says where to go next
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = normalizeEmail(body.email)
  const code = String(body.code ?? '').replace(/[^0-9٠-٩]/g, '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  if (!email || code.length !== 6) return NextResponse.json({ ok: false, error: 'اكتب الرمز المكوّن من ٦ أرقام' }, { status: 400 })
  const r = await redeemLoginCode(email, code).catch(e => { console.error(e); return 'expired' as const })
  if (r === 'wrong') return NextResponse.json({ ok: false, error: 'الرمز غير صحيح؛ تحقّق منه في بريدك' }, { status: 400 })
  if (r === 'expired') return NextResponse.json({ ok: false, error: 'انتهت صلاحية الرمز أو استُعمل؛ اطلب رمزًا جديدًا' }, { status: 400 })
  const res = NextResponse.json({ ok: true, next: r.next })
  res.cookies.set(sessionCookie(await createSession(r.user.id)))
  return res
}
