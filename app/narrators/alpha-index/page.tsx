import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الفهرس الأبجدي للرواة — جامع خادم الحرمين' }

interface NarratorRow {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  death_year: string | null
  is_companion: boolean
  hadiths_count: number | null
}

interface LetterCount {
  letter: string
  cnt: number
}

const ARABIC_ALPHABET = 'أبتثجحخدذرزسشصضطظعغفقكلمنهوي'

function gradeClass(g: string | null) {
  if (!g) return 'text-gray-500'
  if (/ثقة|ثبت|حجة|صحابي/.test(g)) return 'text-green-700'
  if (/صدوق|لا بأس/.test(g)) return 'text-amber-700'
  if (/ضعيف|متروك/.test(g)) return 'text-red-600'
  return 'text-gray-600'
}

export default async function AlphaIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string; page?: string }>
}) {
  const sp = await searchParams
  const letter = sp.letter || 'أ'
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 80
  const offset = (pg - 1) * limit

  const [narratorsRes, countsRes, totalRes] = await Promise.all([
    pool.query<NarratorRow>(
      `SELECT id, name, abb_name, martaba_ibn_hajar, death_year, is_companion, hadiths_count
       FROM narrators
       WHERE left(name, 1) = $1
       ORDER BY name
       LIMIT $2 OFFSET $3`,
      [letter, limit, offset]
    ).catch(() => ({ rows: [] as NarratorRow[] })),

    pool.query<LetterCount>(
      `SELECT left(name, 1) AS letter, COUNT(*)::int AS cnt
       FROM narrators
       WHERE left(name, 1) = ANY($1::text[])
       GROUP BY letter
       ORDER BY letter`,
      [ARABIC_ALPHABET.split('')]
    ).catch(() => ({ rows: [] as LetterCount[] })),

    pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM narrators WHERE left(name, 1) = $1`,
      [letter]
    ).catch(() => ({ rows: [{ cnt: 0 }] })),
  ])

  const narrators = narratorsRes.rows
  const letterCounts = new Map(countsRes.rows.map(r => [r.letter, r.cnt]))
  const totalForLetter = totalRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(totalForLetter / limit)

  // Also match أ/إ/آ/ا under "أ"
  const displayLetter = letter

  function buildUrl(l: string, p = 1) {
    return `/narrators/alpha-index?letter=${encodeURIComponent(l)}&page=${p}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الفهرس الأبجدي للرواة</h1>
        <p className="text-sm text-gray-500 mb-4">
          تصفح رواة الحديث مرتَّبين أبجدياً — كفهارس الرجال الكلاسيكية كتهذيب الكمال والكاشف
        </p>

        {/* Alphabet grid */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-2">
          <div className="flex flex-wrap gap-1.5 justify-start">
            {ARABIC_ALPHABET.split('').map(l => {
              const cnt = letterCounts.get(l) || 0
              const isActive = l === displayLetter
              return (
                <Link key={l} href={buildUrl(l)}
                  className={`relative px-2.5 py-2 rounded-lg text-sm font-bold transition-colors min-w-[36px] text-center ${
                    isActive
                      ? 'bg-green-800 text-white shadow-sm'
                      : cnt > 0
                        ? 'bg-green-50 text-green-800 hover:bg-green-100 border border-green-100'
                        : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  }`}>
                  {l}
                  {cnt > 0 && (
                    <span className={`absolute -top-1 -left-1 text-xs rounded-full min-w-[14px] px-0.5 text-center leading-none py-0.5 ${
                      isActive ? 'bg-amber-300 text-green-900' : 'bg-green-200 text-green-700'
                    }`} style={{ fontSize: '9px' }}>
                      {cnt > 999 ? '٩٩٩+' : cnt.toLocaleString('ar-EG')}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400 px-1">
          <span>الحرف: <strong className="text-green-800">{displayLetter}</strong> — {totalForLetter.toLocaleString('ar-EG')} راوٍ</span>
          {totalPages > 1 && (
            <span>صفحة {pg} من {totalPages}</span>
          )}
        </div>
      </div>

      {/* Narrator list */}
      <div className="grid grid-cols-1 gap-2">
        {narrators.map(n => (
          <Link key={n.id} href={`/narrator/${n.id}`}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 hover:shadow-sm hover:border-green-200 transition-all group">

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-green-900 group-hover:text-green-700">
                  {n.name}
                </span>
                {n.is_companion && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">صحابي</span>
                )}
                {n.abb_name && n.abb_name !== n.name && (
                  <span className="text-xs text-gray-400">({n.abb_name})</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {n.martaba_ibn_hajar && (
                  <span className={`text-xs ${gradeClass(n.martaba_ibn_hajar)}`}>
                    {n.martaba_ibn_hajar.split('،')[0].trim().slice(0, 20)}
                  </span>
                )}
                {n.death_year && (
                  <span className="text-xs text-gray-400">ت {n.death_year}هـ</span>
                )}
              </div>
            </div>

            {n.hadiths_count ? (
              <div className="shrink-0 text-left">
                <span className="text-xs font-semibold text-green-700">{n.hadiths_count.toLocaleString('ar-EG')}</span>
                <span className="text-xs text-gray-400 mr-1">حديث</span>
              </div>
            ) : null}
          </Link>
        ))}
      </div>

      {narrators.length === 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
          لا توجد رواة بهذا الحرف
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {pg > 1 && (
            <Link href={buildUrl(letter, pg - 1)}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              السابق
            </Link>
          )}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(pg - 2, totalPages - 4))
            const p = start + i
            if (p > totalPages) return null
            return (
              <Link key={p} href={buildUrl(letter, p)}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  p === pg ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                }`}>
                {p.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {pg < totalPages && (
            <Link href={buildUrl(letter, pg + 1)}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              التالي
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators" className="text-green-700 hover:underline">← بحث الرواة</Link>
        <Link href="/narrators/sahihayn" className="text-green-700 hover:underline">← رجال الصحيحين</Link>
        <Link href="/narrators/jarh-terms" className="text-green-700 hover:underline">← مصطلحات الجرح</Link>
      </div>
    </div>
  )
}
