import { NextResponse } from 'next/server'
import { ADMIN_COOKIE } from '@/lib/adminGate'
import { siteOrigin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// «قفل»: closes the dashboard again before its 12 hours are up
export async function POST() {
  const res = NextResponse.redirect(new URL('/admin', await siteOrigin()), 303)
  res.cookies.delete(ADMIN_COOKIE)
  return res
}
