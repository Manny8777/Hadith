import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface HadithNarrator {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  death_year: string | null
  death_year_num: number | null
  tabaqa: string | null
  is_companion: boolean
  chain_appearances: number
  min_position: number
  max_position: number
}

function gradeClass(g: string | null, isComp: boolean) {
  if (isComp) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (!g) return 'bg-gray-100 text-gray-500 border-gray-200'
  if (g.includes('ثق') || g.includes('حافظ')) return 'bg-green-100 text-green-700 border-green-200'
  if (g.includes('صدوق') || g.includes('لا بأس') || g.includes('حسن')) return 'bg-amber-100 text-amber-700 border-amber-200'
  if (g.includes('ضعيف') || g.includes('متروك') || g.includes('منكر')) return 'bg-red-100 text-red-600 border-red-200'
  if (g.includes('مجهول')) return 'bg-gray-100 text-gray-600 border-gray-200'
  return 'bg-blue-50 text-blue-700 border-blue-200'
}

export default async function AllNarratorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) notFound()

  const [hadithRes, narratorsRes, chainCountRes] = await Promise.all([
    pool.query(
      `SELECT ht.main_id,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.takhrij_author
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.main_id = $1`,
      [hadithId]
    ),

    pool.query<HadithNarrator>(
      `SELECT n.id, n.name, n.abb_name, n.martaba_ibn_hajar,
              n.death_year_num AS death_year, n.death_year_num, n.tabaqa, n.is_companion,
              COUNT(DISTINCT ic.id)::int AS chain_appearances,
              MIN(pos.ord)::int AS min_position,
              MAX(pos.ord)::int AS max_position
       FROM isnad_hadiths ih
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
       JOIN narrators n ON n.id = pos.nar_id
       WHERE ih.hadith_id = $1
       GROUP BY n.id, n.name, n.abb_name, n.martaba_ibn_hajar, n.death_year_num, n.tabaqa, n.is_companion
       ORDER BY n.is_companion DESC, MIN(pos.ord) ASC, chain_appearances DESC`,
      [hadithId]
    ).catch(() => ({ rows: [] as HadithNarrator[] })),

    pool.query<{ cnt: number }>(
      `SELECT COUNT(DISTINCT ih.isnad_id)::int AS cnt
       FROM isnad_hadiths ih WHERE ih.hadith_id = $1`,
      [hadithId]
    ).catch(() => ({ rows: [{ cnt: 0 }] })),
  ])

  const hadith = hadithRes.rows[0]
  if (!hadith) notFound()

  const narrators = narratorsRes.rows
  const totalChains = chainCountRes.rows[0]?.cnt || 0

  const companions = narrators.filter(n => n.is_companion)
  const nonCompanions = narrators.filter(n => !n.is_companion)

  const thiqat = nonCompanions.filter(n => n.martaba_ibn_hajar?.includes('ثق') || n.martaba_ibn_hajar?.includes('حافظ'))
  const sadouq = nonCompanions.filter(n =>
    n.martaba_ibn_hajar?.includes('صدوق') ||
    n.martaba_ibn_hajar?.includes('لا بأس') ||
    n.martaba_ibn_hajar?.includes('حسن')
  )
  const duafa = nonCompanions.filter(n =>
    n.martaba_ibn_hajar?.includes('ضعيف') ||
    n.martaba_ibn_hajar?.includes('متروك') ||
    n.martaba_ibn_hajar?.includes('منكر')
  )
  const majhoul = nonCompanions.filter(n => n.martaba_ibn_hajar?.includes('مجهول'))
  const other = nonCompanions.filter(n =>
    !thiqat.includes(n) && !sadouq.includes(n) && !duafa.includes(n) && !majhoul.includes(n)
  )

  return (
    <div dir="rtl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href="/books" className="hover:text-green-700">الكتب</Link>
        <span>›</span>
        <Link href={`/hadith/${hadithId}`} className="hover:text-green-700">الحديث {hadithId}</Link>
        <span>›</span>
        <span className="text-gray-700">جميع الرواة</span>
      </div>

      <div className="mb-5">
        <h1 className="text-xl font-bold text-green-900 mb-1">رجال الحديث — جميع الرواة</h1>
        <p className="text-sm text-gray-600 line-clamp-2">{hadith.tarf?.slice(0, 160)}</p>
        <p className="text-xs text-gray-400 mt-1">{hadith.book_title} — {hadith.takhrij_author}</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'إجمالي الرواة', value: narrators.length, color: 'bg-green-800' },
          { label: 'الأسانيد', value: totalChains, color: 'bg-indigo-700' },
          { label: 'الصحابة', value: companions.length, color: 'bg-amber-600' },
          { label: 'الضعفاء', value: duafa.length, color: 'bg-red-600' },
        ].map(s => (
          <div key={s.label} className={`${s.color} text-white rounded-xl p-3 text-center`}>
            <div className="text-xl font-bold">{s.value.toLocaleString('ar-EG')}</div>
            <div className="text-xs opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Grade distribution */}
      {narrators.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
          <p className="text-xs text-gray-500 mb-2">توزيع الدرجات:</p>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'ثقة', count: thiqat.length, cls: 'bg-green-100 text-green-700' },
              { label: 'صدوق', count: sadouq.length, cls: 'bg-amber-100 text-amber-700' },
              { label: 'ضعيف', count: duafa.length, cls: 'bg-red-100 text-red-600' },
              { label: 'مجهول', count: majhoul.length, cls: 'bg-gray-100 text-gray-600' },
              { label: 'غير محدد', count: other.length, cls: 'bg-blue-50 text-blue-600' },
            ].filter(g => g.count > 0).map(g => (
              <span key={g.label} className={`text-xs px-2.5 py-1 rounded-full font-medium ${g.cls}`}>
                {g.label} ({g.count})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Companions */}
        {companions.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
              <span className="w-1 h-4 bg-amber-500 rounded-full inline-block" />
              الصحابة ({companions.length})
            </h2>
            <div className="space-y-2">
              {companions.map(n => (
                <NarratorRow key={n.id} n={n} />
              ))}
            </div>
          </section>
        )}

        {/* Thiqat */}
        {thiqat.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-green-800 mb-2 flex items-center gap-2">
              <span className="w-1 h-4 bg-green-500 rounded-full inline-block" />
              الثقات ({thiqat.length})
            </h2>
            <div className="space-y-2">
              {thiqat.map(n => (
                <NarratorRow key={n.id} n={n} />
              ))}
            </div>
          </section>
        )}

        {/* Sadouq */}
        {sadouq.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-amber-700 mb-2 flex items-center gap-2">
              <span className="w-1 h-4 bg-amber-400 rounded-full inline-block" />
              الصدوقون ({sadouq.length})
            </h2>
            <div className="space-y-2">
              {sadouq.map(n => (
                <NarratorRow key={n.id} n={n} />
              ))}
            </div>
          </section>
        )}

        {/* Du'afa */}
        {duafa.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-2">
              <span className="w-1 h-4 bg-red-500 rounded-full inline-block" />
              الضعفاء ({duafa.length})
              <span className="text-xs font-normal text-red-400">— أحاديث هؤلاء تستوجب الدراسة</span>
            </h2>
            <div className="space-y-2">
              {duafa.map(n => (
                <NarratorRow key={n.id} n={n} />
              ))}
            </div>
          </section>
        )}

        {/* Majhoul */}
        {majhoul.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <span className="w-1 h-4 bg-gray-400 rounded-full inline-block" />
              المجهولون ({majhoul.length})
            </h2>
            <div className="space-y-2">
              {majhoul.map(n => (
                <NarratorRow key={n.id} n={n} />
              ))}
            </div>
          </section>
        )}

        {/* Other */}
        {other.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-blue-700 mb-2 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-400 rounded-full inline-block" />
              غير محدد الدرجة ({other.length})
            </h2>
            <div className="space-y-2">
              {other.map(n => (
                <NarratorRow key={n.id} n={n} />
              ))}
            </div>
          </section>
        )}
      </div>

      {narrators.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-500">
          لم يُعثر على رواة لهذا الحديث
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline">← الحديث</Link>
        <Link href={`/hadith/${hadithId}/chain-analysis`} className="text-green-700 hover:underline">← التحليل الزمني</Link>
        <Link href={`/hadith/${hadithId}/transmission-history`} className="text-green-700 hover:underline">← تاريخ الانتشار</Link>
      </div>
    </div>
  )
}

