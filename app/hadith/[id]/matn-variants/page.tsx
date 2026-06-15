import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface VersionRow {
  hadith_id: number
  book_name: string
  book_death: number | null
  chapter_name: string | null
  hadith_text: string
  chain_count: number
  judgment: string | null
  companion_name: string | null
}

export default async function MatnVariantsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const mainId = parseInt(id)
  if (isNaN(mainId)) notFound()

  const [mainRes, versionsRes] = await Promise.all([
    pool.query<{ id: number; text: string; book_name: string; takhrij_id: number | null }>(
      `SELECT ht.main_id AS id, ht.tarf AS text, b.title AS book_name, ht.takhrij_id
       FROM hadith_toc ht JOIN books b ON b.id = ht.book_id WHERE ht.main_id = $1`,
      [mainId]
    ).catch(() => ({ rows: [] })),

    pool.query<VersionRow>(
      `SELECT ht.main_id AS hadith_id,
              b.title AS book_name,
              b.takhrij_death AS book_death,
              ht.chapter_text AS chapter_name,
              ht.tarf AS hadith_text,
              (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
               JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count,
              (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment,
              (SELECT n.name FROM isnad_chains ic
               JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = ht.main_id
               JOIN narrators n ON n.id = ic.narrator_id_array[1]
               WHERE n.is_companion = true LIMIT 1) AS companion_name
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.takhrij_id = (SELECT takhrij_id FROM hadith_toc WHERE main_id = $1)
         AND ht.takhrij_id IS NOT NULL
       ORDER BY b.takhrij_death ASC NULLS LAST, ht.main_id
       LIMIT 15`,
      [mainId]
    ).catch(() => ({ rows: [] as VersionRow[] })),
  ])

  const main = mainRes.rows[0]
  if (!main) notFound()

  const versions = versionsRes.rows
  if (versions.length === 0) {
    return (
      <div dir="rtl">
        <h1 className="text-xl font-bold text-green-900 mb-3">تحليل المتن</h1>
        <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-800">
          هذا الحديث لا يحمل رقم تخريج — لا توجد روايات موازية للمقارنة
        </div>
        <Link href={`/hadith/${mainId}`} className="text-sm text-green-700 hover:underline mt-3 block">← العودة للحديث</Link>
      </div>
    )
  }

  // Build word frequency map to find core vs variant words
  function tokenize(text: string): string[] {
    return text.split(/[\s،,،.!?؟]/g).filter(w => w.length > 1)
  }

  const allTokenSets = versions.map(v => new Set(tokenize(v.hadith_text)))
  const allWords = new Set(versions.flatMap(v => tokenize(v.hadith_text)))

  // Words appearing in ALL versions = core
  const coreWords = new Set<string>()
  for (const word of allWords) {
    if (allTokenSets.every(s => s.has(word))) {
      coreWords.add(word)
    }
  }

  // Words appearing in MOST (>60%) versions = common
  const threshold = Math.ceil(versions.length * 0.6)
  const commonWords = new Set<string>()
  for (const word of allWords) {
    const count = allTokenSets.filter(s => s.has(word)).length
    if (count >= threshold && !coreWords.has(word)) {
      commonWords.add(word)
    }
  }

  function highlightText(text: string, versionSet: Set<string>): string {
    return tokenize(text)
      .map(word => {
        if (coreWords.has(word)) return `<span class="text-green-800 font-medium">${word}</span>`
        if (commonWords.has(word)) return `<span class="text-blue-700">${word}</span>`
        if (!allTokenSets.every(s => !s.has(word)) && !versionSet.has(word)) return word
        return `<span class="text-amber-700 underline decoration-dotted">${word}</span>`
      }).join(' ')
  }

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-700'
    if (/ضعيف/.test(j)) return 'text-red-600'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Link href={`/hadith/${mainId}`} className="text-green-700 hover:underline text-sm">← الحديث</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-500 text-sm">تحليل المتن والفروق النصية</span>
        </div>
        <h1 className="text-xl font-bold text-green-900 mb-2">تحليل الفروق النصية بين الروايات</h1>
        <p className="text-sm text-gray-500">
          {versions.length} رواية موازية — مقارنة اللفظ وبيان الزيادات والاختلافات
        </p>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4 flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-200" />
          <span className="text-gray-600">ألفاظ مشتركة في جميع الروايات (لفظ الأصل)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-200" />
          <span className="text-gray-600">ألفاظ شائعة في أغلب الروايات</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-200" />
          <span className="text-gray-600">ألفاظ منفردة أو زيادات</span>
        </div>
      </div>

      {/* Versions */}
      <div className="space-y-4">
        {versions.map(v => {
          const vSet = new Set(tokenize(v.hadith_text))
          return (
            <div key={v.hadith_id}
              className={`bg-white rounded-xl border p-4 ${v.hadith_id === mainId ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-bold text-green-900 text-sm">{v.book_name}</span>
                {v.book_death && <span className="text-xs text-gray-400">ت {v.book_death}هـ</span>}
                {v.companion_name && (
                  <span className="text-xs bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-full">
                    {v.companion_name}
                  </span>
                )}
                {v.judgment && (
                  <span className={`text-xs ${judgmentColor(v.judgment)}`}>
                    {v.judgment.slice(0, 40)}
                  </span>
                )}
                {v.hadith_id === mainId && (
                  <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">الرواية الأساسية</span>
                )}
                <div className="mr-auto flex gap-2">
                  <Link href={`/hadith/${v.hadith_id}`}
                    className="text-xs text-green-700 hover:underline">←</Link>
                </div>
              </div>
              {v.chapter_name && (
                <div className="text-xs text-gray-400 mb-1">{v.chapter_name}</div>
              )}
              <p className="text-sm leading-loose"
                dangerouslySetInnerHTML={{
                  __html: highlightText(v.hadith_text, vSet)
                }} />
            </div>
          )
        })}
      </div>

      {/* Summary stats */}
      <div className="mt-4 bg-green-50 border border-green-100 rounded-xl p-4">
        <h2 className="font-bold text-green-900 text-sm mb-2">ملخص تحليل المتن</h2>
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div>
            <div className="font-bold text-green-800 text-lg">{coreWords.size}</div>
            <div className="text-xs text-gray-500">لفظ أصلي مشترك</div>
          </div>
          <div>
            <div className="font-bold text-blue-700 text-lg">{commonWords.size}</div>
            <div className="text-xs text-gray-500">لفظ شائع</div>
          </div>
          <div>
            <div className="font-bold text-amber-700 text-lg">
              {allWords.size - coreWords.size - commonWords.size}
            </div>
            <div className="text-xs text-gray-500">لفظ منفرد/زيادة</div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {versions.length > 2
            ? 'وجود زيادات كثيرة يشير إلى الرواية بالمعنى (روايات متعددة بألفاظ مختلفة)'
            : 'قلة الروايات تحدُّ من دقة التحليل — استخدم المقارنة للتأكد من اللفظ الأصلي'}
        </p>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/hadith/${mainId}`} className="text-green-700 hover:underline">← الحديث</Link>
        <Link href={`/hadith/${mainId}/across-books`} className="text-green-700 hover:underline">← مقارنة المصادر</Link>
        <Link href={`/hadith/${mainId}/research-report`} className="text-green-700 hover:underline">← التقرير البحثي</Link>
      </div>
    </div>
  )
}
