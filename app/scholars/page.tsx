import { pageMeta } from '@/lib/siteMeta'
import ScholarsIndex from './ScholarsIndex'

export const metadata = pageMeta({
  title: 'أحكام المحدثين على الأحاديث',
  description: 'أحكام المحدثين وأئمة الجرح والتعديل على الأحاديث من تصحيح وتحسين وتضعيف.',
  path: '/scholars',
})

export default function ScholarsPage() {
  return <ScholarsIndex />
}
