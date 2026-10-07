import { libraryRoute } from '@/lib/libraryApi'
import { isKind, itemState, LibraryError, savedCounts } from '@/lib/library'

export const dynamic = 'force-dynamic'

// GET ?kind&ref: which of the reader's collections hold the item, and its note
// GET ?kind&refs=a,b,c: for a page of results, in how many collections each is (and whether noted)
export const GET = libraryRoute(async (user, req) => {
  const p = new URL(req.url).searchParams
  const kind = p.get('kind')
  if (!isKind(kind)) throw new LibraryError('نوع غير صالح')
  const refs = p.get('refs')
  if (refs != null) return { saved: await savedCounts(user.id, kind, refs.split(',')) }
  return itemState(user.id, kind, String(p.get('ref') ?? ''))
})
