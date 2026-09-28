import { pageMeta } from '@/lib/siteMeta'

// The page is a client component, so its metadata lives here
export const metadata = pageMeta({
  title: 'البحث بواسطة السند',
  description: 'ابنِ السند راوياً راوياً من الصحابي حتى المصنّف، لتظهر الأحاديث التي تتتابع فيها هذه الروايات في الإسناد.',
  path: '/asaneed/builder',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
