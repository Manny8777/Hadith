import { notFound } from 'next/navigation'
import Link from 'next/link'
import pool from '@/lib/db'
import NarratorHadiths from '@/app/components/NarratorHadiths'
import NarratorExport from '@/app/components/NarratorExport'
import CompareNarratorPicker from '@/app/components/CompareNarratorPicker'
import NarratorTopics from '@/app/components/NarratorTopics'

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
  is_noun: boolean
  is_scientist: boolean
  is_has_rwaya: boolean
  is_mobham: boolean
  journey_date: string | null
  user_comments: string | null
}

interface Book { id: number; title: string; hadith_count: number }
interface NarratorLink { id: number; name: string; martaba_ibn_hajar: string | null; martaba_zahabi: string | null; is_companion: boolean; hadith_count: number }
interface PeerNarrator { id: number; name: string; martaba_ibn_hajar: string | null; martaba_zahabi: string | null; shared_count: string }
interface CriticismEntry { text: string; garh_label: string | null }
interface Criticism { scientist_name: string; scientist_noun_id: number | null; entries: CriticismEntry[] }
interface Biography { book_name: string; book_id: number; entries: { title: string; content: string; part_num: number | null; page_num: number | null }[] }

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

  const [narratorRes, booksRes, studentsRes, teachersRes, criticismRes, biographyRes, gradeStatsRes, specialRelRes, chainCountRes, chainDepthRes, peerNarratorsRes, chainPosRes, nameFormsRes] = await Promise.all([
    pool.query<Narrator>(
      `SELECT id, name, abb_name, esm_shuhra, kunia, laqab, nasab,
              tabaqa, tabaqa_num, birth_year, death_year, death_year_num,
              birth_city, death_city, living_city, journey_city,
              selat_karaba, mazhb, hadiths_count,
              martaba_ibn_hajar, martaba_zahabi, is_companion,
              is_noun, is_scientist, is_has_rwaya, is_mobham, journey_date,
              user_comments
       FROM narrators WHERE id = $1`,
      [narratorId]
    ),
    pool.query<Book>(
      `SELECT b.id, b.title, COUNT(DISTINCT ht.main_id)::int AS hadith_count
       FROM narrator_books nb
       JOIN books b ON b.id = nb.book_id
       LEFT JOIN isnad_chains ic ON ic.narrator_id_array @> ARRAY[nb.narrator_id]
       LEFT JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       LEFT JOIN hadith_toc ht ON ht.main_id = ih.hadith_id AND ht.book_id = b.id AND ht.is_leaf = true
       WHERE nb.narrator_id = $1
       GROUP BY b.id, b.title
       ORDER BY b.title`,
      [narratorId]
    ),
    // Teachers (شيوخه): first_id=narrator, second_id=sheikh
    pool.query<NarratorLink>(
      `SELECT n.id, n.name, n.martaba_ibn_hajar, n.martaba_zahabi, n.is_companion,
              COALESCE(nt.hadiths_count, 0)::int AS hadith_count
       FROM narrator_teachers nt
       JOIN narrators n ON n.id = nt.shyoukh_id
       WHERE nt.rawy_id = $1
       ORDER BY nt.hadiths_count DESC, n.name
       LIMIT 200`,
      [narratorId]
    ),
    // Students (تلاميذه): second_id=narrator is teacher, first_id are students
    pool.query<NarratorLink>(
      `SELECT n.id, n.name, n.martaba_ibn_hajar, n.martaba_zahabi, n.is_companion,
              COALESCE(nt.hadiths_count, 0)::int AS hadith_count
       FROM narrator_teachers nt
       JOIN narrators n ON n.id = nt.rawy_id
       WHERE nt.shyoukh_id = $1
       ORDER BY nt.hadiths_count DESC, n.name
       LIMIT 200`,
      [narratorId]
    ),
    // جرح وتعديل — all criticism from all scholars
    pool.query<{ scientist_name: string; scientist_noun_id: number | null; say_text: string; say_sort: number; garh_label: string | null }>(
      `SELECT COALESCE(scientist_name, 'غير معروف') AS scientist_name,
              scientist_noun_id,
              say_text,
              say_sort,
              garh_label
       FROM narrator_criticism
       WHERE narrator_id = $1
       ORDER BY scientist_name, say_sort`,
      [narratorId]
    ),
    // ترجمة الراوي — biography from classical books, deduplicated by main_id
    pool.query<{ book_name: string; book_id: number; title: string; content: string; part_num: number | null; page_num: number | null }>(
      `SELECT DISTINCT ON (nb.main_id) nb.book_name, nb.book_id, nb.title, nb.content,
              hsc.part_num, hsc.page_num
       FROM narrator_biography nb
       LEFT JOIN hadith_service_content hsc ON hsc.id = nb.main_id
       WHERE nb.narrator_id = $1
       ORDER BY nb.main_id, nb.book_name`,
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
         AND nr.relation_type IN (2, 3, 4, 5, 7, 8, 15, 16, 17, 18, 19)
       ORDER BY nrt.id, n.name
       LIMIT 100`,
      [narratorId]
    ).catch(() => ({ rows: [] })),
    // Chain count via GIN index — how many isnad chains contain this narrator
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM isnad_chains WHERE $1 = ANY(narrator_id_array)`,
      [narratorId]
    ).catch(() => ({ rows: [{ count: '0' }] })),
    // Chain depth distribution — how narrator appears across chain lengths
    pool.query<{ chain_length: number; cnt: string }>(
      `SELECT chain_length, COUNT(*)::text as cnt
       FROM isnad_chains
       WHERE $1 = ANY(narrator_id_array) AND chain_length IS NOT NULL
       GROUP BY chain_length
       ORDER BY chain_length
       LIMIT 15`,
      [narratorId]
    ).catch(() => ({ rows: [] })),
    // Academic peer narrators — who shares the same teachers (studied in same circles)
    pool.query<PeerNarrator>(
      `SELECT n.id, n.name, n.martaba_ibn_hajar, n.martaba_zahabi,
              COUNT(DISTINCT nr1.second_id)::text as shared_count
       FROM narrator_relations nr1
       JOIN narrator_relations nr2
         ON nr2.second_id = nr1.second_id
        AND nr2.is_sheikh = true
        AND nr2.first_id != $1
       JOIN narrators n ON n.id = nr2.first_id
       WHERE nr1.first_id = $1 AND nr1.is_sheikh = true
       GROUP BY n.id, n.name, n.martaba_ibn_hajar
       ORDER BY COUNT(DISTINCT nr1.second_id) DESC
       LIMIT 6`,
      [narratorId]
    ).catch(() => ({ rows: [] })),
    // Chain position distribution — at what rank does this narrator appear in chains?
    pool.query<{ pos: number; cnt: string }>(
      `SELECT array_position(narrator_id_array, $1::integer) AS pos,
              COUNT(*)::text AS cnt
       FROM isnad_chains
       WHERE $1 = ANY(narrator_id_array)
         AND array_position(narrator_id_array, $1::integer) IS NOT NULL
       GROUP BY pos
       ORDER BY pos
       LIMIT 20`,
      [narratorId]
    ).catch(() => ({ rows: [] })),
    pool.query<{ rawy_text: string }>(
      `SELECT DISTINCT rawy_text_shape AS rawy_text
       FROM narrator_name_forms
       WHERE rawy_id = $1 AND rawy_text_shape IS NOT NULL
       ORDER BY rawy_text_shape`,
      [narratorId]
    ).catch(() => ({ rows: [] })),
  ])

  if (narratorRes.rows.length === 0) notFound()

  const narrator = narratorRes.rows[0]
  const chainCount = parseInt(chainCountRes.rows[0]?.count || '0')
  const nameForms = nameFormsRes.rows
  const books = booksRes.rows
  const gradeStats: Array<{ garh_label: string; cnt: number }> = gradeStatsRes.rows
  const teachers = studentsRes.rows
  const students = teachersRes.rows
  const peerNarrators: PeerNarrator[] = (peerNarratorsRes as { rows: PeerNarrator[] }).rows
  const chainDepthRows: Array<{ chain_length: number; cnt: string }> = (chainDepthRes as { rows: Array<{ chain_length: number; cnt: string }> }).rows
  const totalChainDepthCount = chainDepthRows.reduce((s, r) => s + parseInt(r.cnt), 0)
  const chainPosRows: Array<{ pos: number; cnt: string }> = (chainPosRes as { rows: Array<{ pos: number; cnt: string }> }).rows
  const totalChainPosCount = chainPosRows.reduce((s, r) => s + parseInt(r.cnt), 0)

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
      bioMap[bname].entries.push({ title, content, part_num: row.part_num, page_num: row.page_num })
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
            <Link href={`/narrators/chain-filter?seed=${narratorId}`} className="text-amber-300 hover:text-white text-xs transition-colors border border-amber-400/40 px-2 py-1 rounded">
              تتبع الإسناد
            </Link>
            <Link href={`/compare?a=${narratorId}`} className="text-amber-300 hover:text-white text-xs transition-colors border border-amber-400/40 px-2 py-1 rounded">
              مقارنة
            </Link>
            <Link href={`/narrator/${narratorId}/statistics`} className="text-amber-300 hover:text-white text-xs transition-colors border border-amber-400/40 px-2 py-1 rounded">
              إحصاءات
            </Link>
            <Link href={`/narrator/${narratorId}/reliability`} className="text-amber-300 hover:text-white text-xs transition-colors border border-amber-400/40 px-2 py-1 rounded">
              الموثوقية
            </Link>
            <Link href={`/narrator/${narratorId}/teachers-list`} className="text-amber-300 hover:text-white text-xs transition-colors border border-amber-400/40 px-2 py-1 rounded">
              الشيوخ
            </Link>
            <Link href={`/narrator/${narratorId}/students-list`} className="text-amber-300 hover:text-white text-xs transition-colors border border-amber-400/40 px-2 py-1 rounded">
              التلاميذ
            </Link>
            <Link href={`/narrator/${narratorId}/peer-network`} className="text-amber-300 hover:text-white text-xs transition-colors border border-amber-400/40 px-2 py-1 rounded">
              الشبكة
            </Link>
            <Link href={`/scholar/${narratorId}`} className="text-amber-300 hover:text-white text-xs transition-colors border border-amber-400/40 px-2 py-1 rounded">
              أحكامه
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

          {/* Status badges row — is_noun / is_scientist / is_has_rwaya / is_mobham */}
          {(narrator.is_mobham || narrator.is_scientist || narrator.is_noun || narrator.is_has_rwaya) && (
            <div className="flex flex-wrap gap-2 mb-3">
              {narrator.is_mobham && (
                <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-full">مبهم</span>
              )}
              {narrator.is_scientist && (
                <span className="bg-blue-100 text-blue-800 border border-blue-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">عالم حديث</span>
              )}
              {narrator.is_noun && (
                <span className="bg-green-100 text-green-800 border border-green-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">راوٍ</span>
              )}
              {narrator.is_has_rwaya && (
                <span className="bg-gray-100 text-gray-600 border border-gray-200 text-xs px-2.5 py-0.5 rounded-full">له رواية</span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            {narrator.abb_name && narrator.abb_name !== narrator.name ? (
              <p className="text-gray-500 text-sm">الاسم المختصر: {narrator.abb_name}</p>
            ) : <span />}
            <div className="flex items-center gap-2 flex-wrap">
              <CompareNarratorPicker
                currentNarratorId={narrator.id}
                currentNarratorName={narrator.abb_name || narrator.name}
              />
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
          </div>
          {narrator.esm_shuhra && narrator.esm_shuhra.trim() && (
            <p className="text-gray-500 text-sm mb-3">اشتهر بـ: {narrator.esm_shuhra}</p>
          )}

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
            {narrator.journey_date && narrator.journey_date.trim() && (
              <div className="flex gap-2 col-span-2">
                <span className="text-gray-400 min-w-24">رحل في طلب الحديث</span>
                <span className="text-gray-800 font-medium">{narrator.journey_date}</span>
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
                <span className="text-gray-800 font-medium">
                  {narrator.tabaqa}
                  {narrator.tabaqa_num != null && narrator.tabaqa_num > 0 && ` (الرقم ${narrator.tabaqa_num})`}
                </span>
              </div>
            )}
            {narrator.martaba_ibn_hajar && narrator.martaba_ibn_hajar.trim() && (
              <div className="flex gap-2 col-span-2">
                <span className="text-gray-400 min-w-24">الرتبة عند ابن حجر</span>
                <span className="text-gray-800 font-medium">{narrator.martaba_ibn_hajar}</span>
              </div>
            )}
            {narrator.martaba_zahabi && narrator.martaba_zahabi.trim() && (
              <div className="flex gap-2 col-span-2">
                <span className="text-gray-400 min-w-24">الرتبة عند الذهبي</span>
                <span className="text-gray-800 font-medium">{narrator.martaba_zahabi}</span>
              </div>
            )}
            {narrator.hadiths_count != null && (
              <div className="flex gap-2">
                <span className="text-gray-400 min-w-24">عدد الأحاديث</span>
                <span className="text-green-800 font-bold">{narrator.hadiths_count.toLocaleString('ar-EG')}</span>
              </div>
            )}
            {chainCount > 0 && (
              <div className="flex gap-2">
                <span className="text-gray-400 min-w-24">عدد الأسانيد</span>
                <Link href="/narrators/network" className="text-teal-700 font-bold hover:underline">
                  {chainCount.toLocaleString('ar-EG')} إسناداً
                </Link>
              </div>
            )}
            {chainDepthRows.length > 0 && (
              <div className="flex gap-2 col-span-2">
                <span className="text-gray-400 min-w-24 shrink-0">توزيع الأسانيد</span>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {chainDepthRows.map(r => {
                    const pct = Math.round((parseInt(r.cnt) / totalChainDepthCount) * 100)
                    const label = r.chain_length === 3 ? 'ثلاثي' :
                                  r.chain_length === 4 ? 'رباعي' :
                                  r.chain_length === 5 ? 'خماسي' :
                                  r.chain_length === 6 ? 'سداسي' :
                                  r.chain_length === 7 ? 'سباعي' :
                                  `${r.chain_length} رواة`
                    return (
                      <span key={r.chain_length} className="text-xs bg-teal-50 border border-teal-200 text-teal-800 px-2 py-0.5 rounded-full">
                        {label} <span className="opacity-60">({pct}%)</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            {chainPosRows.length > 0 && (
              <div className="flex gap-2 col-span-2">
                <span className="text-gray-400 min-w-24 shrink-0">موضعه في السند</span>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {chainPosRows.map(r => {
                    const pct = Math.round((parseInt(r.cnt) / totalChainPosCount) * 100)
                    const label = r.pos === 1 ? 'أول الإسناد' :
                                  r.pos === 2 ? 'ثاني الإسناد' :
                                  r.pos === 3 ? 'ثالث الإسناد' :
                                  r.pos === 4 ? 'رابع الإسناد' :
                                  `موضع ${r.pos}`
                    return (
                      <span key={r.pos} className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">
                        {label} <span className="opacity-60">({pct}%)</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
            {nameForms.length > 0 && (
              <div className="flex gap-2 col-span-2 border-t border-gray-100 pt-3">
                <span className="text-gray-400 min-w-24 shrink-0">أشكال الاسم</span>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {nameForms.map((f, i) => (
                    <span key={i} className="text-xs bg-green-50 border border-green-200 text-green-800 px-2 py-0.5 rounded-full font-arabic">
                      {f.rawy_text}
                    </span>
                  ))}
                </div>
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
                        {(entry.part_num != null || entry.page_num != null) && (
                          <p className="mb-2 text-[11px] text-gray-400">
                            {entry.part_num != null && `الجزء ${entry.part_num}`}
                            {entry.part_num != null && entry.page_num != null && ' · '}
                            {entry.page_num != null && `الصفحة ${entry.page_num}`}
                          </p>
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

        {/* ملاحظات المحرر — editor notes */}
        {narrator.user_comments && narrator.user_comments.trim() && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-amber-500 rounded-full inline-block"></span>
              ملاحظات المحرر
            </h3>
            <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
              <p className="text-sm text-gray-800 leading-loose whitespace-pre-line font-arabic">{narrator.user_comments}</p>
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-green-900 flex items-center gap-2">
                <span className="w-1 h-5 bg-red-500 rounded-full inline-block"></span>
                جرح وتعديل
                <span className="text-sm text-gray-400 font-normal">({criticism.length} عالم)</span>
              </h3>
              <div className="flex items-center gap-2">
                <Link href="/narrators/jarh-terms"
                  className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors">
                  مصطلحات الجرح والتعديل
                </Link>
                <Link href={`/narrator/${narratorId}/criticism-history`}
                  className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors">
                  التسلسل الزمني للأحكام
                </Link>
              </div>
            </div>
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
                    <span className="mr-1.5 text-[11px] text-gray-400">({book.hadith_count.toLocaleString('ar-EG')})</span>
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
                    <span className="text-[11px] text-gray-400">{t.hadith_count.toLocaleString('ar-EG')} رواية</span>
                  </li>
                ))}
              </ul>
              <Link href={`/narrator/${narratorId}/teachers-list`}
                className="text-xs text-amber-700 hover:underline block mt-2">
                عرض كامل مع الإحصاءات ←
              </Link>
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
                    <span className="text-[11px] text-gray-400">{s.hadith_count.toLocaleString('ar-EG')} رواية</span>
                  </li>
                ))}
              </ul>
              <Link href={`/narrator/${narratorId}/students-list`}
                className="text-xs text-green-700 hover:underline block mt-2">
                عرض كامل مع الإحصاءات ←
              </Link>
            </div>
          )}
        </div>

        {/* Academic peer narrators — who studied in the same circles */}
        {peerNarrators.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-6">
            <h3 className="text-lg font-bold text-teal-900 mb-1 flex items-center gap-2">
              <span className="w-1 h-5 bg-teal-500 rounded-full inline-block"></span>
              الدائرة العلمية
              <span className="text-sm text-gray-400 font-normal">من درسوا على نفس الشيوخ</span>
            </h3>
            <p className="text-xs text-gray-400 mb-4 mr-3">
              هؤلاء الرواة تلقوا العلم عن بعض شيوخ {narrator.abb_name || narrator.name} أنفسهم — مما يجعلهم زملاء في الحلقات العلمية
            </p>
            <ul className="grid sm:grid-cols-2 gap-2">
              {peerNarrators.map((peer) => (
                <li key={peer.id} className="flex items-center gap-2 bg-teal-50 rounded-lg px-3 py-2">
                  <Link
                    href={`/narrator/${peer.id}`}
                    className="text-sm text-teal-900 hover:text-teal-700 hover:underline flex-1 truncate"
                  >
                    {peer.name}
                  </Link>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-teal-600 bg-white border border-teal-200 px-1.5 py-0.5 rounded-full">
                      {peer.shared_count} مشترك
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Topic distribution — lazy loaded */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-bold text-green-900 mb-4">التوزيع الموضوعي للأحاديث</h2>
          <NarratorTopics narratorId={narratorId} />
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
