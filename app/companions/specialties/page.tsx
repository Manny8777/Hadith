import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'تخصصات الصحابة في الرواية — جامع خادم الحرمين' }

const FIQH_CATS = [
  { key: 'tahara',  label: 'الطهارة',   pattern: 'طهار|وضوء|غسل|تيمم|نجاس|حيض',         color: 'bg-blue-400'   },
  { key: 'salah',   label: 'الصلاة',    pattern: 'صلا|أذان|قبلة|إمام|جمعة|عيد',          color: 'bg-green-500'  },
  { key: 'zakah',   label: 'الزكاة',    pattern: 'زكا|صدق|فطر|أموال',                     color: 'bg-yellow-500' },
  { key: 'sawm',    label: 'الصيام',    pattern: 'صوم|صيام|رمضان|إفطار|سحور',             color: 'bg-purple-400' },
  { key: 'hajj',    label: 'الحج',      pattern: 'حج|عمر|طواف|وقوف|منى',                  color: 'bg-amber-500'  },
  { key: 'janazah', label: 'الجنائز',   pattern: 'جنازة|جنائز|موت|قبر|دفن',               color: 'bg-gray-500'   },
  { key: 'nikah',   label: 'النكاح',    pattern: 'نكاح|زواج|طلاق|خلع|مهر|عدة',            color: 'bg-pink-500'   },
  { key: 'buyuu',   label: 'البيوع',    pattern: 'بيع|شراء|ربا|دين|قرض|تجارة',            color: 'bg-orange-500' },
  { key: 'adab',    label: 'الآداب',    pattern: 'أدب|خلق|أخلاق|معاملة|تواضع|فضل',       color: 'bg-teal-500'   },
  { key: 'iman',    label: 'الإيمان',   pattern: 'إيمان|إسلام|كفر|شرك|توحيد|عقيدة',      color: 'bg-indigo-500' },
]

interface CompanionRow {
  id: number
  name: string
  abb_name: string | null
  total_hadiths: number
  tahara: number; salah: number; zakah: number; sawm: number; hajj: number
  janazah: number; nikah: number; buyuu: number; adab: number; iman: number
}

