import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'التسلسل الزمني للتدوين — جامع خادم الحرمين' }

interface CenturyRow {
  century: number
  first_recorded: number
  group_count: number
  book_count: number
}

interface BookRow {
  book_id: number
  title: string
  takhrij_author: string | null
  takhrij_death: number | null
  hadiths_first: number
  hadiths_total: number
}

function centuryName(c: number): string {
  const names: Record<number, string> = {
    1: 'القرن الأول الهجري',
    2: 'القرن الثاني الهجري',
    3: 'القرن الثالث الهجري',
    4: 'القرن الرابع الهجري',
    5: 'القرن الخامس الهجري',
    6: 'القرن السادس الهجري',
    7: 'القرن السابع الهجري',
    8: 'القرن الثامن الهجري',
    9: 'القرن التاسع الهجري',
  }
  return names[c] || `القرن ${c} الهجري`
}

function centuryColor(c: number): string {
  if (c <= 2) return 'bg-amber-500'
  if (c === 3) return 'bg-green-600'
  if (c === 4) return 'bg-blue-500'
  if (c === 5) return 'bg-indigo-500'
  return 'bg-gray-500'
}

function barColor(c: number): string {
  if (c <= 2) return 'bg-amber-400'
  if (c === 3) return 'bg-green-500'
  if (c === 4) return 'bg-blue-400'
  if (c === 5) return 'bg-indigo-400'
  return 'bg-gray-400'
}

