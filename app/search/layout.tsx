import { pageMeta } from '@/lib/siteMeta'

// The page is a client component, so its metadata lives here
export const metadata = pageMeta({
  title: 'البحث في الأحاديث',
  description: 'ابحث في نصوص الأحاديث النبوية في كتب الموسوعة، مع تصفية حسب الكتاب والراوي والدرجة.',
  path: '/search',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
