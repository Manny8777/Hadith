import { pageMeta } from '@/lib/siteMeta'

// The page is a client component, so its metadata lives here
export const metadata = pageMeta({
  title: 'البحث في كتب التراجم',
  description: 'ابحث في نصوص تقريب التهذيب، وتهذيب الكمال، والكاشف، وسائر كتب الرجال والتراجم.',
  path: '/bio-search',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
