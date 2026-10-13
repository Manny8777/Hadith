import { NextResponse } from 'next/server'
import { createLoginLink, normalizeEmail, safeNext, sendLoginEmail } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST { email, next } → emails a one-time sign-in link and its 6-digit code
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = normalizeEmail(body.email)
  if (!email) return NextResponse.json({ ok: false, error: 'اكتب بريدًا إلكترونيًا صحيحًا' }, { status: 400 })
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'

  const made = await createLoginLink(email, safeNext(body.next), ip).catch(e => { console.error(e); return undefined })
  if (made === undefined) return NextResponse.json({ ok: false, error: 'تعذّر إنشاء الرابط، حاول بعد قليل' }, { status: 500 })
  if (made === null) return NextResponse.json({ ok: false, error: 'طلبتَ روابط كثيرة في ساعةٍ واحدة، حاول لاحقًا' }, { status: 429 })

  const sent = await sendLoginEmail(email, made.link, made.code)
  if (sent === 'unconfigured') return NextResponse.json({ ok: false, error: 'إرسال البريد لم يُفعَّل بعد على الموقع' }, { status: 503 })
  if (sent === 'failed') return NextResponse.json({ ok: false, error: 'تعذّر إرسال البريد، حاول بعد قليل' }, { status: 502 })
  // In development without an email service the link and code are returned so they can be used
  return NextResponse.json({ ok: true, ...(sent === 'logged' ? { devLink: made.link, devCode: made.code } : {}) })
}
