import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ملف صحة الأسانيد للكتب — جامع خادم الحرمين' }

interface BookAuth {
  book_id: number
  title: string
  takhrij_author: string | null
  takhrij_death: number | null
  total_hadiths: number
  chains_with_daif: number
  chains_thiqat_only: number
  chains_with_unknown: number
  thiqat_pct: number
  daif_pct: number
}

function authColor(pct: number): string {
  if (pct >= 80) return 'bg-green-100 text-green-800'
  if (pct >= 60) return 'bg-blue-100 text-blue-700'
  if (pct >= 40) return 'bg-amber-100 text-amber-700'
  if (pct >= 20) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

function barAuth(pct: number): string {
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 60) return 'bg-blue-500'
  if (pct >= 40) return 'bg-amber-500'
  if (pct >= 20) return 'bg-orange-500'
  return 'bg-red-500'
}

export default async function BooksAuthenticityPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; min_hadiths?: string }>
}) {
  const sp = await searchParams
  const sort = sp.sort || 'thiqat_pct'
  const minHadiths = Math.max(50, parseInt(sp.min_hadiths || '100'))

  const orderBy =
    sort === 'daif_pct' ? 'daif_pct ASC, thiqat_pct DESC' :
    sort === 'total' ? 'total_hadiths DESC' :
    sort === 'death' ? 'takhrij_death ASC NULLS LAST' :
    'thiqat_pct DESC, total_hadiths DESC'

  const booksRes = await pool.query<BookAuth>(
    `WITH chain_grades AS (
       SELECT ht.book_id,
              ih.hadith_id,
              ic.id AS chain_id,
              BOOL_OR(n.martaba_ibn_hajar ~* 'ضعيف|منكر|متروك|كذاب|موضوع') AS has_daif,
              BOOL_OR(n.martaba_ibn_hajar IS NULL AND n.is_companion = false) AS has_unknown,
              BOOL_AND(n.martaba_ibn_hajar ~* 'ثقة|ثبت|حجة|صدوق' OR n.is_companion = true) AS all_reliable
       FROM hadith_toc ht
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       JOIN LATERAL unnest(ic.narrator_id_array) AS nar_id ON true
       JOIN narrators n ON n.id = nar_id
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
         AND array_length(ic.narrator_id_array, 1) IS NOT NULL
       GROUP BY ht.book_id, ih.hadith_id, ic.id
     )
     SELECT b.id AS book_id, b.title, b.takhrij_author, b.takhrij_death,
            COUNT(DISTINCT hadith_id)::int AS total_hadiths,
            COUNT(DISTINCT CASE WHEN has_daif THEN chain_id END)::int AS chains_with_daif,
            COUNT(DISTINCT CASE WHEN all_reliable AND NOT has_unknown THEN chain_id END)::int AS chains_thiqat_only,
            COUNT(DISTINCT CASE WHEN has_unknown AND NOT has_daif THEN chain_id END)::int AS chains_with_unknown,
            ROUND(
              COUNT(DISTINCT CASE WHEN all_reliable AND NOT has_unknown THEN chain_id END)::numeric
              / NULLIF(COUNT(DISTINCT chain_id), 0) * 100
            , 1)::float AS thiqat_pct,
            ROUND(
              COUNT(DISTINCT CASE WHEN has_daif THEN chain_id END)::numeric
              / NULLIF(COUNT(DISTINCT chain_id), 0) * 100
            , 1)::float AS daif_pct
     FROM books b
     JOIN chain_grades cg ON cg.book_id = b.id
     GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death
     HAVING COUNT(DISTINCT hadith_id) >= $1
     ORDER BY ${orderBy}`,
    [minHadiths]
  ).catch(() => ({ rows: [] as BookAuth[] }))

  const books = booksRes.rows

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('sort', sort)
    p.set('min_hadiths', String(minHadiths))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/books/authenticity?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">ملف صحة الأسانيد للكتب</h1>
        <p className="text-sm text-gray-500 mb-3">
          نسبة الأسانيد التي يقتصر رواتها على الثقات مقابل تلك التي فيها ضعيف — مقياس إجمالي لجودة إسناد كل كتاب
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
          <span className="font-semibold">تنبيه منهجي: </span>
          نسبة الثقات لا تعني بالضرورة صحة كل أحاديث الكتاب — فقد يكون راوٍ ثقة في نفسه لكنه غلط في رواية.
          هذه النسب مؤشر كمي للبنية العامة لا حكم قاطع على كل حديث بعينه.
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {[
            { key: 'thiqat_pct', label: 'أعلى نسبة ثقات' },
            { key: 'daif_pct', label: 'أقل نسبة ضعفاء' },
            { key: 'total', label: 'الأكثر أحاديثاً' },
            { key: 'death', label: 'الأقدم تأليفاً' },
          ].map(s => (
            <Link key={s.key} href={buildUrl({ sort: s.key })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sort === s.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأدنى للأحاديث:</span>
          {[50, 100, 500, 1000].map(n => (
            <Link key={n} href={buildUrl({ min_hadiths: String(n) })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minHadiths === n
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n}+
            </Link>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-4 flex-wrap text-xs">
        {[
          { label: '80%+ ثقات', cls: 'bg-green-100 text-green-800' },
          { label: '60-80%', cls: 'bg-blue-100 text-blue-700' },
          { label: '40-60%', cls: 'bg-amber-100 text-amber-700' },
          { label: 'أقل من 40%', cls: 'bg-red-100 text-red-700' },
        ].map(l => (
          <span key={l.label} className={`px-2 py-0.5 rounded-full ${l.cls}`}>{l.label}</span>
        ))}
      </div>

      {books.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-10 text-center text-gray-500">
          يتم حساب البيانات... قد تستغرق هذه الصفحة وقتاً للتحميل في المرة الأولى
        </div>
      ) : (
        <div className="space-y-3">
          {books.map((b, idx) => (
            <div key={b.book_id}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm hover:border-green-200 transition-all">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-300">{(idx + 1).toLocaleString('ar-EG')}</span>
                    <Link href={`/books/${b.book_id}`}
                      className="font-bold text-green-900 hover:underline text-sm">
                      {b.title}
                    </Link>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {b.takhrij_author}{b.takhrij_death && ` (ت ${b.takhrij_death}هـ)`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${authColor(b.thiqat_pct)}`}>
                    {b.thiqat_pct}% ثقات
                  </span>
                  <Link href={`/books/${b.book_id}/isnad-profile`}
                    className="text-xs text-indigo-600 hover:underline">ملف الإسناد</Link>
                </div>
              </div>

              <div className="space-y-1.5">
                {/* Thiqat bar */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0 text-right">أسانيد الثقات</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div className={`h-3 rounded-full ${barAuth(b.thiqat_pct)}`}
                      style={{ width: `${b.thiqat_pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-600 w-14 shrink-0 text-left">
                    {b.chains_thiqat_only.toLocaleString('ar-EG')}
                  </span>
                </div>
                {/* Da'if bar */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-20 shrink-0 text-right">فيها ضعيف</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-red-400 h-2 rounded-full"
                      style={{ width: `${b.daif_pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-14 shrink-0 text-left">
                    {b.chains_with_daif.toLocaleString('ar-EG')}
                  </span>
                </div>
                {/* Unknown bar */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-20 shrink-0 text-right">فيها مجهول</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-gray-400 h-2 rounded-full"
                      style={{
                        width: `${Math.round((b.chains_with_unknown / (b.chains_thiqat_only + b.chains_with_daif + b.chains_with_unknown || 1)) * 100)}%`
                      }} />
                  </div>
                  <span className="text-xs text-gray-400 w-14 shrink-0 text-left">
                    {b.chains_with_unknown.toLocaleString('ar-EG')}
                  </span>
                </div>
              </div>
              <div className="text-xs text-gray-300 mt-1">
                {b.total_hadiths.toLocaleString('ar-EG')} حديث
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
        <Link href="/books/uniqueness" className="text-green-700 hover:underline">← تفرد الكتب</Link>
        <Link href="/narrators/contested" className="text-green-700 hover:underline">← المختلف فيهم</Link>
      </div>
    </div>
  )
}
