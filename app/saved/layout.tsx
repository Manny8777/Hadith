import { pageMeta } from '@/lib/siteMeta'

// The page is a client component, so its metadata lives here
export const metadata = pageMeta({
  title: 'المجموعة البحثية',
  description: 'الأحاديث المحفوظة للبحث الأكاديمي.',
  path: '/saved',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
