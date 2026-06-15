'use client'
import { useState, useCallback } from 'react'
import { Suspense } from 'react'
import Link from 'next/link'

interface Scholar {
  scientist_id: number
  name: string
  death_year: string | null
  total_judgments: number
}

interface CompareResult {
  hadith_id: number
  tarf: string | null
  book_title: string
  a_text: string
  b_text: string
  a_grade: string | null
  b_grade: string | null
}

interface Stats {
  agree: number
  both_sahih: number
  both_hasan: number
  both_daif: number
  a_sahih_b_daif: number
  b_sahih_a_daif: number
  a_sahih_b_hasan: number
  other_disagree: number
  total_shared: number
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function gradeClass(g: string | null) {
  if (g === 'صحيح') return 'bg-green-100 text-green-700 border-green-200'
  if (g === 'حسن') return 'bg-amber-100 text-amber-700 border-amber-200'
  if (g === 'ضعيف') return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-500 border-gray-200'
}

function ScholarSearch({
  label,
  onSelect,
  selected,
}: {
  label: string
  onSelect: (s: Scholar | null) => void
  selected: Scholar | null
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Scholar[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback((term: string) => {
    setQ(term)
    if (term.trim().length < 2) { setResults([]); return }
    setLoading(true)
    fetch(`/api/scholars?q=${encodeURIComponent(term)}`)
      .then(r => r.json())
      .then((data: Scholar[]) => setResults(data.slice(0, 8)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (selected) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="font-semibold text-green-900 text-sm">{selected.name}</div>
          <div className="text-xs text-gray-500">
            {selected.death_year && `ت ${selected.death_year} — `}
            {selected.total_judgments.toLocaleString('ar-EG')} حكم
          </div>
        </div>
        <button onClick={() => { onSelect(null); setQ(''); setResults([]) }}
          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded border border-red-200 bg-white">
          تغيير
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <label className="text-xs font-semibold text-gray-600 block mb-1">{label}</label>
      <input
        type="text"
        value={q}
        onChange={e => search(e.target.value)}
        placeholder="ابحث باسم المحدث..."
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-right focus:outline-none focus:border-green-400 bg-white"
        dir="rtl"
      />
      {loading && <div className="text-xs text-gray-400 mt-1">جاري البحث...</div>}
      {results.length > 0 && !loading && (
        <div className="absolute top-full right-0 left-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
          {results.map(s => (
            <button key={s.scientist_id} onClick={() => { onSelect(s); setResults([]) }}
              className="w-full text-right px-4 py-2.5 hover:bg-green-50 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0">
              <span className="text-sm text-green-900 font-medium">{s.name}</span>
              <span className="text-xs text-gray-400 shrink-0">
                {s.death_year ? `ت ${s.death_year}` : ''} ({s.total_judgments} حكم)
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CompareView() {
  const [scholarA, setScholarA] = useState<Scholar | null>(null)
  const [scholarB, setScholarB] = useState<Scholar | null>(null)
  const [results, setResults] = useState<CompareResult[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [mode, setMode] = useState<'disagree' | 'agree' | 'all'>('disagree')
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 20

  const compare = useCallback(async (pg: number, m: string) => {
    if (!scholarA || !scholarB) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        a: String(scholarA.scientist_id),
        b: String(scholarB.scientist_id),
        mode: m,
        page: String(pg),
      })
      const res = await fetch(`/api/scholars/compare?${params}`)
      const data = await res.json()
      setResults(data.results || [])
      setStats(data.stats || null)
      setTotal(data.total || 0)
      setPage(pg)
    } finally {
      setLoading(false)
    }
  }, [scholarA, scholarB])

  function handleMode(m: typeof mode) {
    setMode(m)
    compare(1, m)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مقارنة أحكام المحدثين</h1>
        <p className="text-sm text-gray-500">
          اختر محدثَين واعرض الأحاديث التي اشتركا في الحكم عليها — توافقاً أو خلافاً
        </p>
      </div>

      {/* Scholar pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <ScholarSearch label="المحدث الأول" onSelect={setScholarA} selected={scholarA} />
        <ScholarSearch label="المحدث الثاني" onSelect={setScholarB} selected={scholarB} />
      </div>

      {scholarA && scholarB && (
        <button
          onClick={() => compare(1, mode)}
          className="w-full py-3 rounded-xl bg-green-800 text-white font-semibold hover:bg-green-700 transition-colors mb-5 text-sm"
        >
          مقارنة الأحكام
        </button>
      )}

      {/* Stats summary */}
      {stats && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
          <h2 className="font-bold text-green-900 mb-3 text-sm">ملخص المقارنة</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'حكموا عليه معاً', val: stats.total_shared, color: 'text-green-900' },
              { label: 'تطابق الحكم', val: stats.agree, color: 'text-green-700' },
              { label: 'اختلاف الحكم', val: stats.total_shared - stats.agree, color: 'text-red-600' },
              { label: 'نسبة التوافق', val: stats.total_shared ? Math.round((stats.agree / stats.total_shared) * 100) + '%' : '—', color: 'text-blue-700' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <div className={`text-xl font-bold ${item.color}`}>{typeof item.val === 'number' ? item.val.toLocaleString('ar-EG') : item.val}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
          {/* Grade agreement breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {[
              { label: 'كلاهما صحيح', val: stats.both_sahih, cls: 'bg-green-50 text-green-800' },
              { label: 'كلاهما حسن', val: stats.both_hasan, cls: 'bg-amber-50 text-amber-800' },
              { label: 'كلاهما ضعيف', val: stats.both_daif, cls: 'bg-red-50 text-red-700' },
              { label: `${scholarA?.name?.split(' ')[0]} صحيح — ${scholarB?.name?.split(' ')[0]} ضعيف`, val: stats.a_sahih_b_daif, cls: 'bg-orange-50 text-orange-800' },
              { label: `${scholarB?.name?.split(' ')[0]} صحيح — ${scholarA?.name?.split(' ')[0]} ضعيف`, val: stats.b_sahih_a_daif, cls: 'bg-orange-50 text-orange-800' },
              { label: 'خلاف آخر', val: stats.other_disagree, cls: 'bg-gray-50 text-gray-700' },
            ].map(item => (
              <div key={item.label} className={`rounded-lg p-2 ${item.cls}`}>
                <div className="font-bold">{item.val.toLocaleString('ar-EG')}</div>
                <div className="text-xs opacity-80 leading-tight mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mode filter */}
      {stats && (
        <div className="flex items-center gap-2 mb-4">
          {([
            { key: 'disagree', label: 'الخلاف فقط' },
            { key: 'agree', label: 'التوافق فقط' },
            { key: 'all', label: 'الكل' },
          ] as const).map(m => (
            <button key={m.key} onClick={() => handleMode(m.key)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                mode === m.key ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {m.label}
            </button>
          ))}
          <span className="text-xs text-gray-400 mr-auto">{total.toLocaleString('ar-EG')} حديث</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
          جاري المقارنة...
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="space-y-3">
          {results.map(r => (
            <div key={r.hadith_id} className={`bg-white rounded-xl border p-4 ${r.a_grade !== r.b_grade ? 'border-orange-200' : 'border-green-100'}`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Link href={`/hadith/${r.hadith_id}`}
                  className="text-xs text-blue-600 hover:underline font-mono shrink-0">
                  #{r.hadith_id}
                </Link>
                <span className="text-xs text-green-700 font-medium">{r.book_title}</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed mb-3 line-clamp-2">
                {stripTags(r.tarf || '')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className={`rounded-lg p-2.5 border ${gradeClass(r.a_grade)}`}>
                  <div className="text-xs font-semibold mb-1">{scholarA?.name}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${gradeClass(r.a_grade)}`}>
                    {r.a_grade || 'غير محدد'}
                  </span>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed line-clamp-2">{r.a_text}</p>
                </div>
                <div className={`rounded-lg p-2.5 border ${gradeClass(r.b_grade)}`}>
                  <div className="text-xs font-semibold mb-1">{scholarB?.name}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${gradeClass(r.b_grade)}`}>
                    {r.b_grade || 'غير محدد'}
                  </span>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed line-clamp-2">{r.b_text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {page > 1 && (
            <button onClick={() => compare(page - 1, mode)}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              السابق
            </button>
          )}
          <span className="text-sm text-gray-500 px-3">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <button onClick={() => compare(page + 1, mode)}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              التالي
            </button>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars" className="text-green-700 hover:underline">← المحدثون</Link>
        <Link href="/scholars/disagreements" className="text-green-700 hover:underline">← خلاف المحدثين</Link>
      </div>
    </div>
  )
}

export default function ScholarComparePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">جاري التحميل...</div>}>
      <CompareView />
    </Suspense>
  )
}
