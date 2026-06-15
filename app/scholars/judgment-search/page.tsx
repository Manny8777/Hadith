import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'البحث في نصوص أحكام العلماء — جامع خادم الحرمين' }

interface JudgmentRow {
  hadith_id: number
  say_text: string
  scientist_name: string | null
  tarf: string | null
  book_title: string
}

interface CriticismRow {
  narrator_id: number
  narrator_name: string
  abb_name: string | null
  say_text: string
  scientist_name: string | null
}

const QUICK_SEARCHES = [
  { label: 'إسناده صحيح', q: 'إسناده صحيح', type: 'hadith' },
  { label: 'إسناده حسن', q: 'إسناده حسن', type: 'hadith' },
  { label: 'إسناده ضعيف', q: 'إسناده ضعيف', type: 'hadith' },
  { label: 'إسناده صحيح على شرط مسلم', q: 'شرط مسلم', type: 'hadith' },
  { label: 'إسناده صحيح على شرط البخاري', q: 'شرط البخاري', type: 'hadith' },
  { label: 'متروك الحديث', q: 'متروك الحديث', type: 'narrator' },
  { label: 'ثقة ثبت', q: 'ثقة ثبت', type: 'narrator' },
  { label: 'حسن الحديث', q: 'حسن الحديث', type: 'narrator' },
]

