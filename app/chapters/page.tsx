'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Suspense } from 'react'

interface ChapterResult {
  chapter_text: string
  book_id: number
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  hadith_count: number
  section_id: number
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function ChaptersInner() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ChapterResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const doSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) return
    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/chapters?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json()
      setResults(data.results || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    doSearch(q)
  }

  // Group by chapter_text to show which books share the same chapter
  const grouped: Record<string, ChapterResult[]> = {}
  for (const r of results) {
    const key = stripTags(r.chapter_text).trim()
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(r)
  }
  const groupedEntries = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">بحث في الأبواب والفصول</h1>
        <p className="text-sm text-gray-500">
          ابحث عن عنوان باب في جميع الكتب — يُظهر الكتب التي تتشارك نفس الباب أو باباً مشابهاً،
          مفيد لمقارنة منهج التبويب بين المحدثين
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ابحث عن عنوان باب... مثال: باب الصيام، فضل الجمعة، الإيمان"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-300"
            dir="rtl"
          />
          <button
            type="submit"
            disabled={loading || q.trim().length < 2}
            className="px-5 py-3 bg-green-700 text-white text-sm font-medium rounded-xl hover:bg-green-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'بحث...' : 'بحث'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-400">
          <span>أمثلة:</span>
          {['الوضوء', 'الجمعة', 'الزكاة', 'البيع', 'النكاح', 'الجهاد'].map(ex => (
            <button
              key={ex}
              type="button"
              onClick={() => { setQ(ex); doSearch(ex) }}
              className="text-green-600 hover:underline"
            >
              {ex}
            </button>
          ))}
        </div>
      </form>

      {searched && !loading && (
        <div className="mb-4 text-sm text-gray-500">
          {results.length > 0
            ? `${results.length} نتيجة في ${groupedEntries.length} عنوان باب مختلف`
            : 'لا توجد نتائج — جرب مصطلحاً آخر'}
        </div>
      )}

      {groupedEntries.map(([chapterText, books]) => (
        <div key={chapterText} className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
          <div className="bg-green-50 border-b border-green-100 px-5 py-3 flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-green-900 text-base leading-snug flex-1">
              {chapterText}
            </h2>
            <span className="text-xs text-green-700 bg-green-100 border border-green-200 px-2 py-1 rounded-full font-medium shrink-0">
              في {books.length} كتاب
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {books.map(b => (
              <Link
                key={`${b.book_id}-${b.section_id}`}
                href={`/books/${b.book_id}?section=${b.section_id}`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-green-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-green-800 group-hover:underline">{b.book_title}</span>
                  {(b.takhrij_author || b.takhrij_death) && (
                    <span className="text-xs text-gray-400 mr-2">
                      {b.takhrij_author}{b.takhrij_death ? ` (ت.${b.takhrij_death})` : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {b.hadith_count > 0 && (
                    <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                      {b.hadith_count.toLocaleString('ar-EG')} ح
                    </span>
                  )}
                  <span className="text-gray-300 group-hover:text-green-500">←</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ChaptersPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 py-8 text-center">تحميل...</div>}>
      <ChaptersInner />
    </Suspense>
  )
}
