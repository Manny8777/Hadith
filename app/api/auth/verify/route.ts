import { NextResponse } from 'next/server'
import { createSession, sessionCookie, siteOrigin, redeemLoginLink } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET ?token=… — the link in the email: spends it, starts a session, goes on to where the reader was
export async function GET(req: Request) {
  const origin = await siteOrigin()
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const used = token ? await redeemLoginLink(token).catch(() => null) : null
  if (!used) return NextResponse.redirect(new URL('/login?error=expired', origin))
  const res = NextResponse.redirect(new URL(used.next, origin))
  res.cookies.set(sessionCookie(await createSession(used.user.id)))
  return res
}
