import Link from 'next/link'
import pool from '@/lib/db'
import CompareSearch from './CompareSearch'

export const dynamic = 'force-dynamic'

interface Narrator {
  id: number
  name: string
  abb_name: string | null
  kunia: string | null
  laqab: string | null
  tabaqa: string | null
  tabaqa_num: number | null
  birth_year: string | null
  death_year: string | null
  death_year_num: number | null
  birth_city: string | null
  death_city: string | null
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  is_companion: boolean
  hadiths_count: number | null
}

interface Criticism { scientist_name: string; texts: string[] }

function gradeColor(grade: string | null) {
  if (!grade) return 'bg-gray-50 text-gray-600 border-gray-200'
  if (/ثقة|ثبت|حجة|عدل|صحابي/.test(grade)) return 'bg-green-50 text-green-800 border-green-300'
  if (/صدوق|مقبول|لا بأس/.test(grade)) return 'bg-amber-50 text-amber-800 border-amber-300'
  if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-50 text-red-700 border-red-300'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null
  return (
    <div className="flex gap-2 text-sm py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-400 min-w-20 shrink-0">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  )
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const sp = await searchParams
  const idA = sp.a ? parseInt(sp.a) : null
  const idB = sp.b ? parseInt(sp.b) : null

  let narratorA: Narrator | null = null
  let narratorB: Narrator | null = null
  let criticismA: Criticism[] = []
  let criticismB: Criticism[] = []
  let relation: { direction: string; is_sheikh: boolean } | null = null

  if (idA && !isNaN(idA)) {
    const [res, critRes] = await Promise.all([
      pool.query<Narrator>(
        `SELECT id, name, abb_name, kunia, laqab, tabaqa, tabaqa_num,
                birth_year, death_year, death_year_num, birth_city, death_city,
                martaba_ibn_hajar, martaba_zahabi, is_companion, hadiths_count
         FROM narrators WHERE id = $1`, [idA]
      ),
      pool.query<{ scientist_name: string; say_text: string; say_sort: number }>(
        `SELECT scientist_name, say_text, say_sort FROM narrator_criticism
         WHERE narrator_id = $1 ORDER BY scientist_noun_id, say_sort LIMIT 50`, [idA]
      ),
    ])
    narratorA = res.rows[0] || null
    const mapA: Record<string, Criticism> = {}
    for (const r of critRes.rows) {
      if (!mapA[r.scientist_name]) mapA[r.scientist_name] = { scientist_name: r.scientist_name, texts: [] }
      if (r.say_text) mapA[r.scientist_name].texts.push(r.say_text)
    }
    criticismA = Object.values(mapA)
  }

  if (idB && !isNaN(idB)) {
    const [res, critRes] = await Promise.all([
      pool.query<Narrator>(
        `SELECT id, name, abb_name, kunia, laqab, tabaqa, tabaqa_num,
                birth_year, death_year, death_year_num, birth_city, death_city,
                martaba_ibn_hajar, martaba_zahabi, is_companion, hadiths_count
         FROM narrators WHERE id = $1`, [idB]
      ),
      pool.query<{ scientist_name: string; say_text: string; say_sort: number }>(
        `SELECT scientist_name, say_text, say_sort FROM narrator_criticism
         WHERE narrator_id = $1 ORDER BY scientist_noun_id, say_sort LIMIT 50`, [idB]
      ),
    ])
    narratorB = res.rows[0] || null
    const mapB: Record<string, Criticism> = {}
    for (const r of critRes.rows) {
      if (!mapB[r.scientist_name]) mapB[r.scientist_name] = { scientist_name: r.scientist_name, texts: [] }
      if (r.say_text) mapB[r.scientist_name].texts.push(r.say_text)
    }
    criticismB = Object.values(mapB)
  }

  // Check if they have a direct teacher-student relationship
  if (idA && idB && narratorA && narratorB) {
    const relRes = await pool.query(
      `SELECT is_sheikh FROM narrator_relations
       WHERE (first_id = $1 AND second_id = $2) OR (first_id = $2 AND second_id = $1)
       LIMIT 1`,
      [idA, idB]
    )
    if (relRes.rows.length > 0) {
      const r = relRes.rows[0]
      // is_sheikh=true means second_id is the sheikh (teacher)
      if (r.is_sheikh) {
        // Determine direction
        const isATeacher = await pool.query(
          `SELECT 1 FROM narrator_relations WHERE first_id = $1 AND second_id = $2 AND is_sheikh = true LIMIT 1`,
          [idB, idA]
        )
        if (isATeacher.rows.length > 0) {
          relation = { direction: `${narratorA.abb_name || narratorA.name} يروي عن ${narratorB.abb_name || narratorB.name}`, is_sheikh: true }
        } else {
          relation = { direction: `${narratorB.abb_name || narratorB.name} يروي عن ${narratorA.abb_name || narratorA.name}`, is_sheikh: true }
        }
      }
    }
  }

  const NarratorCard = ({ n, criticism }: { n: Narrator; criticism: Criticism[] }) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div>
        <div className="flex items-start gap-2 flex-wrap mb-2">
          {n.is_companion && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shrink-0">صحابي</span>
          )}
          <Link href={`/narrator/${n.id}`} className="text-lg font-bold text-green-900 hover:underline leading-snug">
            {n.name}
          </Link>
        </div>

        {/* Grade badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {n.martaba_ibn_hajar && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${gradeColor(n.martaba_ibn_hajar)}`}>
              ابن حجر: {n.martaba_ibn_hajar}
            </span>
          )}
          {n.martaba_zahabi && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${gradeColor(n.martaba_zahabi)}`}>
              الذهبي: {n.martaba_zahabi}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="border-t border-gray-100 pt-3 space-y-0">
          <InfoRow label="الكنية" value={n.kunia} />
          <InfoRow label="اللقب" value={n.laqab} />
          <InfoRow label="الطبقة" value={n.tabaqa} />
          <InfoRow label="الوفاة" value={n.death_year} />
          <InfoRow label="بلد الوفاة" value={n.death_city} />
          {n.hadiths_count != null && (
            <div className="flex gap-2 text-sm py-1.5">
              <span className="text-gray-400 min-w-20 shrink-0">الأحاديث</span>
              <span className="text-green-800 font-bold">{n.hadiths_count.toLocaleString('ar-EG')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Criticism */}
      {criticism.length > 0 && (
        <details>
          <summary className="text-sm font-semibold text-red-700 cursor-pointer hover:text-red-600 list-none flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block"></span>
            جرح وتعديل ({criticism.length} عالم)
          </summary>
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
            {criticism.map((c, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3 text-xs">
                <span className="font-bold text-amber-800 block mb-1">{c.scientist_name}</span>
                {c.texts.map((t, j) => <p key={j} className="text-gray-700 leading-6">{t}</p>)}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/narrators" className="text-amber-200 hover:text-white text-sm">← الرواة</Link>
          <h1 className="text-lg font-bold text-amber-100">مقارنة الرواة</h1>
          <Link href="/" className="text-amber-200 hover:text-white text-sm">الرئيسية</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Search selectors */}
        <CompareSearch initialA={sp.a || ''} initialB={sp.b || ''} />

        {/* Relation badge */}
        {relation && (
          <div className="bg-green-900 text-white rounded-xl px-6 py-3 text-center text-sm font-medium">
            {relation.direction}
            <span className="text-amber-300 mr-2">(علاقة رواية مباشرة)</span>
          </div>
        )}

        {/* Comparison columns */}
        {narratorA || narratorB ? (
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              {narratorA ? (
                <NarratorCard n={narratorA} criticism={criticismA} />
              ) : (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
                  اختر الراوي الأول
                </div>
              )}
            </div>
            <div>
              {narratorB ? (
                <NarratorCard n={narratorB} criticism={criticismB} />
              ) : (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
                  اختر الراوي الثاني
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-400 py-16">
            ابحث عن راويين لمقارنتهما
          </div>
        )}
      </main>
    </div>
  )
}
