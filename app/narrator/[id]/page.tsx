import { notFound } from 'next/navigation'
import Link from 'next/link'
import pool from '@/lib/db'
import NarratorHadiths from '@/app/components/NarratorHadiths'
import NarratorExport from '@/app/components/NarratorExport'

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

interface Book { id: number; title: string }
interface NarratorLink { id: number; name: string; martaba_ibn_hajar: string | null; is_companion: boolean }
interface CriticismEntry { text: string; garh_label: string | null }
interface Criticism { scientist_name: string; scientist_noun_id: number | null; entries: CriticismEntry[] }
interface Biography { book_name: string; book_id: number; entries: { title: string; content: string }[] }

function gradingColor(grade: string | null) {
  if (!grade) return 'bg-gray-100 text-gray-600 border-gray-200'
  if (/ثقة|صحيح|عدل|صحابي/.test(grade)) return 'bg-green-100 text-green-800 border-green-200'
  if (/صدوق|حسن|مقبول/.test(grade)) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

export default async function NarratorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const narratorId = parseInt(id, 10)
  if (isNaN(narratorId)) notFound()

  const [narratorRes, booksRes, studentsRes, teachersRes, criticismRes, biographyRes, gradeStatsRes, specialRelRes] = await Promise.all([
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
    // Teachers (شيوخه): first_id=narrator, second_id=sheikh
    pool.query<NarratorLink>(
      `SELECT DISTINCT n.id, n.name, n.martaba_ibn_hajar, n.is_companion
       FROM narrator_relations nr
       JOIN narrators n ON n.id = nr.second_id
       WHERE nr.first_id = $1 AND nr.is_sheikh = true
       ORDER BY n.name LIMIT 200`,
      [narratorId]
    ),
    // Students (تلاميذه): second_id=narrator is teacher, first_id are students
    pool.query<NarratorLink>(
      `SELECT DISTINCT n.id, n.name, n.martaba_ibn_hajar, n.is_companion
       FROM narrator_relations nr
       JOIN narrators n ON n.id = nr.first_id
       WHERE nr.second_id = $1 AND nr.is_sheikh = true
       ORDER BY n.name LIMIT 200`,
      [narratorId]
    ),
    // جرح وتعديل — all criticism from all scholars
    pool.query<{ scientist_name: string; scientist_noun_id: number | null; say_text: string; say_sort: number; garh_label: string | null }>(
      `SELECT scientist_name, scientist_noun_id, say_text, say_sort, garh_label
       FROM narrator_criticism
       WHERE narrator_id = $1
       ORDER BY scientist_noun_id, say_sort, id`,
      [narratorId]
    ),
    // ترجمة الراوي — biography from classical books, deduplicated by main_id
    pool.query<{ book_name: string; book_id: number; title: string; content: string }>(
      `SELECT DISTINCT ON (main_id) book_name, book_id, title, content
       FROM narrator_biography
       WHERE narrator_id = $1
       ORDER BY main_id, book_name`,
      [narratorId]
    ),
    // Grade consensus from NounsGarh labels
    pool.query<{ garh_label: string; cnt: number }>(
      `SELECT garh_label, COUNT(DISTINCT scientist_noun_id) as cnt
       FROM narrator_criticism
       WHERE narrator_id = $1 AND garh_label IS NOT NULL AND garh_label != ''
       GROUP BY garh_label
       ORDER BY cnt DESC`,
      [narratorId]
    ),
    // Special relations: تدليس، إرسال، اختلاط، إدراك
    pool.query<{ relation_type_text: string; other_id: number; other_name: string; is_sheikh: boolean }>(
      `SELECT nrt.text as relation_type_text,
              CASE WHEN nr.first_id = $1 THEN nr.second_id ELSE nr.first_id END as other_id,
              n.name as other_name,
              nr.is_sheikh
       FROM narrator_relations nr
       JOIN narrator_relation_types nrt ON nrt.id = nr.relation_type
       JOIN narrators n ON n.id = CASE WHEN nr.first_id = $1 THEN nr.second_id ELSE nr.first_id END
       WHERE (nr.first_id = $1 OR nr.second_id = $1)
         AND nr.relation_type IN (2, 3, 5, 8, 14, 15, 16, 17)
       ORDER BY nrt.id, n.name
       LIMIT 100`,
      [narratorId]
    ).catch(() => ({ rows: [] })),
  ])

  if (narratorRes.rows.length === 0) notFound()

  const narrator = narratorRes.rows[0]
  const books = booksRes.rows
  const gradeStats: Array<{ garh_label: string; cnt: number }> = gradeStatsRes.rows
  const teachers = studentsRes.rows
  const students = teachersRes.rows

  // Group special relations by type
  type SpecialRel = { relation_type_text: string; other_id: number; other_name: string; is_sheikh: boolean }
  const specialRelRows: SpecialRel[] = (specialRelRes as { rows: SpecialRel[] }).rows
  const specialRelByType: Record<string, SpecialRel[]> = {}
  for (const r of specialRelRows) {
    if (!specialRelByType[r.relation_type_text]) specialRelByType[r.relation_type_text] = []
    specialRelByType[r.relation_type_text].push(r)
  }

  // Group criticism by scientist, preserving garh_label per entry
  const criticismMap: Record<string, Criticism> = {}
  for (const row of criticismRes.rows) {
    const name = row.scientist_name || 'غير معروف'
    if (!criticismMap[name]) {
      criticismMap[name] = { scientist_name: name, scientist_noun_id: row.scientist_noun_id, entries: [] }
    }
    if (row.say_text) {
      criticismMap[name].entries.push({ text: row.say_text, garh_label: row.garh_label || null })
    }
  }
  const criticism: Criticism[] = Object.values(criticismMap)

  // Group biography by book, skip entries where content ~= title (header duplicates)
  const bioMap: Record<string, Biography> = {}
  for (const row of biographyRes.rows) {
    const bname = row.book_name || 'غير معروف'
    if (!bioMap[bname]) bioMap[bname] = { book_name: bname, book_id: row.book_id, entries: [] }
    const content = row.content?.trim() || ''
    const title = row.title?.trim() || ''
    // Skip empty content and entries that are just the book-name header
    if (!content || content.length < 10) continue
    // Avoid exact duplicate within same book
    const alreadyHas = bioMap[bname].entries.some(e => e.content === content)
    if (!alreadyHas) {
      bioMap[bname].entries.push({ title, content })
    }
  }
  const biographies: Biography[] = Object.values(bioMap).filter(b => b.entries.length > 0)

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/narrators" className="text-amber-200 hover:text-white text-sm transition-colors">
            ← قائمة الرواة
          </Link>
          <h1 className="text-lg font-bold text-amber-100">موسوعة الحديث الشريف</h1>
          <div className="flex items-center gap-2">
            <Link href={`/compare?a=${narratorId}`} className="text-amber-300 hover:text-white text-xs transition-colors border border-amber-400/40 px-2 py-1 rounded">
              مقارنة
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Name Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-wrap items-start gap-3 mb-4">
            {narrator.is_companion && (
              <span className="bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full">صحابي</span>
            )}
            <h2 className="text-2xl font-bold text-green-900 leading-snug flex-1">{narrator.name}</h2>
          </div>

          <div className="flex items-center justify-between mb-3">
            {narrator.abb_name && narrator.abb_name !== narrator.name ? (
              <p className="text-gray-500 text-sm">الاسم المختصر: {narrator.abb_name}</p>
            ) : <span />}
            <NarratorExport
              narrator={narrator}
              criticism={criticism}
              biographies={biographies}
              gradeStats={gradeStats}
              booksCount={books.length}
              teachersCount={teachers.length}
              studentsCount={students.length}
            />
          </div>
          {narrator.esm_shuhra && narrator.esm_shuhra.trim() && (
            <p className="text-gray-500 text-sm mb-3">اشتهر بـ: {narrator.esm_shuhra}</p>
          )}

          {/* Quick Grading Badges */}
          <div className="flex flex-wrap gap-2 mb-5">
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

          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm border-t border-gray-100 pt-4">
            {narrator.kunia && narrator.kunia.trim() && (
              <div className="flex gap-2">
                <span className="text-gray-400 min-w-24">الكنية</span>
                <span className="text-gray-800 font-medium">{narrator.kunia}</span>
              </div>
            )}
            {narrator.laqab && narrator.laqab.trim() && (
              <div className="flex gap-2">
                <span className="text-gray-400 min-w-24">اللقب</span>
                <span className="text-gray-800 font-medium">{narrator.laqab}</span>
              </div>
            )}
            {narrator.nasab && narrator.nasab.trim() && (
              <div className="flex gap-2 col-span-2">
                <span className="text-gray-400 min-w-24">النسب</span>
                <span className="text-gray-800 font-medium">{narrator.nasab}</span>
              </div>
            )}
            {narrator.birth_year && narrator.birth_year.trim() && (
              <div className="flex gap-2 col-span-2">
                <span className="text-gray-400 min-w-24">تاريخ الميلاد</span>
                <span className="text-gray-800 font-medium">{narrator.birth_year}</span>
              </div>
            )}
            {narrator.birth_city && narrator.birth_city.trim() && (
              <div className="flex gap-2">
                <span className="text-gray-400 min-w-24">بلد الميلاد</span>
                <span className="text-gray-800 font-medium">{narrator.birth_city}</span>
              </div>
            )}
            {narrator.death_year && narrator.death_year.trim() && (
              <div className="flex gap-2 col-span-2">
                <span className="text-gray-400 min-w-24">تاريخ الوفاة</span>
                <span className="text-gray-800 font-medium">{narrator.death_year}</span>
              </div>
            )}
            {narrator.death_city && narrator.death_city.trim() && (
              <div className="flex gap-2">
                <span className="text-gray-400 min-w-24">بلد الوفاة</span>
                <span className="text-gray-800 font-medium">{narrator.death_city}</span>
              </div>
            )}
            {narrator.living_city && narrator.living_city.trim() && (
              <div className="flex gap-2">
                <span className="text-gray-400 min-w-24">بلد الإقامة</span>
                <span className="text-gray-800 font-medium">{narrator.living_city}</span>
              </div>
            )}
            {narrator.journey_city && narrator.journey_city.trim() && (
              <div className="flex gap-2">
                <span className="text-gray-400 min-w-24">بلد الرحلة</span>
                <span className="text-gray-800 font-medium">{narrator.journey_city}</span>
              </div>
            )}
            {narrator.mazhb && narrator.mazhb.trim() && (
              <div className="flex gap-2">
                <span className="text-gray-400 min-w-24">المذهب</span>
                <span className="text-gray-800 font-medium">{narrator.mazhb}</span>
              </div>
            )}
            {narrator.selat_karaba && narrator.selat_karaba.trim() && (
              <div className="flex gap-2 col-span-2">
                <span className="text-gray-400 min-w-24">علاقات الراوي</span>
                <span className="text-gray-800 font-medium leading-relaxed">{narrator.selat_karaba}</span>
              </div>
            )}
            {narrator.tabaqa && narrator.tabaqa.trim() && (
              <div className="flex gap-2 col-span-2">
                <span className="text-gray-400 min-w-24">الطبقة</span>
                <span className="text-gray-800 font-medium">{narrator.tabaqa}</span>
              </div>
            )}
            {narrator.hadiths_count != null && (
              <div className="flex gap-2">
                <span className="text-gray-400 min-w-24">عدد الأحاديث</span>
                <span className="text-green-800 font-bold">{narrator.hadiths_count.toLocaleString('ar-EG')}</span>
              </div>
            )}
          </div>
        </div>

        {/* ترجمة الراوي — Biography from classical books */}
        {biographies.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-green-900 mb-5 flex items-center gap-2">
              <span className="w-1 h-5 bg-amber-500 rounded-full inline-block"></span>
              ترجمة الراوي
              <span className="text-sm text-gray-400 font-normal">({biographies.length} مصدر)</span>
            </h3>
            <div className="space-y-4">
              {biographies.map((bio, i) => (
                <details key={i} className="border border-gray-100 rounded-xl bg-amber-50 group" open={i === 0}>
                  <summary className="px-4 py-3 cursor-pointer flex items-center justify-between list-none">
                    <span className="font-semibold text-amber-900 text-sm">{bio.book_name}</span>
                    <span className="text-xs text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="px-4 pb-4 space-y-3">
                    {bio.entries.map((entry, j) => (
                      <div key={j} className="bg-white rounded-lg p-4 border border-amber-100">
                        {entry.title && entry.title !== bio.book_name && (
                          <p className="text-xs text-amber-700 font-medium mb-2 leading-relaxed">{entry.title}</p>
                        )}
                        <p className="text-sm text-gray-800 leading-8 whitespace-pre-line">{entry.content}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* Special relations: تدليس، إرسال، اختلاط */}
        {Object.keys(specialRelByType).length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
            <h3 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-red-400 rounded-full inline-block"></span>
              علل الإسناد
            </h3>
            <div className="space-y-4">
              {Object.entries(specialRelByType).map(([relType, rels]) => (
                <div key={relType}>
                  <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 inline-block mb-2">
                    {relType}
                  </p>
                  <div className="flex flex-wrap gap-2 mr-2">
                    {rels.map((r, i) => (
                      <Link
                        key={i}
                        href={`/narrator/${r.other_id}`}
                        className="text-xs text-green-800 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg hover:border-green-300 hover:shadow-sm transition-all"
                      >
                        {r.other_name.split('،')[0].trim()}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* جرح وتعديل Section */}
        {criticism.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-green-900 mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-red-500 rounded-full inline-block"></span>
              جرح وتعديل
              <span className="text-sm text-gray-400 font-normal">({criticism.length} عالم)</span>
            </h3>
            {/* Grade consensus summary */}
            {gradeStats.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {gradeStats.map((gs, i) => (
                  <span key={i} className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${gradingColor(gs.garh_label)}`}>
                    {gs.garh_label}
                    {gs.cnt > 1 && <span className="opacity-70 mr-1">({gs.cnt})</span>}
                  </span>
                ))}
              </div>
            )}
            <div className="space-y-4">
              {criticism.map((c, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 min-w-28">
                      {c.scientist_noun_id ? (
                        <Link
                          href={`/narrator/${c.scientist_noun_id}`}
                          className="text-sm font-bold text-amber-800 hover:text-amber-600 hover:underline"
                        >
                          {c.scientist_name}
                        </Link>
                      ) : (
                        <span className="text-sm font-bold text-amber-800">{c.scientist_name}</span>
                      )}
                    </div>
                    <div className="flex-1 text-sm text-gray-700 leading-relaxed space-y-2">
                      {c.entries.map((entry, j) => (
                        <div key={j} className="flex flex-wrap items-start gap-2">
                          {entry.garh_label && (
                            <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${gradingColor(entry.garh_label)}`}>
                              {entry.garh_label}
                            </span>
                          )}
                          <p className="leading-7 flex-1">{entry.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Books */}
        {books.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-blue-500 rounded-full inline-block"></span>
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

        {/* Teachers & Students */}
        <div className="grid sm:grid-cols-2 gap-6">
          {teachers.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-amber-500 rounded-full inline-block"></span>
                شيوخه
                <span className="text-sm text-gray-400 font-normal">({teachers.length})</span>
              </h3>
              <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                {teachers.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <Link href={`/narrator/${t.id}`} className="text-sm text-green-800 hover:text-green-600 hover:underline transition-colors flex-1">
                      {t.is_companion && <span className="text-amber-500 text-xs ml-1">ص</span>}
                      {t.name}
                    </Link>
                    {t.martaba_ibn_hajar && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border shrink-0 ${gradingColor(t.martaba_ibn_hajar)}`}>
                        {t.martaba_ibn_hajar}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {students.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-green-500 rounded-full inline-block"></span>
                تلاميذه
                <span className="text-sm text-gray-400 font-normal">({students.length})</span>
              </h3>
              <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                {students.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <Link href={`/narrator/${s.id}`} className="text-sm text-green-800 hover:text-green-600 hover:underline transition-colors flex-1">
                      {s.is_companion && <span className="text-amber-500 text-xs ml-1">ص</span>}
                      {s.name}
                    </Link>
                    {s.martaba_ibn_hajar && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border shrink-0 ${gradingColor(s.martaba_ibn_hajar)}`}>
                        {s.martaba_ibn_hajar}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Hadiths in isnad chain — lazy loaded */}
        <NarratorHadiths narratorId={narratorId} narratorName={narrator.abb_name || narrator.name} />

        {books.length === 0 && teachers.length === 0 && students.length === 0 && criticism.length === 0 && biographies.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
            لا توجد بيانات إضافية لهذا الراوي
          </div>
        )}
      </main>
    </div>
  )
}
