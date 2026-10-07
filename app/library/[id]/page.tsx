import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getCollection } from '@/lib/library'
import CollectionView from './CollectionView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'مجموعة — مكتبتي', robots: { index: false } }

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser()
  if (!user) redirect(`/login?next=/library/${id}`)
  const c = await getCollection(user.id, Number(id))
  if (!c) notFound()
  return <CollectionView collection={{ id: c.id, title: c.title, description: c.description, share_token: c.share_token, list: c.list }} />
}
