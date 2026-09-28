import { pageMeta } from '@/lib/siteMeta'

// The page is a client component, so its metadata lives here
export const metadata = pageMeta({
  title: 'بحث سلاسل الرواة',
  description: 'حدد راويَين أو أكثر للبحث عن الأحاديث التي تتضمنهم جميعاً في سند واحد.',
  path: '/narrators/chain-filter',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