export default async function JudgmentSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>
}) {
  const sp = await searchParams
  const query = (sp.q || '').trim()
  const searchType = sp.type || 'hadith'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const limit = 25
  const offset = (page - 1) * limit

  let hadithResults: JudgmentRow[] = []
  let narratorResults: CriticismRow[] = []
  let total = 0

  if (query.length >= 2) {
    if (searchType === 'hadith' || searchType === 'both') {
      const [rows, countRow] = await Promise.all([
        pool.query<JudgmentRow>(
          `SELECT DISTINCT ON (hj.hadith_id)
                  hj.hadith_id, hj.say_text,
                  n.name AS scientist_name,
                  regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
                  b.title AS book_title
           FROM hadith_judgments hj
           LEFT JOIN narrators n ON n.id = hj.scientist_id
           JOIN hadith_toc ht ON ht.main_id = hj.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
           JOIN books b ON b.id = ht.book_id
           WHERE hj.say_text ~* $1
           ORDER BY hj.hadith_id
           LIMIT ${limit} OFFSET ${offset}`,
          [query]
        ).catch(() => ({ rows: [] as JudgmentRow[] })),
        pool.query<{ total: number }>(
          `SELECT COUNT(DISTINCT hadith_id)::int AS total FROM hadith_judgments WHERE say_text ~* $1`,
          [query]
        ).catch(() => ({ rows: [{ total: 0 }] })),
      ])
      hadithResults = rows.rows
      total = countRow.rows[0]?.total || 0
    }

    if (searchType === 'narrator' || searchType === 'both') {
      const [rows, countRow] = await Promise.all([
        pool.query<CriticismRow>(
          `SELECT DISTINCT ON (nc.narrator_id)
                  nc.narrator_id,
                  n.name AS narrator_name, n.abb_name,
                  nc.say_text,
                  nc.scientist_name
           FROM narrator_criticism nc
           JOIN narrators n ON n.id = nc.narrator_id
           WHERE nc.say_text ~* $1
           ORDER BY nc.narrator_id
           LIMIT ${limit} OFFSET ${offset}`,
          [query]
        ).catch(() => ({ rows: [] as CriticismRow[] })),
        pool.query<{ total: number }>(
          `SELECT COUNT(DISTINCT narrator_id)::int AS total FROM narrator_criticism WHERE say_text ~* $1`,
          [query]
        ).catch(() => ({ rows: [{ total: 0 }] })),
      ])
      narratorResults = rows.rows
      if (searchType === 'narrator') {
        total = countRow.rows[0]?.total || 0
      }
    }
  }

  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('q', query)
    p.set('type', searchType)
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/scholars/judgment-search?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">البحث في نصوص أحكام العلماء</h1>
        <p className="text-sm text-gray-500 mb-3">
          بحث نصي في جميع أحكام المحدثين على الأحاديث والرجال — اعثر على حكم بعينه أو مصطلح في أقوال العلماء
        </p>

        {/* Search form */}
        <form action="/scholars/judgment-search" method="get" className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="ابحث: إسناده صحيح، منقطع، ضعيف جداً، على شرط مسلم..."
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400 text-right bg-white"
            autoComplete="off"
          />
          <input type="hidden" name="type" value={searchType} />
          <button type="submit"
            className="bg-green-800 text-white px-5 py-2.5 rounded-xl text-sm hover:bg-green-900 transition-colors shrink-0">
            بحث
          </button>
        </form>

        {/* Type tabs */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">البحث في:</span>
          {[
            { key: 'hadith', label: 'أحكام الأحاديث' },
            { key: 'narrator', label: 'أحكام الرواة' },
            { key: 'both', label: 'الاثنين' },
          ].map(t => (
            <Link key={t.key} href={buildUrl({ type: t.key, page: '1' })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                searchType === t.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {t.label}
            </Link>
          ))}
        </div>

        {/* Quick searches */}
        {!query && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 mb-2">بحث سريع:</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_SEARCHES.map(qs => (
                <Link key={qs.q}
                  href={`/scholars/judgment-search?q=${encodeURIComponent(qs.q)}&type=${qs.type}`}
                  className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full hover:bg-green-100 hover:text-green-800 transition-colors border border-gray-200">
                  {qs.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {query && (
          <div className="text-xs text-gray-400 mb-2">
            نتائج للبحث عن: &laquo;{query}&raquo; — {total.toLocaleString('ar-EG')} نتيجة
          </div>
        )}
      </div>

      {/* Hadith judgment results */}
      {hadithResults.length > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-bold text-gray-700 mb-3">
            أحكام على الأحاديث ({total.toLocaleString('ar-EG')})
          </h2>
          <div className="space-y-3">
            {hadithResults.map(r => (
              <div key={r.hadith_id}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm hover:border-green-200 transition-all">
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <span className="text-xs text-gray-400">{r.book_title}</span>
                  <Link href={`/hadith/${r.hadith_id}`}
                    className="text-xs text-green-700 hover:underline shrink-0">
                    عرض الحديث ←
                  </Link>
                </div>
                <p className="text-sm text-gray-800 leading-relaxed mb-2">
                  {(r.tarf || '').slice(0, 180)}
                  {(r.tarf?.length || 0) > 180 && <span className="text-gray-400">...</span>}
                </p>
                <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-1.5 text-xs text-green-800">
                  {r.scientist_name && (
                    <span className="font-bold text-green-700 ml-2">{r.scientist_name}:</span>
                  )}
                  {r.say_text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Narrator criticism results */}
      {narratorResults.length > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-bold text-gray-700 mb-3">
            أحكام على الرواة ({narratorResults.length}+)
          </h2>
          <div className="space-y-2">
            {narratorResults.map(r => (
              <div key={r.narrator_id}
                className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-sm hover:border-amber-200 transition-all flex items-start gap-3">
                <Link href={`/narrator/${r.narrator_id}`}
                  className="text-sm font-bold text-green-900 hover:underline shrink-0 w-32 truncate">
                  {r.abb_name || r.narrator_name}
                </Link>
                <div className="flex-1 text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                  {r.scientist_name && (
                    <span className="font-bold text-amber-700 ml-2">{r.scientist_name}:</span>
                  )}
                  {r.say_text}
                </div>
                <Link href={`/narrator/${r.narrator_id}/criticism-history`}
                  className="text-xs text-gray-400 hover:text-green-700 shrink-0">←</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {query && hadithResults.length === 0 && narratorResults.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          لا توجد نتائج للبحث عن &laquo;{query}&raquo;
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400">
              ← السابق
            </Link>
          )}
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400">
              التالي ←
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars" className="text-green-700 hover:underline">← أحكام المحدثين</Link>
        <Link href="/scholars/activity" className="text-green-700 hover:underline">← نشاط المحدثين</Link>
        <Link href="/hadiths/ilal" className="text-green-700 hover:underline">← علل الحديث</Link>
        <Link href="/narrators/jarh-terms" className="text-green-700 hover:underline">← مصطلحات الجرح</Link>
      </div>
    </div>
  )
}
