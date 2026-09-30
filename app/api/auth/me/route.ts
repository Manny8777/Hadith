import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// For the header's account button
export async function GET() {
  const user = await currentUser()
  return NextResponse.json({ user: user ? { email: user.email } : null }, { headers: { 'Cache-Control': 'no-store' } })
}
