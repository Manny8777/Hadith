'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'

interface ParallelHadith {
  main_id: number
  book_title: string
  takhrij_author: string | null
  tarf: string | null
  content: string | null
  grade_hint: string | null
}

interface HadithData {
  main_id: number
  book_title: string
  tarf: string | null
  content: string | null
  grade_hint?: string | null
}

type DiffToken =
  | { type: 'common'; word: string }
  | { type: 'del'; word: string }
  | { type: 'ins'; word: string }

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function wordDiff(textA: string, textB: string): { tokensA: DiffToken[]; tokensB: DiffToken[] } {
  const wordsA = textA.split(/\s+/).filter(Boolean)
  const wordsB = textB.split(/\s+/).filter(Boolean)
  const m = wordsA.length
  const n = wordsB.length

  // LCS table (cap at 300 words each to stay fast)
  const limitA = Math.min(m, 300)
  const limitB = Math.min(n, 300)
  const dp: number[][] = Array.from({ length: limitA + 1 }, () => new Array(limitB + 1).fill(0))
  for (let i = 1; i <= limitA; i++) {
    for (let j = 1; j <= limitB; j++) {
      dp[i][j] = wordsA[i - 1] === wordsB[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Backtrack
  const tokensA: DiffToken[] = []
  const tokensB: DiffToken[] = []
  let i = limitA, j = limitB
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      tokensA.unshift({ type: 'common', word: wordsA[i - 1] })
      tokensB.unshift({ type: 'common', word: wordsB[j - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tokensB.unshift({ type: 'ins', word: wordsB[j - 1] })
      j--
    } else {
      tokensA.unshift({ type: 'del', word: wordsA[i - 1] })
      i--
    }
  }
  // Append any remaining words beyond limit
  for (let k = limitA; k < m; k++) tokensA.push({ type: 'common', word: wordsA[k] })
  for (let k = limitB; k < n; k++) tokensB.push({ type: 'common', word: wordsB[k] })

  return { tokensA, tokensB }
}

function TextWithDiff({ tokens }: { tokens: DiffToken[] }) {
  return (
    <p className="text-gray-800 text-sm leading-loose" dir="rtl">
      {tokens.map((t, i) =>
        t.type === 'common' ? (
          <span key={i}>{t.word} </span>
        ) : t.type === 'del' ? (
          <mark key={i} className="bg-red-100 text-red-700 rounded px-0.5 line-through mx-0.5 not-italic">
            {t.word}
          </mark>
        ) : (
          <mark key={i} className="bg-green-100 text-green-700 rounded px-0.5 mx-0.5 not-italic">
            {t.word}
          </mark>
        )
      )}
    </p>
  )
}

function MatnCompareInner() {
  const searchParams = useSearchParams()
  const initialId = searchParams.get('id') || ''
  const [idInput, setIdInput] = useState(initialId)
  const [hadithA, setHadithA] = useState<HadithData | null>(null)
  const [parallels, setParallels] = useState<ParallelHadith[]>([])
  const [hadithB, setHadithB] = useState<HadithData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [compared, setCompared] = useState(false)

  useEffect(() => {
    if (initialId) { loadHadith() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadHadith() {
    const id = parseInt(idInput.trim())
    if (isNaN(id) || id < 1) { setError('أدخل رقم صحيح لمعرف الحديث'); return }
    setLoading(true)
    setError('')
    setHadithA(null)
    setHadithB(null)
    setParallels([])
    setCompared(false)
    try {
      const [hadithRes, parallelRes] = await Promise.all([
        fetch(`/api/hadith/${id}`).then(r => r.json()),
        fetch(`/api/hadith/${id}/parallel`).then(r => r.json()),
      ])
      if (hadithRes.error) { setError('لم يُعثر على الحديث'); return }
      const h = hadithRes.hadith
      setHadithA({
        main_id: h.main_id,
        book_title: h.book_title,
        tarf: h.tarf,
        content: h.content,
        grade_hint: null,
      })
      setParallels(parallelRes.parallels || [])
    } catch {
      setError('خطأ في الاتصال')
    } finally {
      setLoading(false)
    }
  }

  function selectParallel(p: ParallelHadith) {
    setHadithB({
      main_id: p.main_id,
      book_title: p.book_title,
      tarf: p.tarf,
      content: p.content,
      grade_hint: p.grade_hint,
    })
    setCompared(true)
  }

  const diff = compared && hadithA && hadithB
    ? wordDiff(
        stripTags(hadithA.content || hadithA.tarf || ''),
        stripTags(hadithB.content || hadithB.tarf || '')
      )
    : null

  const similarityPct = diff
    ? Math.round(
        (diff.tokensA.filter(t => t.type === 'common').length /
          Math.max(1, diff.tokensA.length)) * 100
      )
    : null

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مقارنة متون الأحاديث المتوازية</h1>
        <p className="text-sm text-gray-500">
          أدخل معرف حديث لعرض رواياته الموازية ثم اختر روايةً للمقارنة — تُظهر الأداة التطابق والاختلاف بين النصَّين على مستوى الكلمة
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex gap-3">
          <input
            type="number"
            value={idInput}
            onChange={e => { setIdInput(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && loadHadith()}
            placeholder="معرف الحديث (main_id)..."
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-300"
            dir="ltr"
          />
          <button
            onClick={loadHadith}
            disabled={loading}
            className="px-5 py-2.5 bg-green-700 text-white text-sm font-medium rounded-xl hover:bg-green-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'تحميل...' : 'تحميل'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <p className="text-xs text-gray-400 mt-2">
          يمكنك الوصول لمعرف الحديث من شريط المتصفح عند زيارة صفحة أي حديث (الرقم في نهاية الرابط)
        </p>
      </div>

      {hadithA && (
        <div className="mb-4 bg-white rounded-xl border border-green-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">الحديث الأساسي</span>
            <Link href={`/hadith/${hadithA.main_id}`} className="text-sm text-green-800 font-semibold hover:underline">{hadithA.book_title}</Link>
            <span className="text-xs text-gray-400 font-mono">#{hadithA.main_id}</span>
          </div>
          <p className="text-sm text-gray-700 leading-loose">
            {stripTags(hadithA.content || hadithA.tarf || '').slice(0, 300)}
          </p>
        </div>
      )}

      {parallels.length > 0 && !compared && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            الروايات الموازية ({parallels.length}) — اختر رواية للمقارنة:
          </h2>
          <div className="grid gap-2">
            {parallels.map(p => (
              <button
                key={p.main_id}
                onClick={() => selectParallel(p)}
                className="text-right bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-amber-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-amber-800">{p.book_title}</span>
                  {p.takhrij_author && <span className="text-xs text-gray-400">{p.takhrij_author}</span>}
                  {p.grade_hint && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      p.grade_hint === 'صحيح' ? 'bg-green-100 text-green-700' :
                      p.grade_hint === 'حسن' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-600'
                    }`}>{p.grade_hint}</span>
                  )}
                  <span className="text-xs text-gray-300 font-mono mr-auto">#{p.main_id}</span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-1 group-hover:text-gray-700">
                  {stripTags(p.tarf || '').slice(0, 120)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {parallels.length === 0 && hadithA && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 mb-4">
          لا توجد روايات موازية موثقة لهذا الحديث في قاعدة التخريج
        </div>
      )}

      {diff && hadithA && hadithB && (
        <div>
          {/* Change parallel */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => { setCompared(false); setHadithB(null) }}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg bg-white"
            >
              ← اختيار رواية أخرى
            </button>
            {similarityPct !== null && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-24 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      similarityPct >= 80 ? 'bg-green-500' :
                      similarityPct >= 60 ? 'bg-amber-400' :
                      'bg-red-400'
                    }`}
                    style={{ width: `${similarityPct}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700">
                  {similarityPct}% تطابق
                </span>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs mb-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <mark className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded line-through not-italic">كلمة</mark>
              في الأول فقط
            </span>
            <span className="flex items-center gap-1.5">
              <mark className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded not-italic">كلمة</mark>
              في الثاني فقط
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">كلمة</span>
              مشترك
            </span>
          </div>

          {/* Side by side comparison */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-green-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">الأول</span>
                <Link href={`/hadith/${hadithA.main_id}`} className="text-sm font-semibold text-green-900 hover:underline">{hadithA.book_title}</Link>
              </div>
              <TextWithDiff tokens={diff.tokensA} />
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">الثاني</span>
                <Link href={`/hadith/${hadithB.main_id}`} className="text-sm font-semibold text-amber-900 hover:underline">{hadithB.book_title}</Link>
              </div>
              <TextWithDiff tokens={diff.tokensB} />
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 bg-gray-50 rounded-xl border border-gray-100 p-4 grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="font-bold text-green-600">{diff.tokensA.filter(t => t.type === 'common').length}</div>
              <div className="text-xs text-gray-500">كلمة مشتركة</div>
            </div>
            <div>
              <div className="font-bold text-red-500">{diff.tokensA.filter(t => t.type === 'del').length}</div>
              <div className="text-xs text-gray-500">في الأول فقط</div>
            </div>
            <div>
              <div className="font-bold text-green-500">{diff.tokensB.filter(t => t.type === 'ins').length}</div>
              <div className="text-xs text-gray-500">في الثاني فقط</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MatnCompareClient() {
  return (
    <Suspense fallback={<div className="text-gray-400 py-8 text-center text-sm">تحميل...</div>}>
      <MatnCompareInner />
    </Suspense>
  )
}