function NarratorRow({ n }: { n: HadithNarrator }) {
  const cls = gradeClass(n.martaba_ibn_hajar, n.is_companion)
  return (
    <div className={`flex items-center justify-between gap-3 border rounded-xl px-4 py-2.5 ${cls}`}>
      <div className="flex items-center gap-2 flex-wrap flex-1">
        <Link href={`/narrator/${n.id}`} className="font-semibold text-sm hover:underline">
          {n.abb_name || n.name}
        </Link>
        {n.tabaqa && <span className="text-xs opacity-70">{n.tabaqa}</span>}
        {n.death_year && <span className="text-xs opacity-60">ت {n.death_year}</span>}
        {n.martaba_ibn_hajar && !n.is_companion && (
          <span className="text-xs opacity-70">— {n.martaba_ibn_hajar}</span>
        )}
        {n.is_companion && (
          <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-medium">صحابي</span>
        )}
      </div>
      <div className="text-xs opacity-60 shrink-0 text-left">
        {n.chain_appearances > 1 && <span>{n.chain_appearances} أسانيد</span>}
        {n.min_position === n.max_position
          ? <span className="mr-2">م{n.min_position}</span>
          : <span className="mr-2">م{n.min_position}-{n.max_position}</span>}
      </div>
    </div>
  )
}