export default async function CompanionSpecialtiesPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string; cat?: string }>
}) {
  const sp = await searchParams
  const limitN = Math.min(30, Math.max(5, parseInt(sp.limit || '15')))
  const focusCat = sp.cat || ''
  const catDef = FIQH_CATS.find(c => c.key === focusCat)

  const res = await pool.query<CompanionRow>(
    `SELECT
       n.id, n.name, n.abb_name,
       COUNT(DISTINCT ih.hadith_id)::int AS total_hadiths,
       COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ht.chapter_text ~* 'طهار|وضوء|غسل|تيمم|نجاس|حيض')::int AS tahara,
       COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ht.chapter_text ~* 'صلا|أذان|قبلة|إمام|جمعة|عيد')::int AS salah,
       COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ht.chapter_text ~* 'زكا|صدق|فطر|أموال')::int AS zakah,
       COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ht.chapter_text ~* 'صوم|صيام|رمضان|إفطار|سحور')::int AS sawm,
       COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ht.chapter_text ~* 'حج|عمر|طواف|وقوف|منى')::int AS hajj,
       COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ht.chapter_text ~* 'جنازة|جنائز|موت|قبر|دفن')::int AS janazah,
       COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ht.chapter_text ~* 'نكاح|زواج|طلاق|خلع|مهر|عدة')::int AS nikah,
       COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ht.chapter_text ~* 'بيع|شراء|ربا|دين|قرض|تجارة')::int AS buyuu,
       COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ht.chapter_text ~* 'أدب|خلق|أخلاق|معاملة|تواضع|فضل')::int AS adab,
       COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ht.chapter_text ~* 'إيمان|إسلام|كفر|شرك|توحيد|عقيدة')::int AS iman
     FROM narrators n
     JOIN isnad_chains ic ON ic.narrator_id_array[1] = n.id AND n.is_companion = true
     JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
     JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
     GROUP BY n.id, n.name, n.abb_name
     ORDER BY ${focusCat && FIQH_CATS.find(c => c.key === focusCat) ? focusCat : 'total_hadiths'} DESC
     LIMIT $1`,
    [limitN]
  ).catch(() => ({ rows: [] as CompanionRow[] }))

  const companions = res.rows

  // Build category profiles
  const profiles = companions.map(comp => {
    const cats = FIQH_CATS.map(cat => ({
      key: cat.key,
      label: cat.label,
      color: cat.color,
      count: (comp as unknown as Record<string, number>)[cat.key] || 0,
      pct: comp.total_hadiths > 0
        ? Math.round(((comp as unknown as Record<string, number>)[cat.key] || 0) / comp.total_hadiths * 100)
        : 0,
    })).filter(c => c.count > 0).sort((a, b) => b.count - a.count)
    return { ...comp, cats }
  })

  const maxTotal = Math.max(...companions.map(c => c.total_hadiths), 1)
  const maxCat = focusCat
    ? Math.max(...companions.map(c => (c as unknown as Record<string, number>)[focusCat] || 0), 1)
    : 1

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تخصصات الصحابة في الرواية</h1>
        <p className="text-sm text-gray-500">
          أبرز الموضوعات الفقهية في روايات كل صحابي — يكشف من تخصَّص في الطهارة أو الصلاة أو البيوع أو غيرها
        </p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <a href={`/companions/specialties?limit=${limitN}`}
          className={`text-xs px-3 py-1.5 rounded-full border ${
            !focusCat ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200'
          }`}>
          الكل — ترتيب بالحجم
        </a>
        {FIQH_CATS.map(cat => (
          <a key={cat.key}
            href={`/companions/specialties?limit=${limitN}&cat=${cat.key}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              focusCat === cat.key ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
            }`}>
            {cat.label}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-5 text-xs">
        <span className="text-gray-500">عرض أعلى:</span>
        {[10, 15, 20, 30].map(n => (
          <a key={n}
            href={`/companions/specialties?limit=${n}${focusCat ? `&cat=${focusCat}` : ''}`}
            className={`px-2.5 py-1 rounded-full border ${limitN === n ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-500 border-gray-200'}`}>
            {n}
          </a>
        ))}
      </div>

      {catDef && (
        <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2 mb-4 text-xs text-green-800">
          ترتيب الصحابة بأكثرهم رواية في: <strong>{catDef.label}</strong>
        </div>
      )}

      <div className="space-y-3">
        {profiles.map((comp, i) => {
          const focusCount = focusCat ? ((comp as unknown as Record<string, number>)[focusCat] || 0) : 0
          const topCats = comp.cats.slice(0, 6)

          return (
            <div key={comp.id}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:border-amber-200 transition-all">
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-300 w-5 shrink-0 mt-0.5">{(i + 1).toLocaleString('ar-EG')}</span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Link href={`/companions/musnad/${comp.id}`}
                      className="font-bold text-amber-900 hover:underline">
                      {comp.abb_name || comp.name}
                    </Link>
                    <span className="text-xs text-gray-400">{comp.total_hadiths.toLocaleString('ar-EG')} حديث</span>
                    {focusCat && focusCount > 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${catDef?.color || ''} text-white`}>
                        {catDef?.label}: {focusCount} ({Math.round((focusCount / comp.total_hadiths) * 100)}%)
                      </span>
                    )}
                  </div>

                  {/* Category distribution bar */}
                  <div className="flex gap-0.5 h-2 rounded-full overflow-hidden mb-2 max-w-sm">
                    {topCats.map(cat => (
                      <div key={cat.key}
                        className={cat.color}
                        style={{ width: `${cat.pct}%` }}
                        title={`${cat.label}: ${cat.pct}%`} />
                    ))}
                    <div className="bg-gray-100 flex-1" title="أخرى" />
                  </div>

                  {/* Category pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {topCats.slice(0, 5).map(cat => (
                      <span key={cat.key}
                        className="text-xs px-2 py-0.5 rounded-full bg-gray-50 border border-gray-100 text-gray-600 flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${cat.color}`} />
                        {cat.label} <span className="text-gray-400">{cat.pct}%</span>
                      </span>
                    ))}
                  </div>
                </div>
                <Link href={`/companions/musnad/${comp.id}`}
                  className="shrink-0 text-xs text-amber-700 hover:underline">
                  مسند ←
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {companions.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد بيانات
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/companions/musnad" className="text-green-700 hover:underline">← مسانيد الصحابة</Link>
        <Link href="/companions/compare" className="text-green-700 hover:underline">← مقارنة الصحابة</Link>
        <Link href="/hadiths/fiqh-map" className="text-green-700 hover:underline">← خريطة الفقه</Link>
      </div>
    </div>
  )
}
