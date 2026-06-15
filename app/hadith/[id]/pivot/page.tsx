import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PivotNarrator {
  nar_id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
  tabaqa: string | null
  death_year_num: number | null
  chains_with_narrator: number
  min_position: number
  max_position: number
}

interface ChainCountRow {
  total_chains: number
}

function gradeColor(g: string | null) {
  if (!g) return 'bg-gray-100 text-gray-500'
  if (/ثقة|ثبت|حجة|حافظ|متفق على توثيقه/.test(g)) return 'bg-green-100 text-green-700'
  if (/صدوق|مقبول|لا بأس/.test(g)) return 'bg-amber-100 text-amber-700'
  if (/ضعيف|منكر|متروك|كذاب|مجهول/.test(g)) return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

function coveragePct(n: number, total: number) {
  return total ? Math.round((n / total) * 100) : 0
}

function barColor(pct: number) {
  if (pct === 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-orange-500'
  if (pct >= 60) return 'bg-amber-500'
  if (pct >= 40) return 'bg-yellow-400'
  return 'bg-green-400'
}

export default async function PivotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) notFound()

  const [hadithRes, countRes] = await Promise.all([
    pool.query(
      `SELECT ht.main_id,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.takhrij_author
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.main_id = $1 AND ht.is_leaf = true
       LIMIT 1`,
      [hadithId]
    ),
    pool.query<ChainCountRow>(
      `SELECT COUNT(DISTINCT isnad_id)::int AS total_chains
       FROM isnad_hadiths WHERE hadith_id = $1`,
      [hadithId]
    ),
  ])

  const hadith = hadithRes.rows[0]
  if (!hadith) notFound()

  const totalChains = countRes.rows[0]?.total_chains || 0

  if (totalChains === 0) {
    return (
      <div dir="rtl">
        <Link href={`/hadith/${hadithId}`} className="text-sm text-gray-500 hover:text-green-700">← الحديث</Link>
        <h1 className="text-xl font-bold text-green-900 mt-3 mb-3">مدار الحديث</h1>
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-500">
          لا يوجد إسناد لهذا الحديث في قاعدة البيانات
        </div>
      </div>
    )
  }

  // All narrators with their chain coverage
  const allNarratorsRes = await pool.query<PivotNarrator>(
    `SELECT pos.nar_id,
            n.name, n.abb_name, n.martaba_ibn_hajar, n.is_companion, n.tabaqa, n.death_year_num,
            COUNT(DISTINCT ic.id)::int AS chains_with_narrator,
            MIN(pos.ord)::int AS min_position,
            MAX(pos.ord)::int AS max_position
     FROM isnad_hadiths ih
     JOIN isnad_chains ic ON ic.id = ih.isnad_id
     JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
     JOIN narrators n ON n.id = pos.nar_id
     WHERE ih.hadith_id = $1
     GROUP BY pos.nar_id, n.name, n.abb_name, n.martaba_ibn_hajar, n.is_companion, n.tabaqa, n.death_year_num
     ORDER BY chains_with_narrator DESC, n.is_companion DESC, n.death_year_num ASC NULLS LAST
     LIMIT 80`,
    [hadithId]
  ).catch(() => ({ rows: [] as PivotNarrator[] }))

  const allNarrators = allNarratorsRes.rows

  // Full pivots: appear in ALL chains
  const fullPivots = allNarrators.filter(n => n.chains_with_narrator === totalChains)
  // Near-pivots: appear in 70%+ chains but not all
  const nearPivots = allNarrators.filter(n =>
    n.chains_with_narrator < totalChains &&
    n.chains_with_narrator >= Math.ceil(totalChains * 0.7)
  )
  // Others: show top 10 by coverage
  const otherNarrators = allNarrators.filter(n =>
    n.chains_with_narrator < Math.ceil(totalChains * 0.7)
  ).slice(0, 10)

  // Pivot classification
  let pivotLabel = ''
  if (fullPivots.length === 1 && !fullPivots[0].is_companion) {
    pivotLabel = 'مدار على راوٍ واحد'
  } else if (fullPivots.length === 0 && totalChains > 1) {
    pivotLabel = 'لا يوجد مدار مطلق — الأسانيد متعددة الطرق'
  } else if (fullPivots.length === 1 && fullPivots[0].is_companion) {
    pivotLabel = 'يجمع عند الصحابي'
  } else if (fullPivots.length > 1) {
    pivotLabel = `يجمع عند ${fullPivots.length} رواة في الإسناد`
  }

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href={`/hadith/${hadithId}`} className="hover:text-green-700">← الحديث {hadithId}</Link>
        <span>›</span>
        <span className="text-gray-700">مدار الحديث</span>
      </div>

      <h1 className="text-xl font-bold text-green-900 mb-1">مدار الحديث — نقطة الاجتماع</h1>
      <p className="text-sm text-gray-500 line-clamp-2 mb-4">
        {(hadith.tarf as string || '').slice(0, 120)} — {hadith.book_title}
      </p>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-green-800 text-white rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{totalChains.toLocaleString('ar-EG')}</div>
          <div className="text-xs opacity-80">إسناد</div>
        </div>
        <div className={`${fullPivots.length === 1 && !fullPivots[0].is_companion ? 'bg-red-700' : 'bg-indigo-700'} text-white rounded-xl p-3 text-center`}>
          <div className="text-xl font-bold">{fullPivots.length}</div>
          <div className="text-xs opacity-80">مدار مطلق</div>
        </div>
        <div className="bg-amber-600 text-white rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{allNarrators.length}</div>
          <div className="text-xs opacity-80">إجمالي الرواة</div>
        </div>
        <div className="bg-gray-700 text-white rounded-xl p-3 text-center">
          <div className="text-base font-bold leading-tight">{pivotLabel || '—'}</div>
          <div className="text-xs opacity-80">الحكم</div>
        </div>
      </div>

      {/* Terminology box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800">
        <span className="font-semibold">مفهوم المدار: </span>
        الراوي الذي تجتمع عنده جميع طرق الحديث يُسمى "مدار الحديث" — إذا كان ضعيفاً فالحديث ضعيف مهما تعددت الطرق لأنها كلها ترجع إليه.
        إذا تعددت الطرق بعد المدار (أي بعد الراوي المشترك) استُفيد من التعدد في تقوية الحديث.
        <span className="font-semibold mr-2">الانفراد</span>: مدار على راوٍ غير صحابي يُضعِّف إمكانية التقوية بالشواهد.
      </div>

      {/* Full pivots */}
      {fullPivots.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
            المدار المطلق — يظهر في جميع الأسانيد ({totalChains})
          </h2>
          <div className="space-y-2">
            {fullPivots.map(n => (
              <NarratorRow key={n.nar_id} n={n} total={totalChains} isFullPivot />
            ))}
          </div>
          {fullPivots.length === 1 && !fullPivots[0].is_companion && (
            <div className={`mt-2 rounded-lg p-3 text-xs border ${
              /ثقة|ثبت/.test(fullPivots[0].martaba_ibn_hajar || '')
                ? 'bg-green-50 border-green-100 text-green-800'
                : /ضعيف|منكر|مجهول/.test(fullPivots[0].martaba_ibn_hajar || '')
                ? 'bg-red-50 border-red-100 text-red-800'
                : 'bg-amber-50 border-amber-100 text-amber-800'
            }`}>
              <span className="font-semibold">تقييم الباحث: </span>
              الحديث يدور على {fullPivots[0].abb_name || fullPivots[0].name} وحده
              {fullPivots[0].martaba_ibn_hajar && ` — درجته: ${fullPivots[0].martaba_ibn_hajar}`}.
              {/ثقة|ثبت/.test(fullPivots[0].martaba_ibn_hajar || '')
                ? ' وهو ثقة، فتعدد الطرق بعده يُقوّي الحديث.'
                : /ضعيف|منكر/.test(fullPivots[0].martaba_ibn_hajar || '')
                ? ' وهو ضعيف، فلا تنفع كثرة الطرق إذا كانت كلها عنه.'
                : ' ينبغي التحقق من حاله في مصادر الجرح والتعديل.'}
            </div>
          )}
        </section>
      )}

      {fullPivots.length === 0 && totalChains > 1 && (
        <div className="mb-4 bg-green-50 border border-green-100 rounded-xl p-3 text-xs text-green-800">
          <span className="font-semibold">لا يوجد مدار مطلق: </span>
          الأسانيد لهذا الحديث متعددة الطرق ولا تجتمع كلها عند راوٍ واحد بعد الصحابي — هذا يُعزز قوة الحديث.
        </div>
      )}

      {/* Near-pivots */}
      {nearPivots.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold text-orange-700 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span>
            شبه المدار — يظهر في 70%+ من الأسانيد
          </h2>
          <div className="space-y-2">
            {nearPivots.map(n => (
              <NarratorRow key={n.nar_id} n={n} total={totalChains} />
            ))}
          </div>
        </section>
      )}

      {/* Other narrators coverage */}
      {otherNarrators.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold text-gray-600 mb-2">رواة بتغطية أقل</h2>
          <div className="space-y-1.5">
            {otherNarrators.map(n => (
              <NarratorRow key={n.nar_id} n={n} total={totalChains} compact />
            ))}
          </div>
        </section>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline">← الحديث</Link>
        <Link href={`/hadith/${hadithId}/all-narrators`} className="text-green-700 hover:underline">← كل الرواة</Link>
        <Link href={`/hadith/${hadithId}/chain-analysis`} className="text-green-700 hover:underline">← تحليل الإسناد</Link>
        <Link href={`/hadith/${hadithId}/witnesses`} className="text-green-700 hover:underline">← الشواهد</Link>
      </div>
    </div>
  )
}

