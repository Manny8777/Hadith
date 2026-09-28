import { pageMeta } from '@/lib/siteMeta'

// The page is a client component, so its metadata lives here
export const metadata = pageMeta({
  title: 'مقارنة أحكام المحدثين',
  description: 'اختر محدثَين واعرض الأحاديث التي اشتركا في الحكم عليها — توافقاً أو خلافاً.',
  path: '/scholars/compare',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
