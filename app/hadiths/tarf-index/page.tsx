import pool from '@/lib/db'
import Link from 'next/link'
import HadithNumber from '@/app/components/HadithNumber'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'فهرس الأطراف الأبجدي — جامع خادم الحرمين' }

// Arabic alphabet with normalization mappings
const ARABIC_LETTERS = [
  { display: 'أ', normalized: 'ا', label: 'الألف' },
  { display: 'ب', normalized: 'ب', label: 'الباء' },
  { display: 'ت', normalized: 'ت', label: 'التاء' },
  { display: 'ث', normalized: 'ث', label: 'الثاء' },
  { display: 'ج', normalized: 'ج', label: 'الجيم' },
  { display: 'ح', normalized: 'ح', label: 'الحاء' },
  { display: 'خ', normalized: 'خ', label: 'الخاء' },
  { display: 'د', normalized: 'د', label: 'الدال' },
  { display: 'ذ', normalized: 'ذ', label: 'الذال' },
  { display: 'ر', normalized: 'ر', label: 'الراء' },
  { display: 'ز', normalized: 'ز', label: 'الزاي' },
  { display: 'س', normalized: 'س', label: 'السين' },
  { display: 'ش', normalized: 'ش', label: 'الشين' },
  { display: 'ص', normalized: 'ص', label: 'الصاد' },
  { display: 'ض', normalized: 'ض', label: 'الضاد' },
  { display: 'ط', normalized: 'ط', label: 'الطاء' },
  { display: 'ظ', normalized: 'ظ', label: 'الظاء' },
  { display: 'ع', normalized: 'ع', label: 'العين' },
  { display: 'غ', normalized: 'غ', label: 'الغين' },
  { display: 'ف', normalized: 'ف', label: 'الفاء' },
  { display: 'ق', normalized: 'ق', label: 'القاف' },
  { display: 'ك', normalized: 'ك', label: 'الكاف' },
  { display: 'ل', normalized: 'ل', label: 'اللام' },
  { display: 'م', normalized: 'م', label: 'الميم' },
  { display: 'ن', normalized: 'ن', label: 'النون' },
  { display: 'ه', normalized: 'ه', label: 'الهاء' },
  { display: 'و', normalized: 'و', label: 'الواو' },
  { display: 'ي', normalized: 'ي', label: 'الياء' },
]

