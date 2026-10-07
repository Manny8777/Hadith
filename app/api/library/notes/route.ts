import { libraryRoute, body } from '@/lib/libraryApi'
import { isKind, LibraryError, listNotes, setNote } from '@/lib/library'

export const dynamic = 'force-dynamic'

// GET ?q: the reader's notes (those matching q); PUT {kind, ref, body, tags?}: write one (empty: removed)
export const GET = libraryRoute(async (user, req) => ({ notes: await listNotes(user.id, new URL(req.url).searchParams.get('q') ?? undefined) }))
export const PUT = libraryRoute(async (user, req) => {
  const b = await body(req)
  if (!isKind(b.kind)) throw new LibraryError('نوع غير صالح')
  await setNote(user.id, b.kind, String(b.ref ?? ''), String(b.body ?? ''), b.tags)
})
