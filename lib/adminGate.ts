// The /admin statistics need three things: a signed-in account, an email in ADMIN_EMAILS, and the
// password in ADMIN_PASSWORD (a Railway variable, never in the code — the repository is public).
// After the password, a cookie signed with it keeps the dashboard open for 12 hours; changing the
// password closes every open one.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import type { User } from '@/lib/auth'

export const ADMIN_COOKIE = 'hd_admin'
const HOURS = 12

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS || 'manny@vcdesks.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
export const isAdmin = (user: User | null) => !!user && adminEmails().includes(user.email.toLowerCase())
export const passwordSet = () => !!process.env.ADMIN_PASSWORD

const sign = (userId: number, exp: number) =>
  createHmac('sha256', process.env.ADMIN_PASSWORD ?? '').update(`${userId}.${exp}`).digest('hex')

export function passwordMatches(given: string): boolean {
  const want = Buffer.from(process.env.ADMIN_PASSWORD ?? '')
  const got = Buffer.from(given)
  return want.length > 0 && want.length === got.length && timingSafeEqual(want, got)
}

export function unlockCookie(userId: number) {
  const exp = Math.floor(Date.now() / 1000) + HOURS * 3600
  return {
    name: ADMIN_COOKIE, value: `${exp}.${sign(userId, exp)}`, httpOnly: true, sameSite: 'strict' as const,
    path: '/', maxAge: HOURS * 3600, secure: process.env.NODE_ENV === 'production',
  }
}

export async function unlocked(user: User): Promise<boolean> {
  if (!passwordSet()) return false
  const v = (await cookies()).get(ADMIN_COOKIE)?.value ?? ''
  const [exp, mac] = v.split('.')
  if (!exp || !mac || Number(exp) < Date.now() / 1000) return false
  const want = Buffer.from(sign(user.id, Number(exp))), got = Buffer.from(mac)
  return want.length === got.length && timingSafeEqual(want, got)
}

// Wrong passwords: 5 per 15 minutes per address (in memory — one instance)
const fails = new Map<string, number[]>()
export function tooManyTries(ip: string): boolean {
  const now = Date.now(), recent = (fails.get(ip) ?? []).filter(t => now - t < 15 * 60_000)
  fails.set(ip, recent)
  return recent.length >= 5
}
export const noteFailure = (ip: string) => fails.set(ip, [...(fails.get(ip) ?? []), Date.now()])
