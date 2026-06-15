import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface ChainNarrator {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
  death_year: string | null
}

interface ChainRow {
  chain_id: number
  narrator_ids: number[]
  narrator_names: string[]
  narrator_grades: (string | null)[]
  narrator_companions: boolean[]
  narrator_deaths: (string | null)[]
}

interface ParallelRow {
  hadith_id: number
  book_name: string
  book_death: number | null
  hadith_text: string
  chain_count: number
}

interface JudgmentRow {
  judgment_text: string
  scientist_name: string
}

export default async function ResearchReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const mainId = parseInt(id)
  if (isNaN(mainId)) notFound()

  const [hadithRes, chainsRes, judgmentsRes, parallelRes, narratorCritRes] = await Promise.all([
    pool.query<{
      main_id: number; book_name: string; book_id: number; chapter_name: string | null;
      hadith_text: string; book_death: number | null;
      author_name: string | null
    }>(
      `SELECT ht.main_id, b.title AS book_name, ht.book_id, ht.chapter_text AS chapter_name,
              ht.tarf AS hadith_text, b.takhrij_death AS book_death,
              b.author_id::text AS author_name
       FROM hadith_toc ht JOIN books b ON b.id = ht.book_id
       WHERE ht.main_id = $1`,
      [mainId]
    ).catch(() => ({ rows: [] })),

    pool.query<ChainRow>(
      `SELECT ic.id AS chain_id,
              ic.narrator_id_array AS narrator_ids,
              ARRAY(SELECT n.name FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
                    JOIN narrators n ON n.id = nid ORDER BY ord) AS narrator_names,
              ARRAY(SELECT n.martaba_ibn_hajar FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
                    JOIN narrators n ON n.id = nid ORDER BY ord) AS narrator_grades,
              ARRAY(SELECT n.is_companion FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
                    JOIN narrators n ON n.id = nid ORDER BY ord) AS narrator_companions,
              ARRAY(SELECT n.death_year_num FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
                    JOIN narrators n ON n.id = nid ORDER BY ord) AS narrator_deaths
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       WHERE ih.hadith_id = $1
       LIMIT 8`,
      [mainId]
    ).catch(() => ({ rows: [] as ChainRow[] })),

    pool.query<JudgmentRow>(
      `SELECT j.say_text AS judgment_text, n.name AS scientist_name
       FROM hadith_judgments j
       LEFT JOIN narrators n ON n.id = j.scientist_id
       WHERE j.hadith_id = $1 ORDER BY j.hadith_id LIMIT 10`,
      [mainId]
    ).catch(() => ({ rows: [] })),

    pool.query<ParallelRow>(
      `SELECT DISTINCT ON (ht.book_id)
              ht.main_id AS hadith_id, b.title AS book_name, b.takhrij_death AS book_death,
              LEFT(ht.tarf, 200) AS hadith_text,
              (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
               JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count
       FROM takhrij t
       JOIN hadith_toc ht ON ht.main_id = t.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE t.group_id = (SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1)
         AND ht.main_id != $1
       ORDER BY ht.book_id, b.takhrij_death ASC NULLS LAST
       LIMIT 12`,
      [mainId]
    ).catch(() => ({ rows: [] as ParallelRow[] })),

    // Get critics for narrators in chains
    pool.query<{ narrator_id: number; narrator_name: string; say_text: string; scientist: string }>(
      `SELECT DISTINCT nc.narrator_id, n.name AS narrator_name,
              nc.say_text, nc.scientist_name AS scientist
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = $1
       JOIN narrators n ON n.id = ANY(ic.narrator_id_array)
       JOIN narrator_criticism nc ON nc.narrator_id = n.id
         AND nc.say_text ~* 'ضعيف|مجهول|متروك|منكر|كذاب'
       LIMIT 15`,
      [mainId]
    ).catch(() => ({ rows: [] })),
  ])

  const hadith = hadithRes.rows[0]
  if (!hadith) notFound()

  const chains = chainsRes.rows
  const judgments = judgmentsRes.rows
  const parallels = parallelRes.rows
  const concerns = narratorCritRes.rows

  function gradeColor(g: string | null, isComp: boolean): string {
    if (isComp) return 'text-amber-700 bg-amber-50'
    if (!g) return 'text-gray-500 bg-gray-50'
    if (/ثقة ثبت/.test(g)) return 'text-green-800 bg-green-100'
    if (/ثقة/.test(g)) return 'text-green-700 bg-green-50'
    if (/صدوق/.test(g)) return 'text-blue-700 bg-blue-50'
    if (/ضعيف|مجهول/.test(g)) return 'text-red-700 bg-red-50'
    return 'text-gray-600 bg-gray-50'
  }

  const gradeEmoji: Record<string, string> = {
    sahih: '✓✓', hasan: '✓', daif: '✗', mawduu: '✗✗'
  }

  function classifyJudgment(text: string): string {
    if (/صحيح/.test(text)) return 'text-green-700 bg-green-50 border-green-200'
    if (/حسن/.test(text)) return 'text-blue-700 bg-blue-50 border-blue-200'
    if (/ضعيف/.test(text)) return 'text-red-700 bg-red-50 border-red-200'
    if (/موضوع/.test(text)) return 'text-red-900 bg-red-100 border-red-300'
    return 'text-gray-600 bg-gray-50 border-gray-200'
  }

  return (
    <div dir="rtl" className="max-w-4xl">
      {/* Report header */}
      <div className="bg-green-900 text-white rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-green-300 mb-1">التقرير البحثي للحديث #{mainId.toLocaleString('ar-EG')}</div>
            <h1 className="text-lg font-bold text-amber-200 mb-1">{hadith.book_name}</h1>
            {hadith.chapter_name && (
              <div className="text-xs text-green-200">{hadith.chapter_name}</div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href={`/hadith/${mainId}`}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors">
              صفحة الحديث
            </Link>
            <Link href={`/hadith/${mainId}/isnad-ranking`}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors">
              ترتيب الأسانيد
            </Link>
          </div>
        </div>
      </div>

      {/* 1. Full text */}
      <section className="mb-5">
        <h2 className="text-base font-bold text-green-900 mb-2 flex items-center gap-2">
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">أولاً</span>
          نص الحديث
        </h2>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-base text-gray-900 leading-loose">{hadith.hadith_text}</p>
        </div>
      </section>

      {/* 2. Scholarly judgments */}
      {judgments.length > 0 && (
        <section className="mb-5">
          <h2 className="text-base font-bold text-green-900 mb-2 flex items-center gap-2">
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ثانياً</span>
            أحكام العلماء ({judgments.length})
          </h2>
          <div className="space-y-2">
            {judgments.map((j, i) => (
              <div key={i} className={`rounded-xl border px-4 py-3 text-sm ${classifyJudgment(j.judgment_text)}`}>
                <span className="font-bold ml-1">{j.scientist_name}:</span>
                {j.judgment_text}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Chains analysis */}
      {chains.length > 0 && (
        <section className="mb-5">
          <h2 className="text-base font-bold text-green-900 mb-2 flex items-center gap-2">
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ثالثاً</span>
            الأسانيد ({chains.length})
          </h2>
          <div className="space-y-3">
            {chains.map((chain, ci) => (
              <div key={chain.chain_id}
                className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="text-xs text-gray-400 mb-2">السند {(ci + 1).toLocaleString('ar-EG')}</div>
                <div className="flex flex-wrap gap-1 items-center mb-2">
                  {chain.narrator_names.map((name, ni) => (
                    <div key={ni} className="flex items-center gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${gradeColor(chain.narrator_grades[ni], chain.narrator_companions[ni])}`}>
                        <Link href={`/narrator/${chain.narrator_ids[ni]}`}
                          className="hover:underline">
                          {name}
                        </Link>
                        {chain.narrator_grades[ni] && !chain.narrator_companions[ni] && (
                          <span className="mr-1 opacity-70">({chain.narrator_grades[ni]})</span>
                        )}
                        {chain.narrator_companions[ni] && (
                          <span className="mr-1 opacity-70">(صح)</span>
                        )}
                      </span>
                      {ni < chain.narrator_names.length - 1 && (
                        <span className="text-gray-300 text-xs">←</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Narrator concerns */}
      {concerns.length > 0 && (
        <section className="mb-5">
          <h2 className="text-base font-bold text-green-900 mb-2 flex items-center gap-2">
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">رابعاً</span>
            ملاحظات على الرواة ({concerns.length})
          </h2>
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-2">
            {concerns.map((c, i) => (
              <div key={i} className="text-sm">
                <Link href={`/narrator/${c.narrator_id}`}
                  className="font-bold text-red-900 hover:underline ml-2">
                  {c.narrator_name}
                </Link>
                <span className="text-red-700">
                  {c.scientist}: {c.say_text}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Parallel versions */}
      {parallels.length > 0 && (
        <section className="mb-5">
          <h2 className="text-base font-bold text-green-900 mb-2 flex items-center gap-2">
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">خامساً</span>
            روايات موازية ({parallels.length} كتاب)
          </h2>
          <div className="space-y-2">
            {parallels.map(p => (
              <div key={p.hadith_id}
                className="bg-white rounded-xl border border-gray-100 p-3 hover:border-green-200 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-green-900 text-sm">{p.book_name}</span>
                  {p.book_death && <span className="text-xs text-gray-400">ت {p.book_death}هـ</span>}
                  {p.chain_count > 0 && <span className="text-xs text-gray-400">{p.chain_count} سند</span>}
                  <Link href={`/hadith/${p.hadith_id}`}
                    className="text-xs text-green-700 hover:underline mr-auto">رابط ←</Link>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{p.hadith_text}...</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Citation note */}
      <section className="mb-5">
        <h2 className="text-base font-bold text-green-900 mb-2 flex items-center gap-2">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">سادساً</span>
          مراجع الاستشهاد
        </h2>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 font-mono text-xs text-gray-700 space-y-1">
          <p>المصدر: {hadith.book_name} — حديث رقم {mainId.toLocaleString('ar-EG')}</p>
          {hadith.chapter_name && <p>الباب: {hadith.chapter_name}</p>}
          <p>قاعدة بيانات جامع خادم الحرمين الشريفين — رابط الحديث: /hadith/{mainId}</p>
          {judgments.length > 0 && (
            <p>الحكم: {judgments[0].scientist_name}: {judgments[0].judgment_text}</p>
          )}
        </div>
      </section>

      <div className="flex items-center gap-3 flex-wrap text-sm mt-4">
        <Link href={`/hadith/${mainId}`} className="text-green-700 hover:underline">← صفحة الحديث</Link>
        <Link href={`/hadith/${mainId}/across-books`} className="text-green-700 hover:underline">← مقارنة المصادر</Link>
        <Link href={`/hadith/${mainId}/pivot`} className="text-green-700 hover:underline">← تحليل المدار</Link>
        <Link href={`/hadith/${mainId}/isnad-ranking`} className="text-green-700 hover:underline">← ترتيب الأسانيد</Link>
      </div>
    </div>
  )
}