export default async function HadithTimelinePage() {
  const [centuryRes, booksRes] = await Promise.all([
    pool.query<CenturyRow>(
      `WITH earliest AS (
         SELECT t.group_id,
                MIN(b.takhrij_death) AS earliest_death
         FROM takhrij t
         JOIN books b ON b.id = t.book_id AND b.takhrij_death IS NOT NULL
         GROUP BY t.group_id
       ),
       earliest_hadiths AS (
         SELECT t.hadith_id,
                CEIL(e.earliest_death::float / 100)::int AS century
         FROM takhrij t
         JOIN earliest e ON e.group_id = t.group_id
         JOIN (
           SELECT group_id, MIN(b2.takhrij_death) AS min_death
           FROM takhrij t2
           JOIN books b2 ON b2.id = t2.book_id AND b2.takhrij_death IS NOT NULL
           GROUP BY group_id
         ) first_book ON first_book.group_id = t.group_id
         JOIN books b ON b.id = t.book_id AND b.takhrij_death = first_book.min_death
         WHERE e.earliest_death BETWEEN 1 AND 900
       )
       SELECT century,
              MIN(century * 100 - 99) AS first_recorded,
              COUNT(DISTINCT hadith_id)::int AS group_count,
              1 AS book_count
       FROM earliest_hadiths
       GROUP BY century
       ORDER BY century`,
      []
    ).catch(() => ({ rows: [] as CenturyRow[] })),

    pool.query<BookRow>(
      `SELECT b.id AS book_id, b.title, b.takhrij_author, b.takhrij_death,
              COUNT(DISTINCT t.group_id)::int AS hadiths_first,
              COUNT(DISTINCT t.hadith_id)::int AS hadiths_total
       FROM books b
       JOIN takhrij t ON t.book_id = b.id
       WHERE b.takhrij_death IS NOT NULL
         AND b.takhrij_death <= (
           SELECT MIN(b2.takhrij_death)
           FROM takhrij t2
           JOIN books b2 ON b2.id = t2.book_id
           WHERE t2.group_id = t.group_id AND b2.takhrij_death IS NOT NULL
         )
       GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death
       HAVING COUNT(DISTINCT t.group_id) >= 50
       ORDER BY hadiths_first DESC
       LIMIT 20`,
      []
    ).catch(() => ({ rows: [] as BookRow[] })),
  ])

  const centuries = centuryRes.rows
  const books = booksRes.rows
  const maxHadiths = Math.max(...centuries.map(c => c.group_count), 1)
  const totalHadiths = centuries.reduce((s, c) => s + c.group_count, 0)
  const cumulativeMap: Record<number, number> = {}
  let cumSum = 0
  for (const c of centuries) {
    cumSum += c.group_count
    cumulativeMap[c.century] = cumSum
  }

  // Simplified: just use century distribution from what we have
  const thirdCenturyCount = centuries.filter(c => c.century === 3).reduce((s, c) => s + c.group_count, 0)
  const thirdCenturyPct = totalHadiths > 0 ? Math.round((thirdCenturyCount / totalHadiths) * 100) : 0

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">التسلسل الزمني للتدوين الحديثي</h1>
        <p className="text-sm text-gray-500 mb-3">
          توزيع الأحاديث حسب القرن الهجري لأقدم مصدر دوَّنها — يكشف متى وُثِّق كل جزء من الموروث الحديثي
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
          <span className="font-semibold">منهجية القراءة: </span>
          يُسجَّل الحديث في القرن الذي توفي فيه أقدم مَن دوَّنه في مصادرنا.
          القرن الثالث الهجري (عصر الذهب) شهد أكبر حركة تدوين في التاريخ الإسلامي.
          لا يعني ذلك أن الحديث لم يُروَ قبله — بل أنه دُوِّن في كتب وصلتنا لأول مرة في ذلك القرن.
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-green-800 text-white rounded-xl p-3 text-center">
            <div className="text-xl font-bold">{totalHadiths.toLocaleString('ar-EG')}</div>
            <div className="text-xs opacity-80">مجموعات تخريج</div>
          </div>
          <div className="bg-amber-600 text-white rounded-xl p-3 text-center">
            <div className="text-xl font-bold">{thirdCenturyPct}%</div>
            <div className="text-xs opacity-80">دُوِّن في القرن الثالث</div>
          </div>
          <div className="bg-indigo-700 text-white rounded-xl p-3 text-center">
            <div className="text-xl font-bold">{centuries.length}</div>
            <div className="text-xs opacity-80">قرون مُمثَّلة</div>
          </div>
        </div>
      </div>

      {/* Century distribution */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <h2 className="text-sm font-bold text-green-900 mb-4">توزيع التدوين بالقرون الهجرية</h2>
        <div className="space-y-4">
          {centuries.map(c => {
            const pct = Math.round((c.group_count / maxHadiths) * 100)
            const cumPct = totalHadiths > 0 ? Math.round((cumulativeMap[c.century] / totalHadiths) * 100) : 0
            return (
              <div key={c.century}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full text-white font-bold ${centuryColor(c.century)}`}>
                      {c.century}هـ
                    </span>
                    <span className="text-xs text-gray-600 font-medium">{centuryName(c.century)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-bold text-gray-700">{c.group_count.toLocaleString('ar-EG')} مجموعة</span>
                    <span className="text-gray-400">({Math.round((c.group_count / totalHadiths) * 100)}%)</span>
                    <span className="text-gray-300">| تراكمي: {cumPct}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className={`h-5 rounded-full ${barColor(c.century)} transition-all`}
                      style={{ width: `${pct}%` }}>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Books that first-recorded the most hadiths */}
      {books.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
          <h2 className="text-sm font-bold text-green-900 mb-1">الكتب الأكثر تفرداً بتدوين الأحاديث أولاً</h2>
          <p className="text-xs text-gray-400 mb-4">
            الكتاب الذي يحتوي أكبر عدد من الأحاديث التي لا يوجدها كتاب أسبق — مقياس أصالة الكتاب
          </p>
          <div className="space-y-2">
            {books.map(b => (
              <div key={b.book_id} className="flex items-center gap-3">
                <Link href={`/books/${b.book_id}`}
                  className="text-sm text-green-800 hover:underline text-right shrink-0 w-40 truncate">
                  {b.title}
                </Link>
                <span className="text-xs text-gray-400 shrink-0">
                  ت {b.takhrij_death}هـ
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-green-600 h-3 rounded-full"
                    style={{ width: `${(b.hadiths_first / books[0].hadiths_first) * 100}%` }} />
                </div>
                <span className="text-xs font-medium text-gray-700 shrink-0 w-20 text-left">
                  {b.hadiths_first.toLocaleString('ar-EG')} أولاً
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            "أولاً" = الأحاديث التي هذا الكتاب أقدم مَن دوَّنها من بين ما وصلنا
          </p>
        </div>
      )}

      <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-xs text-green-800 mb-4">
        <span className="font-semibold">خلاصة تاريخية: </span>
        بدأت حركة التدوين الجادة في القرن الثاني، وبلغت ذروتها في القرن الثالث مع مسانيد أحمد وصحيحَي البخاري ومسلم
        وسنن أبي داود والترمذي والنسائي وابن ماجه. حفظت هذه الكتب الجزء الأكبر من الموروث الحديثي الذي وصلنا.
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
        <Link href="/books/uniqueness" className="text-green-700 hover:underline">← تفرد الكتب</Link>
        <Link href="/hadiths/chain-lengths" className="text-green-700 hover:underline">← طول الأسانيد</Link>
        <Link href="/narrators/generations" className="text-green-700 hover:underline">← الطبقات</Link>
      </div>
    </div>
  )
}
