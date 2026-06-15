import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface ChapterGroup {
  chapter_name: string
  book_name: string
  book_id: number
  hadith_count: number
  first_hadith_id: number
  sample_text: string
}

interface HadithRow {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string | null
  chain_count: number
  judgment: string | null
}

export default async function CompanionMusnadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ chapter?: string; view?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const narId = parseInt(id)
  if (isNaN(narId)) notFound()

  const chapterFilter = sp.chapter || ''
  const view = sp.view || 'chapters'

  const [narratorRes, chaptersRes, hadithsRes, statsRes] = await Promise.all([
    pool.query<{ id: number; name: string; abb_name: string | null; death_year: string | null }>(
      `SELECT id, name, abb_name, death_year_num AS death_year FROM narrators WHERE id = $1 AND is_companion = true`,
      [narId]
    ).catch(() => ({ rows: [] })),

    // Chapter groups for this companion's hadiths
    pool.query<ChapterGroup>(
      `SELECT
         COALESCE(ht.chapter_text, 'بدون باب') AS chapter_name,
         b.title AS book_name,
         ht.book_id,
         COUNT(DISTINCT ht.main_id)::int AS hadith_count,
         MIN(ht.main_id)::int AS first_hadith_id,
         LEFT(MIN(ht.tarf), 120) AS sample_text
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE ic.narrator_id_array[1] = $1
       GROUP BY COALESCE(ht.chapter_text, 'بدون باب'), b.title, ht.book_id
       ORDER BY hadith_count DESC
       LIMIT 50`,
      [narId]
    ).catch(() => ({ rows: [] as ChapterGroup[] })),

    // Hadiths if chapter is selected
    chapterFilter ? pool.query<HadithRow>(
      `SELECT DISTINCT ON (ht.main_id)
              ht.main_id AS hadith_id,
              LEFT(ht.tarf, 300) AS hadith_text,
              b.title AS book_name,
              ht.chapter_text AS chapter_name,
              (SELECT COUNT(DISTINCT ic2.id)::int FROM isnad_chains ic2
               JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id WHERE ih2.hadith_id = ht.main_id) AS chain_count,
              (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE ic.narrator_id_array[1] = $1
         AND COALESCE(ht.chapter_text, 'بدون باب') = $2
       ORDER BY ht.main_id, ht.book_id
       LIMIT 30`,
      [narId, chapterFilter]
    ).catch(() => ({ rows: [] as HadithRow[] })) : Promise.resolve({ rows: [] as HadithRow[] }),

    pool.query<{ hadith_count: number; chain_count: number; book_count: number; chapter_count: number }>(
      `SELECT
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ht.book_id)::int AS book_count,
         COUNT(DISTINCT COALESCE(ht.chapter_text, 'بدون باب'))::int AS chapter_count
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       WHERE ic.narrator_id_array[1] = $1`,
      [narId]
    ).catch(() => ({ rows: [] })),
  ])

  const narrator = narratorRes.rows[0]
  if (!narrator) notFound()

  const chapters = chaptersRes.rows
  const hadiths = hadithsRes.rows
  const stats = statsRes.rows[0]

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-700'
    if (/ضعيف/.test(j)) return 'text-red-600'
    return 'text-gray-500'
  }

  // Group chapters by book
  const bookGroups = new Map<string, ChapterGroup[]>()
  for (const ch of chapters) {
    if (!bookGroups.has(ch.book_name)) bookGroups.set(ch.book_name, [])
    bookGroups.get(ch.book_name)!.push(ch)
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="bg-amber-900 text-white rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-amber-300 mb-1">مسند الصحابي</div>
            <h1 className="text-xl font-bold text-amber-100">
              مسند {narrator.name}
            </h1>
            {narrator.death_year && (
              <div className="text-xs text-amber-300 mt-1">ت {narrator.death_year}</div>
            )}
          </div>
          <Link href={`/narrator/${narId}`}
            className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg">
            الصفحة الكاملة ←
          </Link>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'أحاديث', value: stats.hadith_count?.toLocaleString('ar-EG') || '0' },
            { label: 'أسانيد', value: stats.chain_count?.toLocaleString('ar-EG') || '0' },
            { label: 'كتب', value: stats.book_count?.toLocaleString('ar-EG') || '0' },
            { label: 'أبواب', value: stats.chapter_count?.toLocaleString('ar-EG') || '0' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <div className="text-xl font-bold text-amber-800">{s.value}</div>
              <div className="text-xs text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chapter browser */}
      {!chapterFilter && (
        <div className="space-y-4">
          {Array.from(bookGroups.entries()).map(([bookName, bookChapters]) => (
            <div key={bookName} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-amber-50 px-4 py-2 border-b border-gray-100 flex items-center gap-2">
                <span className="font-bold text-amber-900 text-sm">{bookName}</span>
                <span className="text-xs text-gray-400">({bookChapters.reduce((a, c) => a + c.hadith_count, 0)} حديث)</span>
              </div>
              <div className="divide-y divide-gray-50">
                {bookChapters.map((ch, i) => (
                  <a key={i}
                    href={`/companions/musnad/${narId}?chapter=${encodeURIComponent(ch.chapter_name)}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-amber-900 font-medium">{ch.chapter_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">{ch.sample_text}...</div>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {ch.hadith_count} ح
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected chapter hadiths */}
      {chapterFilter && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <a href={`/companions/musnad/${narId}`}
              className="text-xs text-gray-400 hover:text-gray-600">← العودة للأبواب</a>
            <h2 className="font-bold text-green-900 text-base">{chapterFilter}</h2>
          </div>

          <div className="space-y-3">
            {hadiths.map(h => (
              <div key={h.hadith_id}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:border-amber-200 transition-colors">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs text-gray-400">{h.book_name}</span>
                  {h.chain_count > 0 && (
                    <span className="text-xs text-gray-300">{h.chain_count} سند</span>
                  )}
                  {h.judgment && (
                    <span className={`text-xs ${judgmentColor(h.judgment)}`}>
                      {h.judgment.slice(0, 40)}
                    </span>
                  )}
                  <Link href={`/hadith/${h.hadith_id}`}
                    className="text-xs text-green-700 hover:underline mr-auto">←</Link>
                </div>
                <p className="text-sm text-gray-900 leading-relaxed">
                  {h.hadith_text}
                  {h.hadith_text?.length === 300 && '...'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {chapters.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد أحاديث لهذا الصحابي في قاعدة البيانات
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/companions" className="text-green-700 hover:underline">← الصحابة</Link>
        <Link href="/companions/compare" className="text-green-700 hover:underline">← مقارنة الصحابة</Link>
        <Link href={`/narrator/${narId}/students-list`} className="text-green-700 hover:underline">← التلاميذ</Link>
      </div>
    </div>
  )
}
