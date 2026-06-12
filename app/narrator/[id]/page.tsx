import { notFound } from 'next/navigation'
import Link from 'next/link'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

interface Narrator {
  id: number
  name: string
  abb_name: string | null
  esm_shuhra: string | null
  kunia: string | null
  laqab: string | null
  nasab: string | null
  tabaqa: string | null
  tabaqa_num: number | null
  birth_year: string | null
  death_year: string | null
  death_year_num: number | null
  birth_city: string | null
  death_city: string | null
  living_city: string | null
  journey_city: string | null
  selat_karaba: string | null
  mazhb: string | null
  hadiths_count: number | null
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  is_companion: boolean
}

interface Book {
  id: number
  title: string
}

interface NarratorLink {
  id: number
  name: string
}

export default async function NarratorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const narratorId = parseInt(id, 10)
  if (isNaN(narratorId)) notFound()

  const [narratorRes, booksRes, studentsRes, teachersRes] = await Promise.all([
    pool.query<Narrator>(
      `SELECT id, name, abb_name, esm_shuhra, kunia, laqab, nasab,
              tabaqa, tabaqa_num, birth_year, death_year, death_year_num,
              birth_city, death_city, living_city, journey_city,
              selat_karaba, mazhb, hadiths_count,
              martaba_ibn_hajar, martaba_zahabi, is_companion
       FROM narrators WHERE id = $1`,
      [narratorId]
    ),
    pool.query<Book>(
      `SELECT b.id, b.title
       FROM narrator_books nb
       JOIN books b ON b.id = nb.book_id
       WHERE nb.narrator_id = $1
       ORDER BY b.title`,
      [narratorId]
    ),
    // Teachers (شيوخه): is_sheikh=true means second_id IS the sheikh; first_id=narrator is student
    pool.query<NarratorLink>(
      `SELECT DISTINCT n.id, n.name
       FROM narrator_relations nr
       JOIN narrators n ON n.id = nr.second_id
       WHERE nr.first_id = $1 AND nr.is_sheikh = true
       ORDER BY n.name LIMIT 100`,
      [narratorId]
    ),
    // Students (تلاميذه): is_sheikh=true means second_id IS the sheikh; second_id=narrator → first_id are students
    pool.query<NarratorLink>(
      `SELECT DISTINCT n.id, n.name
       FROM narrator_relations nr
       JOIN narrators n ON n.id = nr.first_id
       WHERE nr.second_id = $1 AND nr.is_sheikh = true
       ORDER BY n.name LIMIT 100`,
      [narratorId]
    ),
  ])

  if (narratorRes.rows.length === 0) notFound()

  const narrator = narratorRes.rows[0]
  const books = booksRes.rows
  const teachers = studentsRes.rows
  const students = teachersRes.rows

  const gradingColor = (grade: string | null) => {
    if (!grade) return 'bg-gray-100 text-gray-600'
    if (/ثقة|صحيح|عدل/.test(grade)) return 'bg-green-100 text-green-800'
    if (/صدوق|حسن/.test(grade)) return 'bg-amber-100 text-amber-800'
    if (/ضعيف|منكر/.test(grade)) return 'bg-red-100 text-red-700'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      {/* Header */}
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/narrators" className="text-amber-200 hover:text-white text-sm transition-colors">
            ← قائمة الرواة
          </Link>
          <h1 className="text-lg font-bold text-amber-100">موسوعة الحديث الشريف</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Name Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-wrap items-start gap-3 mb-4">
            {narrator.is_companion && (
              <span className="bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                صحابي
              </span>
            )}
            <h2 className="text-2xl font-bold text-green-900 leading-snug flex-1">
              {narrator.name}
            </h2>
          </div>

          {narrator.abb_name && narrator.abb_name !== narrator.name && (
            <p className="text-gray-500 text-sm mb-3">الاسم المختصر: {narrator.abb_name}</p>
          )}

          {/* Grading Badges */}
          <div className="flex flex-wrap gap-2 mb-4">
            {narrator.martaba_ibn_hajar && (
              <span className={`text-sm font-medium px-3 py-1 rounded-full border ${gradingColor(narrator.martaba_ibn_hajar)}`}>
                ابن حجر: {narrator.martaba_ibn_hajar}
              </span>
            )}
            {narrator.martaba_zahabi && (
              <span className={`text-sm font-medium px-3 py-1 rounded-full border ${gradingColor(narrator.martaba_zahabi)}`}>
                الذهبي: {narrator.martaba_zahabi}
              </span>
            )}
          </div>

          {/* Info Grid — matches original software field layout */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {narrator.laqab && narrator.laqab.trim() && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-gray-400 block text-xs mb-0.5">اللقب</span>
                <span className="text-gray-800 font-medium">{narrator.laqab}</span>
              </div>
            )}
            {narrator.kunia && narrator.kunia.trim() && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-gray-400 block text-xs mb-0.5">الكنية</span>
                <span className="text-gray-800 font-medium">{narrator.kunia}</span>
              </div>
            )}
            {narrator.nasab && narrator.nasab.trim() && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-gray-400 block text-xs mb-0.5">النسب</span>
                <span className="text-gray-800 font-medium">{narrator.nasab}</span>
              </div>
            )}
            {narrator.living_city && narrator.living_city.trim() && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-gray-400 block text-xs mb-0.5">بلد الإقامة</span>
                <span className="text-gray-800 font-medium">{narrator.living_city}</span>
              </div>
            )}
            {narrator.selat_karaba && narrator.selat_karaba.trim() && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-gray-400 block text-xs mb-0.5">علاقات الراوي</span>
                <span className="text-gray-800 font-medium leading-relaxed">{narrator.selat_karaba}</span>
              </div>
            )}
            {narrator.birth_year && narrator.birth_year.trim() && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-gray-400 block text-xs mb-0.5">تاريخ الميلاد</span>
                <span className="text-gray-800 font-medium">{narrator.birth_year}</span>
              </div>
            )}
            {narrator.death_year && narrator.death_year.trim() && (
              <div className="col-span-2 sm:col-span-3">
                <span className="text-gray-400 block text-xs mb-0.5">تاريخ الوفاة</span>
                <span className="text-gray-800 font-medium">{narrator.death_year}</span>
              </div>
            )}
            {narrator.death_city && narrator.death_city.trim() && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">بلد الوفاة</span>
                <span className="text-gray-800 font-medium">{narrator.death_city}</span>
              </div>
            )}
            {narrator.journey_city && narrator.journey_city.trim() && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">بلد الرحلة</span>
                <span className="text-gray-800 font-medium">{narrator.journey_city}</span>
              </div>
            )}
            {narrator.mazhb && narrator.mazhb.trim() && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">المذهب</span>
                <span className="text-gray-800 font-medium">{narrator.mazhb}</span>
              </div>
            )}
            {narrator.tabaqa && narrator.tabaqa.trim() && (
              <div className="col-span-2">
                <span className="text-gray-400 block text-xs mb-0.5">طبقة رواة التقريب</span>
                <span className="text-gray-800 font-medium">{narrator.tabaqa}</span>
              </div>
            )}
            {narrator.hadiths_count != null && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">عدد الأحاديث</span>
                <span className="text-green-800 font-bold">{narrator.hadiths_count.toLocaleString('ar-EG')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Books */}
        {books.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-green-700 rounded-full inline-block"></span>
              يروي في
              <span className="text-sm text-gray-400 font-normal">({books.length} كتاب)</span>
            </h3>
            <ul className="flex flex-wrap gap-2">
              {books.map((book) => (
                <li key={book.id}>
                  <Link
                    href={`/books/${book.id}`}
                    className="inline-block bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {book.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Teachers */}
          {teachers.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-amber-500 rounded-full inline-block"></span>
                شيوخه
                <span className="text-sm text-gray-400 font-normal">({teachers.length})</span>
              </h3>
              <ul className="space-y-1.5">
                {teachers.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/narrator/${t.id}`}
                      className="text-sm text-green-800 hover:text-green-600 hover:underline transition-colors"
                    >
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Students */}
          {students.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-green-500 rounded-full inline-block"></span>
                تلاميذه
                <span className="text-sm text-gray-400 font-normal">({students.length})</span>
              </h3>
              <ul className="space-y-1.5">
                {students.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/narrator/${s.id}`}
                      className="text-sm text-green-800 hover:text-green-600 hover:underline transition-colors"
                    >
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Empty state */}
        {books.length === 0 && teachers.length === 0 && students.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
            لا توجد بيانات إضافية لهذا الراوي
          </div>
        )}
      </main>
    </div>
  )
}
