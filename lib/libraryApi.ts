// The /api/library routes: the signed-in reader, JSON in and out, LibraryError → its status.
import { NextResponse } from 'next/server'
import { currentUser, type User } from '@/lib/auth'
import { LibraryError } from '@/lib/library'

export function libraryRoute<C = unknown>(fn: (user: User, req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'سجّل الدخول أولًا' }, { status: 401 })
    try {
      const out = await fn(user, req, ctx)
      return NextResponse.json(out ?? { ok: true })
    } catch (e) {
      if (e instanceof LibraryError) return NextResponse.json({ error: e.message }, { status: e.status })
      console.error('[library]', e)
      return NextResponse.json({ error: 'تعذّر الحفظ، حاول مرة أخرى' }, { status: 500 })
    }
  }
}

export const body = async (req: Request): Promise<Record<string, unknown>> => req.json().catch(() => ({}))
export type IdCtx = { params: Promise<{ id: string }> }
export const idOf = async (ctx: IdCtx) => {
  const id = Number((await ctx.params).id)
  if (!Number.isInteger(id) || id <= 0) throw new LibraryError('لا توجد هذه المجموعة', 404)
  return id
}
