import pool from '@/lib/db'
import Link from 'next/link'
import UiIcon from '@/app/components/UiIcon'

export const dynamic = 'force-dynamic'

interface BookProfile {
  book_id: number
  book_name: string
  total_hadiths: number
  total_chains: number
  unique_companions: number
  avg_chain_length: number | null
  sahih_pct: number | null
  daif_pct: number | null
  thiqa_pct: number | null
  top_companion_name: string | null
  top_companion_pct: number | null
  unique_chain_narrators: number
}

interface BookList {
  book_id: number
  book_name: string
  total_hadiths: number
}

export default async function AuthorProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>
}) {
  const sp = await searchParams
  const selectedBook = parseInt(sp.book || '0') || null

  const [booksRes, profileRes] = await Promise.all([
    pool.query<BookList>(
      `SELECT b.id AS book_id, b.title AS book_name, COUNT(ht.main_id)::int AS total_hadiths
       FROM books b JOIN hadith_toc ht ON ht.book_id = b.id
       GROUP BY b.id, b.title
       HAVING COUNT(ht.main_id) >= 50
       ORDER BY COUNT(ht.main_id) DESC
       LIMIT 80`,
      []
    ).catch(() => ({ rows: [] as BookList[] })),

    selectedBook ? pool.query<BookProfile>(
      `SELECT
         b.id AS book_id,
         b.title AS book_name,
         COUNT(DISTINCT ht.main_id)::int AS total_hadiths,
         COUNT(DISTINCT ic.id)::int AS total_chains,
         COUNT(DISTINCT ic.narrator_id_array[1])
           FILTER (WHERE (SELECT n.is_companion FROM narrators n WHERE n.id = ic.narrator_id_array[1]))::int AS unique_companions,
         ROUND(AVG(array_length(ic.narrator_id_array, 1)), 1)::numeric(4,1) AS avg_chain_length,
         ROUND(100.0 * COUNT(DISTINCT hj.hadith_id) FILTER (WHERE hj.say_text ~* 'صحيح')
               / NULLIF(COUNT(DISTINCT hj.hadith_id), 0))::int AS sahih_pct,
         ROUND(100.0 * COUNT(DISTINCT hj.hadith_id) FILTER (WHERE hj.say_text ~* 'ضعيف')
               / NULLIF(COUNT(DISTINCT hj.hadith_id), 0))::int AS daif_pct,
         ROUND(100.0 * COUNT(DISTINCT ic2.narrator_id_array[2])
               FILTER (WHERE (SELECT n2.martaba_ibn_hajar FROM narrators n2 WHERE n2.id = ic2.narrator_id_array[2]) ~* 'ثقة')
               / NULLIF(COUNT(DISTINCT ic2.narrator_id_array[2]), 0))::int AS thiqa_pct,
         (SELECT n3.name FROM narrators n3 WHERE n3.id = (
           SELECT ic3.narrator_id_array[1] FROM isnad_chains ic3
           JOIN isnad_hadiths ih3 ON ih3.isnad_id = ic3.id
           JOIN hadith_toc ht3 ON ht3.main_id = ih3.hadith_id AND ht3.book_id = b.id
           JOIN narrators cn ON cn.id = ic3.narrator_id_array[1] AND cn.is_companion = true
           GROUP BY ic3.narrator_id_array[1] ORDER BY COUNT(*) DESC LIMIT 1
         ) LIMIT 1) AS top_companion_name,
         ROUND(100.0 * (
           SELECT COUNT(DISTINCT ht4.main_id) FROM hadith_toc ht4
           JOIN isnad_hadiths ih4 ON ih4.hadith_id = ht4.main_id
           JOIN isnad_chains ic4 ON ic4.id = ih4.isnad_id
           WHERE ht4.book_id = b.id
             AND ic4.narrator_id_array[1] = (
               SELECT ic5.narrator_id_array[1] FROM isnad_chains ic5
               JOIN isnad_hadiths ih5 ON ih5.isnad_id = ic5.id
               JOIN hadith_toc ht5 ON ht5.main_id = ih5.hadith_id AND ht5.book_id = b.id
               JOIN narrators cn5 ON cn5.id = ic5.narrator_id_array[1] AND cn5.is_companion = true
               GROUP BY ic5.narrator_id_array[1] ORDER BY COUNT(*) DESC LIMIT 1
             )
         ) / NULLIF(COUNT(DISTINCT ht.main_id), 0))::int AS top_companion_pct,
         COUNT(DISTINCT un.nid)::int AS unique_chain_narrators
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id
       LEFT JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       LEFT JOIN isnad_chains ic ON ic.id = ih.isnad_id
       LEFT JOIN isnad_chains ic2 ON ic2.id = ih.isnad_id
       LEFT JOIN hadith_judgments hj ON hj.hadith_id = ht.main_id
       LEFT JOIN LATERAL unnest(ic.narrator_id_array) AS un(nid) ON true
       WHERE b.id = $1
       GROUP BY b.id, b.title`,
      [selectedBook]
    ).catch(() => ({ rows: [] as BookProfile[] })) : Promise.resolve({ rows: [] as BookProfile[] }),
  ])

  const bookList = booksRes.rows
  const profile = profileRes.rows[0] || null

  const METRICS = profile ? [
    { label: 'إجمالي الأحاديث', value: profile.total_hadiths.toLocaleString('ar-EG'), color: 'bg-green-50 text-green-800' },
    { label: 'إجمالي الأسانيد', value: profile.total_chains.toLocaleString('ar-EG'), color: 'bg-blue-50 text-blue-800' },
    { label: 'الصحابة المختلفون', value: profile.unique_companions.toLocaleString('ar-EG'), color: 'bg-amber-50 text-amber-800' },
    { label: 'متوسط طول السند', value: profile.avg_chain_length ? `${profile.avg_chain_length} راوٍ` : '—', color: 'bg-indigo-50 text-indigo-800' },
    { label: 'نسبة الصحيح', value: profile.sahih_pct !== null ? `${profile.sahih_pct}%` : '—', color: 'bg-green-100 text-green-900' },
    { label: 'نسبة الضعيف', value: profile.daif_pct !== null ? `${profile.daif_pct}%` : '—', color: 'bg-red-50 text-red-800' },
    { label: 'رواة الإسناد الفريدون', value: profile.unique_chain_narrators.toLocaleString('ar-EG'), color: 'bg-purple-50 text-purple-800' },
    { label: 'أبرز صحابي', value: profile.top_companion_name ? `${profile.top_companion_name.split(' ').slice(0, 2).join(' ')} (${profile.top_companion_pct}%)` : '—', color: 'bg-amber-100 text-amber-900' },
  ] : []

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">ملف الكتاب — تحليل إحصائي شامل</h1>
        <p className="text-sm text-gray-500">
          بصمة كل كتاب من حيث عدد أحاديثه وتنوع صحابته ومتوسط طول أسانيده ونسب الأحكام فيه — مقارنة احترافية بين المصنَّفات
        </p>
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-green-50 px-4 py-2 border-b border-green-100 text-xs text-green-800 font-medium">
              اختر كتاباً للتحليل
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {bookList.map((bk, i) => {
                const isSelected = selectedBook === bk.book_id
                return (
                  <a key={bk.book_id}
                    href={`/books/author-profile?book=${bk.book_id}`}
                    className={`flex items-center gap-3 px-4 py-2.5 hover:bg-green-50 transition-colors ${isSelected ? 'bg-green-50' : ''}`}>
                    <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${isSelected ? 'text-green-900' : 'text-gray-800'} hover:underline`}>
                        {bk.book_name}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{bk.total_hadiths.toLocaleString('ar-EG')}</span>
                  </a>
                )
              })}
            </div>
          </div>
        </div>

        <div className="sm:col-span-3">
          {profile ? (
            <>
              <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
                <h2 className="font-bold text-green-900 text-lg mb-4">{profile.book_name}</h2>
                <div className="grid grid-cols-2 gap-3">
                  {METRICS.map((m, i) => (
                    <div key={i} className={`rounded-xl px-4 py-3 ${m.color}`}>
                      <div className="text-xs opacity-70 mb-0.5">{m.label}</div>
                      <div className="text-lg font-bold">{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 flex-wrap">
                <Link href={`/books/${profile.book_id}`}
                  className="bg-green-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-800">
                  تصفح الكتاب ←
                </Link>
                <Link href={`/hadiths/grade-by-book?book=${profile.book_id}`}
                  className="bg-white border border-gray-200 text-sm px-4 py-2 rounded-lg hover:border-green-300 text-gray-700">
                  توزيع الدرجات ←
                </Link>
                <Link href={`/hadiths/unique-to-book?book=${profile.book_id}`}
                  className="bg-white border border-gray-200 text-sm px-4 py-2 rounded-lg hover:border-green-300 text-gray-700">
                  انفراداته ←
                </Link>
                <Link href={`/hadiths/book-companion-matrix?book=${profile.book_id}`}
                  className="bg-white border border-gray-200 text-sm px-4 py-2 rounded-lg hover:border-amber-300 text-gray-700">
                  صحابته ←
                </Link>
              </div>
            </>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-12 text-center">
              <UiIcon name="chart" size={40} className="text-[#b28a43] mb-3" />
              <div className="font-semibold text-gray-700 text-sm mb-2">تحليل الكتاب الإحصائي</div>
              <p className="text-xs text-gray-500 leading-relaxed max-w-xs mx-auto">
                اختر أي كتاب من القائمة لعرض ملفه الإحصائي الشامل: أحاديثه وأسانيده وصحابته ونسب درجاته وبصمته المنهجية
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/grade-by-book" className="text-green-700 hover:underline">← درجات الأحاديث بالكتاب</Link>
        <Link href="/books/chain-age" className="text-green-700 hover:underline">← عمر السند</Link>
        <Link href="/books/isnad-diversity" className="text-green-700 hover:underline">← تنوع الإسناد</Link>
      </div>
    </div>
  )
}
