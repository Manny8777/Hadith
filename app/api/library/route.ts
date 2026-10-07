import { libraryRoute, body } from '@/lib/libraryApi'
import { allTags, createCollection, listCollections } from '@/lib/library'

export const dynamic = 'force-dynamic'

// The reader's collections (and tags); POST {title, description?} creates a collection
export const GET = libraryRoute(async user => ({ collections: await listCollections(user.id), tags: await allTags(user.id) }))
export const POST = libraryRoute(async (user, req) => {
  const b = await body(req)
  return { id: await createCollection(user.id, String(b.title ?? ''), b.description == null ? null : String(b.description)) }
})
