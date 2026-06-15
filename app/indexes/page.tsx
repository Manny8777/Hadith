import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الفهارس — جامع خادم الحرمين' }

interface CountRow {
  index_id: number
  cnt: number
}

export default async function IndexesHubPage() {
  const { rows: counts } = await pool
    .query<CountRow>(
      `SELECT index_id, COUNT(*)::int AS cnt
       FROM hadith_index_items
       WHERE index_id = ANY($1::int[])
       GROUP BY index_id`,
      [[2, 4, 5, 8, 9, 13, 14]]
    )
    .catch(() => ({ rows: [] as CountRow[] }))

  const byId = new Map(counts.map(r => [r.index_id, r.cnt]))

  const quranTotal = byId.get(2) ?? 0
  const namesTotal = (byId.get(4) ?? 0) + (byId.get(5) ?? 0) + (byId.get(8) ?? 0) + (byId.get(9) ?? 0) + (byId.get(13) ?? 0)
  const poetryTotal = byId.get(14) ?? 0

  const cards = [
    {
      href: '/indexes/quran',
      title: 'فهرس الآيات',
      subtitle: 'الآيات القرآنية الواردة في الأحاديث',
      count: quranTotal,
      unit: 'آية',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      ),
      bg: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
      iconColor: 'text-emerald-700',
      titleColor: 'text-emerald-900',
      countColor: 'text-emerald-700 bg-emerald-100',
    },
    {
      href: '/indexes/names',
      title: 'فهرس الأعلام',
      subtitle: 'أسماء الأعلام: الرجال والنساء والأنبياء والشعراء',
      count: namesTotal,
      unit: 'علم',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      ),
      bg: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
      iconColor: 'text-amber-700',
      titleColor: 'text-amber-900',
      countColor: 'text-amber-700 bg-amber-100',
    },
    {
      href: '/indexes/poetry',
      title: 'فهرس الشعر',
      subtitle: 'الأبيات الشعرية الواردة في متون الأحاديث',
      count: poetryTotal,
      unit: 'بيت',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
      ),
      bg: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
      iconColor: 'text-purple-700',
      titleColor: 'text-purple-900',
      countColor: 'text-purple-700 bg-purple-100',
    },
  ]

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-green-900 mb-2">الفهارس</h1>
        <p className="text-gray-500 text-sm">
          فهارس تحليلية لمحتوى كتب الحديث — الآيات القرآنية والأعلام والشعر
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {cards.map(card => (
          <Link
            key={card.href}
            href={card.href}
            className={`group block rounded-2xl border p-7 transition-all shadow-sm hover:shadow-md ${card.bg}`}
          >
            <div className={`mb-4 ${card.iconColor}`}>{card.icon}</div>
            <h2 className={`text-xl font-bold mb-1 group-hover:underline decoration-2 underline-offset-4 ${card.titleColor}`}>
              {card.title}
            </h2>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed">{card.subtitle}</p>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${card.countColor}`}>
                {card.count > 0
                  ? `${card.count.toLocaleString('ar-EG')} ${card.unit}`
                  : 'جارٍ التحميل'}
              </span>
              <span className="text-gray-400 group-hover:text-green-600 text-lg transition-colors">←</span>
            </div>
          </Link>
        ))}
      </div>

      {/* About section */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-sm font-bold text-green-900 mb-3">عن هذه الفهارس</h2>
        <ul className="space-y-2 text-sm text-gray-600 list-none">
          <li className="flex gap-2">
            <span className="text-green-600 shrink-0">•</span>
            <span><strong className="text-green-800">فهرس الآيات:</strong> يضمّ الآيات القرآنية المذكورة في متون الأحاديث، مرتبةً أبجدياً حسب مطلع الآية.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber-600 shrink-0">•</span>
            <span><strong className="text-amber-800">فهرس الأعلام:</strong> يشمل أسماء الأشخاص الواردة في الأحاديث من رجال ونساء وأنبياء وشعراء، مصنّفةً حسب الفئة.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-purple-600 shrink-0">•</span>
            <span><strong className="text-purple-800">فهرس الشعر:</strong> يحتوي على الأبيات الشعرية والمقطوعات الواردة في متون الأحاديث.</span>
          </li>
        </ul>
      </div>

      <div className="mt-6 flex gap-4 text-sm flex-wrap">
        <Link href="/" className="text-green-700 hover:underline">← الرئيسية</Link>
        <Link href="/topics" className="text-green-700 hover:underline">← الفهارس الموضوعية</Link>
      </div>
    </div>
  )
}