interface TarfRow {
  main_id: number
  tarf: string | null
  book_title: string
  takhrij_author: string | null
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_hint: string | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function TarfIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string; page?: string; book?: string }>
}) {
  const sp = await searchParams
  const selectedLetter = sp.letter || ''
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const bookFilter = sp.book || ''
  const limit = 60
  const offset = (pg - 1) * limit

  const letterData = ARABIC_LETTERS.find(l => l.display === selectedLetter || l.normalized === selectedLetter)
  const normalizedLetter = letterData?.normalized || selectedLetter

  // Get hadiths for selected letter
  let hadiths: TarfRow[] = []
  let total = 0

  if (normalizedLetter) {
    const bookClause = bookFilter ? `AND b.id = $4` : ''
    const params: (string | number)[] = [normalizedLetter, limit, offset]
    if (bookFilter) params.push(parseInt(bookFilter))

    const [hadithsRes, countRes] = await Promise.all([
      pool.query<TarfRow>(
        `SELECT ht.main_id,
                regexp_replace(ht.tarf, '<[^>]+>', ' ', 'g') AS tarf,
                b.title AS book_title, b.takhrij_author,
                ht.tarqeem_harf, ht.tarqeem_matboa1,
                jg.grade_hint
         FROM hadith_toc ht
         JOIN books b ON b.id = ht.book_id
         LEFT JOIN LATERAL (
           SELECT CASE
             WHEN say_text ~* 'صحيح' THEN 'صحيح'
             WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
             WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
             ELSE NULL END AS grade_hint
           FROM hadith_judgments j2
           WHERE j2.hadith_id = ht.main_id
             AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
           ORDER BY CASE WHEN j2.say_text ~* 'صحيح' THEN 1 WHEN j2.say_text ~* 'حسن' THEN 2 ELSE 3 END
           LIMIT 1
         ) jg ON true
         WHERE ht.is_leaf = true AND ht.is_paragraph = true
           AND left(normalize_hadith(regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', '', 'g')), 1) = $1
           ${bookClause}
         ORDER BY normalize_hadith(regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', '', 'g'))
         LIMIT $2 OFFSET $3`,
        params
      ).catch(() => ({ rows: [] as TarfRow[] })),

      pool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt
         FROM hadith_toc ht
         JOIN books b ON b.id = ht.book_id
         WHERE ht.is_leaf = true AND ht.is_paragraph = true
           AND left(normalize_hadith(regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', '', 'g')), 1) = $1
           ${bookClause}`,
        bookFilter ? [normalizedLetter, parseInt(bookFilter)] : [normalizedLetter]
      ).catch(() => ({ rows: [{ cnt: 0 }] })),
    ])

    hadiths = hadithsRes.rows
    total = countRes.rows[0]?.cnt || 0
  }

  const totalPages = Math.ceil(total / limit)

  function gradeClass(g: string | null) {
    if (g === 'صحيح') return 'bg-green-100 text-green-700'
    if (g === 'حسن') return 'bg-amber-100 text-amber-700'
    if (g === 'ضعيف') return 'bg-red-100 text-red-600'
    return ''
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">فهرس الأطراف الأبجدي</h1>
        <p className="text-sm text-gray-500 mb-1">
          تصفح الأحاديث مرتبةً بحسب أوائل ألفاظها — على نهج كتب "أطراف الحديث" في التراث الحديثي
        </p>
        <p className="text-xs text-gray-400">
          اختر حرفاً للاطلاع على الأحاديث التي تبدأ بكلمة من ذلك الحرف
        </p>
      </div>

      {/* Letter grid */}
      <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5 mb-6">
        {ARABIC_LETTERS.map(l => (
          <Link
            key={l.display}
            href={`/hadiths/tarf-index?letter=${l.display}`}
            title={l.label}
            className={`text-center py-2.5 rounded-xl text-lg font-bold transition-all border ${
              (selectedLetter === l.display || normalizedLetter === l.normalized && selectedLetter)
                ? 'bg-green-800 text-white border-green-800 shadow-md'
                : 'bg-white text-green-900 border-gray-200 hover:bg-green-50 hover:border-green-300'
            }`}
          >
            {l.display}
          </Link>
        ))}
      </div>

      {/* Results */}
      {!normalizedLetter ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <p className="text-gray-600 mb-2 font-medium">اختر حرفاً من الفهرس أعلاه</p>
          <p className="text-sm text-gray-400">
            يعرض الفهرس أطراف الأحاديث (أوائل ألفاظها) مرتبةً أبجدياً — أداة تراثية
            يستخدمها الباحثون للوصول إلى الحديث عبر معرفة مستهله
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-bold text-green-900">
              أطراف حرف {letterData?.display || selectedLetter}
              <span className="text-sm font-normal text-gray-500 mr-2">
                ({total.toLocaleString('ar-EG')} حديث)
              </span>
            </h2>
            {pg > 1 || total > limit ? (
              <span className="text-xs text-gray-400">
                صفحة {pg.toLocaleString('ar-EG')} من {totalPages.toLocaleString('ar-EG')}
              </span>
            ) : null}
          </div>

          <div className="space-y-2">
            {hadiths.map((h, idx) => {
              const text = stripTags(h.tarf || '')
              return (
                <Link
                  key={h.main_id}
                  href={`/hadith/${h.main_id}`}
                  className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 hover:shadow-sm hover:border-green-200 transition-all group"
                >
                  <span className="text-xs text-gray-300 mt-1 w-8 shrink-0 text-left">
                    {(offset + idx + 1).toLocaleString('ar-EG')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs text-green-700 font-medium shrink-0">{h.book_title}</span>
                      {h.takhrij_author && (
                        <span className="text-xs text-gray-400">{h.takhrij_author}</span>
                      )}
                      <HadithNumber harf={h.tarqeem_harf} matboa={h.tarqeem_matboa1} />
                      {h.grade_hint && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${gradeClass(h.grade_hint)}`}>
                          {h.grade_hint}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 group-hover:text-green-900">
                      {text.slice(0, 220) || '—'}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>

          {hadiths.length === 0 && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
              لا توجد أحاديث تبدأ بهذا الحرف
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
              {pg > 1 && (
                <Link href={`/hadiths/tarf-index?letter=${selectedLetter}&page=${pg - 1}`}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                  السابق
                </Link>
              )}
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(pg - 3, totalPages - 6))
                const p = start + i
                if (p > totalPages) return null
                return (
                  <Link key={p} href={`/hadiths/tarf-index?letter=${selectedLetter}&page=${p}`}
                    className={`px-3 py-2 rounded-lg border text-sm ${
                      p === pg ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                    }`}>
                    {p.toLocaleString('ar-EG')}
                  </Link>
                )
              })}
              {pg < totalPages && (
                <Link href={`/hadiths/tarf-index?letter=${selectedLetter}&page=${pg + 1}`}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                  التالي
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {/* Research note */}
      <div className="mt-8 bg-green-50 border border-green-100 rounded-xl p-4 text-xs text-green-800">
        <p className="font-semibold mb-1">ملاحظة منهجية للباحثين</p>
        <p>
          تُرتَّب الأطراف بحسب اللفظ المعيار (بعد تجريد الهمزات والتشكيل) على نهج
          "تحفة الأشراف" للمزي و"إتحاف المهرة" لابن حجر. للوصول الفوري إلى حديث
          بعينه استخدم{' '}
          <Link href="/search" className="underline text-green-700 font-medium">
            البحث النصي
          </Link>
          ؛ وهذا الفهرس للتصفح المنهجي ضمن حرف معين.
        </p>
      </div>
    </div>
  )
}