function NarratorRow({
  n,
  total,
  isFullPivot = false,
  compact = false,
}: {
  n: PivotNarrator
  total: number
  isFullPivot?: boolean
  compact?: boolean
}) {
  const pct = coveragePct(n.chains_with_narrator, total)
  const bar = barColor(pct)
  const grade = gradeColor(n.martaba_ibn_hajar)

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <Link href={`/narrator/${n.nar_id}`} className="text-green-800 hover:underline w-32 truncate shrink-0">
          {n.abb_name || n.name}
        </Link>
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className={`h-2 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-gray-500 w-14 shrink-0 text-left">{n.chains_with_narrator}/{total} ({pct}%)</span>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border p-3 ${
      isFullPivot ? 'border-red-200 bg-red-50' : 'border-orange-100 bg-orange-50'
    }`}>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          {isFullPivot && (
            <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">مدار</span>
          )}
          {n.is_companion && (
            <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full">صحابي</span>
          )}
          <Link href={`/narrator/${n.nar_id}`}
            className="font-bold text-green-900 hover:underline text-sm">
            {n.name}
          </Link>
          {n.abb_name && n.abb_name !== n.name && (
            <span className="text-xs text-gray-400">({n.abb_name})</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {n.martaba_ibn_hajar && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${grade}`}>
              {n.martaba_ibn_hajar}
            </span>
          )}
          {n.death_year_num && (
            <span className="text-xs text-gray-400">ت {n.death_year_num}هـ</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
          <div className={`h-3 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-medium text-gray-700 shrink-0 w-20 text-left">
          {n.chains_with_narrator}/{total} إسناد ({pct}%)
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
        <span>موضع: {n.min_position === n.max_position ? n.min_position : `${n.min_position}–${n.max_position}`} في السند</span>
        {n.tabaqa && <span>الطبقة: {n.tabaqa}</span>}
      </div>
    </div>
  )
}
