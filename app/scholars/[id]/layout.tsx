import { scholarMeta } from '@/lib/entityMeta'

// The page is a client component, so its metadata lives here
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return scholarMeta(id, `/scholars/${id}`, 'أحكام المحدث')
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
