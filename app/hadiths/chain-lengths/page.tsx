import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'توزيع طول الأسانيد — جامع خادم الحرمين' }

interface LengthRow {
  chain_length: number
  chain_count: number
  hadith_count: number
}

interface BookLengthRow {
  book_id: number
  title: string
  takhrij_author: string | null
  avg_length: number
  min_length: number
  max_length: number
  hadith_count: number
}

export default async function ChainLengthsPage() {
  const [distRes, booksRes] = await Promise.all([
    pool.query<LengthRow>(
      `SELECT
         array_length(ic.narrator_id_array, 1) AS chain_length,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
       WHERE array_length(ic.narrator_id_array, 1) IS NOT NULL
       GROUP BY chain_length
       ORDER BY chain_length`
    ).catch(() => ({ rows: [] as LengthRow[] })),

    pool.query<BookLengthRow>(
      `SELECT b.id AS book_id, b.title, b.takhrij_author,
              ROUND(AVG(array_length(ic.narrator_id_array, 1)), 2)::float AS avg_length,
              MIN(array_length(ic.narrator_id_array, 1))::int AS min_length,
              MAX(array_length(ic.narrator_id_array, 1))::int AS max_length,
              COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id AND ht.is_leaf = true AND ht.is_paragraph = true
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       WHERE array_length(ic.narrator_id_array, 1) IS NOT NULL
       GROUP BY b.id, b.title, b.takhrij_author
       HAVING COUNT(DISTINCT ih.hadith_id) >= 100
       ORDER BY avg_length ASC`
    ).catch(() => ({ rows: [] as BookLengthRow[] })),
  ])

  const dist = distRes.rows
  const books = booksRes.rows

  const maxChainCount = Math.max(...dist.map(d => d.chain_count), 1)
  const maxHadithCount = Math.max(...dist.map(d => d.hadith_count), 1)
  const totalChains = dist.reduce((sum, d) => sum + d.chain_count, 0)
  const totalHadiths = dist.reduce((sum, d) => sum + d.hadith_count, 0)

  // Weighted average chain length
  const weightedAvg = totalChains > 0
    ? dist.reduce((sum, d) => sum + d.chain_length * d.chain_count, 0) / totalChains
    : 0

  const lengthLabels: Record<number, string> = {
    1: 'حلقة واحدة',
    2: 'ثلاثي',
    3: 'رباعي',
    4: 'خماسي',
    5: 'سداسي',
    6: 'سباعي',
    7: 'ثماني',
    8: 'تساعي',
    9: 'عشاري',
  }

  const chainTypeLabels: Record<string, string> = {
    '1': 'عالٍ جداً (الصحابي فقط)',
    '2': 'عالٍ جداً (ثلاثي)',
    '3': 'عالٍ (رباعي)',
    '4': 'متوسط (خماسي)',
    '5': 'متوسط-نازل (سداسي)',
    '6': 'نازل (سباعي)',
  }

  function chainTypeColor(len: number) {
    if (len <= 2) return 'bg-purple-500'
    if (len <= 3) return 'bg-green-500'
    if (len <= 5) return 'bg-blue-500'
    if (len <= 7) return 'bg-amber-500'
    return 'bg-red-400'
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">توزيع طول الأسانيد</h1>
        <p className="text-sm text-gray-500 mb-3">
          تحليل إحصائي لعدد الحلقات (الرواة) في أسانيد الأحاديث — يعكس مستوى "علو" أو "نزول" الأسانيد
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
          <span className="font-semibold">مصطلحات علمية: </span>
          <strong>العالي</strong>: إسناد بعدد حلقات قليلة — أقل وسائط = أقوى إسناداً.
          <strong className="mr-3">النازل</strong>: إسناد بعدد حلقات كثيرة — أكثر وسائط = درجة أكثر وسائط للنقد.
          كان المحدثون يسافرون طلباً للإسناد العالي.
        </div>

        {/* Overall stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-green-800 text-white rounded-xl p-3 text-center">
            <div className="text-xl font-bold">{totalChains.toLocaleString('ar-EG')}</div>
            <div className="text-xs opacity-80">إجمالي الأسانيد</div>
          </div>
          <div className="bg-indigo-700 text-white rounded-xl p-3 text-center">
            <div className="text-xl font-bold">{totalHadiths.toLocaleString('ar-EG')}</div>
            <div className="text-xs opacity-80">الأحاديث</div>
          </div>
          <div className="bg-amber-600 text-white rounded-xl p-3 text-center">
            <div className="text-xl font-bold">{weightedAvg.toFixed(1)}</div>
            <div className="text-xs opacity-80">متوسط طول السند</div>
          </div>
          <div className="bg-purple-700 text-white rounded-xl p-3 text-center">
            <div className="text-xl font-bold">
              {Math.max(...dist.map(d => d.chain_length)).toLocaleString('ar-EG')}
            </div>
            <div className="text-xs opacity-80">أطول سند في المجموعة</div>
          </div>
        </div>
      </div>

      {/* Distribution chart */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <h2 className="text-sm font-bold text-green-900 mb-4">توزيع الأسانيد حسب عدد الحلقات</h2>
        <div className="space-y-3">
          {dist.map(d => (
            <div key={d.chain_length}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full text-white font-bold ${chainTypeColor(d.chain_length)}`}>
                    {d.chain_length} حلقات
                  </span>
                  <span className="text-xs text-gray-500">
                    {lengthLabels[d.chain_length - 1] || `${d.chain_length} رواة`}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-600">{d.chain_count.toLocaleString('ar-EG')} سند</span>
                  <span className="text-gray-400">({Math.round((d.chain_count / totalChains) * 100)}%)</span>
                </div>
              </div>
              <div className="bg-gray-100 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-4 rounded-full ${chainTypeColor(d.chain_length)}`}
                  style={{ width: `${(d.chain_count / maxChainCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-book average chain length */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <h2 className="text-sm font-bold text-green-900 mb-1">متوسط طول الإسناد في كل كتاب</h2>
        <p className="text-xs text-gray-400 mb-4">
          الكتب ذات المتوسط الأقل = أعلى إسناداً — الكتب المتأخرة عادةً ذات إسناد أنزل
        </p>
        <div className="space-y-2">
          {books.map(b => (
            <div key={b.book_id} className="flex items-center gap-3">
              <Link href={`/books/${b.book_id}`}
                className="text-sm text-green-800 hover:underline text-right w-36 shrink-0 truncate">
                {b.title}
              </Link>
              <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-green-700 h-4 rounded-full"
                  style={{ width: `${(b.avg_length / 15) * 100}%` }}
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs font-bold text-green-800 w-8 text-center">{b.avg_length.toFixed(1)}</span>
                <span className="text-xs text-gray-400">حلقة</span>
              </div>
              <span className="text-xs text-gray-400 w-16 shrink-0">({b.min_length}-{b.max_length})</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-xs text-green-800">
        <span className="font-semibold">خلاصة: </span>
        متوسط طول الإسناد هو أحد مؤشرات علو الإسناد. الأسانيد الثلاثية والرباعية التي وردت في كتب القرن
        الثالث الهجري تعدّ عالية لأن عدد الوسائط بين المحدث ورسول الله قليل. أما كتب القرن الخامس فما بعده
        فغالباً ما تكون أسانيدها أنزل نظراً للمسافة الزمنية المتزايدة.
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/chains" className="text-green-700 hover:underline">← علو الإسناد</Link>
        <Link href="/hadiths/chain-gaps" className="text-green-700 hover:underline">← كاشف الانقطاع</Link>
        <Link href="/hadiths/chain-richness" className="text-green-700 hover:underline">← تعدد الأسانيد</Link>
      </div>
    </div>
  )
}
