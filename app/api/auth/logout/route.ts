import { NextResponse } from 'next/server'
import { endSession, siteOrigin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  await endSession()
  return NextResponse.redirect(new URL('/', await siteOrigin()), 303)
}
