export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface Narrator {
  id: number
  name: string
  abb_name: string | null
  tabaqa: string | null
  tabaqa_num: number | null
  birth_year: string | null
  death_year: string | null
  death_year_num: number | null
  birth_city: string | null
  living_city: string | null
  death_city: string | null
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  is_companion: boolean
  hadiths_count: number | null
  mazhb: string | null
}

interface NarratorLink {
  id: number
  name: string
  martaba_ibn_hajar: string | null
}

interface CritEntry {
  scientist_name: string
  say_text: string
  garh_label: string | null
}

function gradeBadge(grade: string | null, isCompanion = false) {
  if (isCompanion) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (!grade) return 'bg-gray-100 text-gray-500 border-gray-200'
  if (/ثقة|ثبت|حجة|عدل/.test(grade)) return 'bg-green-100 text-green-700 border-green-200'
  if (/صدوق|مقبول/.test(grade)) return 'bg-amber-100 text-amber-700 border-amber-200'
  if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-100 text-red-600 border-red-200'
  return 'bg-gray-100 text-gray-500 border-gray-200'
}

export default async function NarratorComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const sp = await searchParams
  const idA = sp.a ? parseInt(sp.a) : null
  const idB = sp.b ? parseInt(sp.b) : null

  if (!idA || !idB || isNaN(idA) || isNaN(idB)) notFound()

  const narratorQuery = `
    SELECT id, name, abb_name, tabaqa, tabaqa_num,
           birth_year, death_year, death_year_num,
           birth_city, living_city, death_city,
           martaba_ibn_hajar, martaba_zahabi,
           is_companion, hadiths_count, mazhb
    FROM narrators WHERE id = $1`

  const teachersQuery = `
    SELECT DISTINCT n.id, n.name, n.martaba_ibn_hajar
    FROM narrator_relations nr
    JOIN narrators n ON n.id = nr.second_id
    WHERE nr.first_id = $1 AND nr.is_sheikh = true
    ORDER BY n.name LIMIT 50`

  const studentsQuery = `
    SELECT DISTINCT n.id, n.name, n.martaba_ibn_hajar
    FROM narrator_relations nr
    JOIN narrators n ON n.id = nr.first_id
    WHERE nr.second_id = $1 AND nr.is_sheikh = true
    ORDER BY n.name LIMIT 50`

  const criticismQuery = `
    SELECT scientist_name, say_text, garh_label
    FROM narrator_criticism
    WHERE narrator_id = $1
    LIMIT 20`

  const [
    narARes, narBRes,
    teachersARes, teachersBRes,
    studentsARes, studentsBRes,
    critARes, critBRes,
  ] = await Promise.all([
    pool.query<Narrator>(narratorQuery, [idA]),
    pool.query<Narrator>(narratorQuery, [idB]),
    pool.query<NarratorLink>(teachersQuery, [idA]),
    pool.query<NarratorLink>(teachersQuery, [idB]),
    pool.query<NarratorLink>(studentsQuery, [idA]),
    pool.query<NarratorLink>(studentsQuery, [idB]),
    pool.query<CritEntry>(criticismQuery, [idA]),
    pool.query<CritEntry>(criticismQuery, [idB]),
  ])

  if (!narARes.rows[0] || !narBRes.rows[0]) notFound()

  const narA = narARes.rows[0]
  const narB = narBRes.rows[0]

  // Find shared teachers and students
  const teacherAIds = new Set(teachersARes.rows.map(t => t.id))
  const teacherBIds = new Set(teachersBRes.rows.map(t => t.id))
  const sharedTeacherIds = [...teacherAIds].filter(id => teacherBIds.has(id))

  const studentAIds = new Set(studentsARes.rows.map(t => t.id))
  const studentBIds = new Set(studentsBRes.rows.map(t => t.id))
  const sharedStudentIds = [...studentAIds].filter(id => studentBIds.has(id))

  // Fetch shared teacher/student details
  let sharedTeachers: NarratorLink[] = []
  let sharedStudents: NarratorLink[] = []
  if (sharedTeacherIds.length > 0) {
    const ph = sharedTeacherIds.map((_, i) => `$${i + 1}`).join(',')
    const { rows } = await pool.query<NarratorLink>(
      `SELECT id, name, martaba_ibn_hajar FROM narrators WHERE id IN (${ph}) ORDER BY name`,
      sharedTeacherIds
    )
    sharedTeachers = rows
  }
  if (sharedStudentIds.length > 0) {
    const ph = sharedStudentIds.map((_, i) => `$${i + 1}`).join(',')
    const { rows } = await pool.query<NarratorLink>(
      `SELECT id, name, martaba_ibn_hajar FROM narrators WHERE id IN (${ph}) ORDER BY name`,
      sharedStudentIds
    )
    sharedStudents = rows
  }

  function Row({ label, a, b }: { label: string; a: React.ReactNode; b: React.ReactNode }) {
    return (
      <tr className="border-b border-gray-100">
        <td className="py-2 px-3 text-xs font-medium text-gray-500 bg-gray-50 w-28 text-right">{label}</td>
        <td className="py-2 px-3 text-sm text-gray-800">{a || <span className="text-gray-300">—</span>}</td>
        <td className="py-2 px-3 text-sm text-gray-800">{b || <span className="text-gray-300">—</span>}</td>
      </tr>
    )
  }

  return (
    <div dir="rtl">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link href="/narrators" className="text-sm text-green-700 hover:underline">
          ← الرواة
        </Link>
        <h1 className="text-2xl font-bold text-green-900">مقارنة الرواة</h1>
      </div>

      {/* Narrator headers */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[narA, narB].map((n, side) => (
          <div key={n.id} className={`rounded-xl border p-4 ${
            n.is_companion ? 'bg-amber-50 border-amber-200' :
            n.martaba_ibn_hajar && /ثقة|ثبت|حجة/.test(n.martaba_ibn_hajar) ? 'bg-green-50 border-green-200' :
            'bg-white border-gray-100'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <Link href={`/narrator/${n.id}`} className="font-bold text-green-800 hover:underline text-lg">
                {n.name}
              </Link>
              <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded border">
                {side === 0 ? 'الراوي الأول' : 'الراوي الثاني'}
              </span>
            </div>
            {n.abb_name && <p className="text-sm text-gray-500 mb-2">{n.abb_name}</p>}
            {(n.martaba_ibn_hajar || n.is_companion) && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${gradeBadge(n.martaba_ibn_hajar, n.is_companion)}`}>
                {n.is_companion ? 'صحابي' : n.martaba_ibn_hajar}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Comparison table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <table className="w-full" style={{ direction: 'rtl' }}>
          <thead>
            <tr className="bg-green-900 text-white text-sm">
              <th className="py-2 px-3 w-28"></th>
              <th className="py-2 px-3 text-right font-medium">{narA.abb_name || narA.name}</th>
              <th className="py-2 px-3 text-right font-medium">{narB.abb_name || narB.name}</th>
            </tr>
          </thead>
          <tbody>
            <Row label="الطبقة" a={narA.tabaqa} b={narB.tabaqa} />
            <Row label="رقم الطبقة" a={narA.tabaqa_num} b={narB.tabaqa_num} />
            <Row label="سنة الولادة" a={narA.birth_year} b={narB.birth_year} />
            <Row label="سنة الوفاة" a={narA.death_year} b={narB.death_year} />
            <Row label="مدينة الولادة" a={narA.birth_city} b={narB.birth_city} />
            <Row label="مدينة الوفاة" a={narA.death_city} b={narB.death_city} />
            <Row label="مقر الإقامة" a={narA.living_city} b={narB.living_city} />
            <Row label="المذهب" a={narA.mazhb} b={narB.mazhb} />
            <Row
              label="درجة ابن حجر"
              a={narA.martaba_ibn_hajar && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${gradeBadge(narA.martaba_ibn_hajar, narA.is_companion)}`}>
                  {narA.martaba_ibn_hajar}
                </span>
              )}
              b={narB.martaba_ibn_hajar && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${gradeBadge(narB.martaba_ibn_hajar, narB.is_companion)}`}>
                  {narB.martaba_ibn_hajar}
                </span>
              )}
            />
            <Row
              label="درجة الذهبي"
              a={narA.martaba_zahabi && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${gradeBadge(narA.martaba_zahabi, narA.is_companion)}`}>
                  {narA.martaba_zahabi}
                </span>
              )}
              b={narB.martaba_zahabi && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${gradeBadge(narB.martaba_zahabi, narB.is_companion)}`}>
                  {narB.martaba_zahabi}
                </span>
              )}
            />
            <Row
              label="عدد الأحاديث"
              a={narA.hadiths_count?.toLocaleString('ar-EG')}
              b={narB.hadiths_count?.toLocaleString('ar-EG')}
            />
            <Row
              label="عدد الشيوخ"
              a={teachersARes.rows.length + (teachersARes.rows.length >= 50 ? '+' : '')}
              b={teachersBRes.rows.length + (teachersBRes.rows.length >= 50 ? '+' : '')}
            />
            <Row
              label="عدد التلاميذ"
              a={studentsARes.rows.length + (studentsARes.rows.length >= 50 ? '+' : '')}
              b={studentsBRes.rows.length + (studentsBRes.rows.length >= 50 ? '+' : '')}
            />
          </tbody>
        </table>
      </div>

      {/* Shared teachers */}
      {sharedTeachers.length > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-5">
          <h2 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
            الشيوخ المشتركون
            <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-normal">
              {sharedTeachers.length}
            </span>
          </h2>
          <p className="text-xs text-blue-700 mb-3">
            كلا الراويَين أخذا العلم عن هؤلاء المشايخ — وجود شيخ مشترك يعزز احتمال التقاء الأسانيد
          </p>
          <div className="flex flex-wrap gap-2">
            {sharedTeachers.map(t => (
              <Link
                key={t.id}
                href={`/narrator/${t.id}`}
                className={`text-xs px-3 py-1.5 rounded-lg border hover:shadow-sm transition-all ${gradeBadge(t.martaba_ibn_hajar)}`}
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Shared students */}
      {sharedStudents.length > 0 && (
        <div className="mb-6 bg-purple-50 border border-purple-100 rounded-xl p-5">
          <h2 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
            التلاميذ المشتركون
            <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-normal">
              {sharedStudents.length}
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {sharedStudents.map(t => (
              <Link
                key={t.id}
                href={`/narrator/${t.id}`}
                className={`text-xs px-3 py-1.5 rounded-lg border hover:shadow-sm transition-all ${gradeBadge(t.martaba_ibn_hajar)}`}
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Side-by-side criticism */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[{ nar: narA, crit: critARes.rows }, { nar: narB, crit: critBRes.rows }].map(({ nar, crit }) => (
          <div key={nar.id} className="bg-white border border-gray-100 rounded-xl p-4">
            <h3 className="font-semibold text-gray-700 text-sm mb-3">
              جرح وتعديل: {nar.abb_name || nar.name}
            </h3>
            {crit.length === 0 ? (
              <p className="text-xs text-gray-400">لا توجد أقوال في قاعدة البيانات</p>
            ) : (
              <div className="space-y-2">
                {crit.map((c, i) => (
                  <div key={i} className="border-r-2 border-green-200 pr-2">
                    <p className="text-xs font-medium text-gray-600">{c.scientist_name}</p>
                    {c.garh_label && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        /ثقة|ثبت|عدل/.test(c.garh_label) ? 'bg-green-100 text-green-700' :
                        /صدوق|مقبول/.test(c.garh_label) ? 'bg-amber-100 text-amber-700' :
                        /ضعيف|منكر|متروك/.test(c.garh_label) ? 'bg-red-100 text-red-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {c.garh_label}
                      </span>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{c.say_text}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <Link href={`/narrator/${nar.id}`} className="text-xs text-green-600 hover:underline">
                عرض الترجمة الكاملة ←
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Links to chain filter */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-medium mb-2">البحث المتقدم بين الراويَين</p>
        <Link
          href={`/narrators/chain-filter?preset=${idA},${idB}`}
          className="inline-block text-xs bg-amber-700 text-white px-4 py-2 rounded-lg hover:bg-amber-800 transition-colors"
        >
          ابحث عن أسانيد تجمع كلا الراويَين ←
        </Link>
      </div>
    </div>
  )
}
