import { pageMeta } from '@/lib/siteMeta'

// The page is a client component, so its metadata lives here
export const metadata = pageMeta({
  title: 'مقارنة حديثين',
  description: 'قارن بين حديثين بجانب بعضهما — المتن والإسناد والأحكام العلمية — لتحديد أوجه الاتفاق والاختلاف.',
  path: '/hadith/compare',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
