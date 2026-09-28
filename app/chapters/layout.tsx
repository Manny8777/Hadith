import { pageMeta } from '@/lib/siteMeta'

// The page is a client component, so its metadata lives here
export const metadata = pageMeta({
  title: 'بحث في الأبواب والفصول',
  description: 'ابحث عن عنوان باب في جميع الكتب لتظهر الكتب التي تتشارك الباب نفسه أو باباً مشابهاً.',
  path: '/chapters',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
