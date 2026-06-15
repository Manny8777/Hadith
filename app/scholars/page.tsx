'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Suspense } from 'react'

interface Scholar {
  scientist_id: number
  name: string
  death_year: number | null
  total_judgments: number
  sahih_count: number
  hasan_count: number
  daif_count: number
}

function gradeBar(val: number, total: number, color: string, label: string) {
  const pct = total > 0 ? Math.round((val / total) * 100) : 0
  return pct > 0 ? (
    <span className={`text-xs ${color}`}>{label} {val.toLocaleString('ar-EG')} ({pct}%)</span>
  ) : null
}

function ScholarsList() {
  const [scholars, setScholars] = useState<Scholar[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/scholars')
      .then(r => r.json())
      .then(data => { setScholars(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = scholars.filter(s =>
    !search.trim() || s.name?.includes(search.trim())
  )

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-amber-200 hover:text-white text-sm">← الرئيسية</Link>
          <h1 className="text-lg font-bold text-amber-100">أحكام المحدثين على الأحاديث</h1>
          <Link href="/search" className="text-amber-200 hover:text-white text-sm">البحث</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-green-900 text-xl mb-2">أقوال العلماء في الأحاديث</h2>
          <p className="text-sm text-gray-500 mb-3 leading-relaxed">
            تصفح أحكام المحدثين وأئمة الجرح والتعديل على الأحاديث — من تصحيح وتحسين وتضعيف — مع إمكانية تصفية أحكام كل عالم بحسب الدرجة
          </p>
          <div className="flex flex-wrap gap-3 mb-5">
            <Link
              href="/scholars/disagreements"
              className="inline-flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-sm px-4 py-2 rounded-xl hover:bg-rose-100 transition-colors"
            >
              <span className="font-semibold">مسائل خلاف المحدثين</span>
              <span className="text-xs text-rose-600">← صحيح عند قوم، ضعيف عند آخرين</span>
            </Link>
            <Link
              href="/scholars/parallel-routes"
              className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-2 rounded-xl hover:bg-blue-100 transition-colors"
            >
              <span className="font-semibold">أحاديث ضعيفة لها شواهد</span>
              <span className="text-xs text-blue-600">← طرق وشواهد من قاعدة التخريج</span>
            </Link>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث باسم العالم..."
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
          />
          {loading ? (
            <div className="text-center text-gray-400 py-8">تحميل...</div>
          ) : (
            <div className="grid gap-3">
              {filtered.map(s => {
                const j = s.total_judgments
                const sahihPct = j > 0 ? (s.sahih_count / j) * 100 : 0
                const hasanPct = j > 0 ? (s.hasan_count / j) * 100 : 0
                const daifPct  = j > 0 ? (s.daif_count  / j) * 100 : 0

                return (
                  <Link
                    key={s.scientist_id}
                    href={`/scholars/${s.scientist_id}`}
                    className="block bg-gray-50 rounded-xl border border-gray-100 px-5 py-4 hover:border-green-200 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h3 className="font-bold text-green-900 group-hover:text-green-700 text-base">{s.name}</h3>
                        {s.death_year && (
                          <p className="text-xs text-gray-400 mt-0.5">ت {s.death_year} هـ</p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-bold text-green-700 bg-green-50 border border-green-100 px-3 py-1 rounded-full">
                        {j.toLocaleString('ar-EG')} حكم
                      </span>
                    </div>
                    {/* Grade breakdown */}
                    <div className="flex items-center gap-4 text-xs flex-wrap">
                      {s.sahih_count > 0 && (
                        <span className="text-green-700 font-medium">
                          صحيح: {s.sahih_count.toLocaleString('ar-EG')} ({Math.round(sahihPct)}%)
                        </span>
                      )}
                      {s.hasan_count > 0 && (
                        <span className="text-amber-700 font-medium">
                          حسن: {s.hasan_count.toLocaleString('ar-EG')} ({Math.round(hasanPct)}%)
                        </span>
                      )}
                      {s.daif_count > 0 && (
                        <span className="text-red-600 font-medium">
                          ضعيف: {s.daif_count.toLocaleString('ar-EG')} ({Math.round(daifPct)}%)
                        </span>
                      )}
                    </div>
                    {/* Visual grade bar */}
                    {j > 0 && (
                      <div className="mt-2 flex rounded-full overflow-hidden h-1.5 bg-gray-200">
                        {sahihPct > 0 && <div className="bg-green-500 h-1.5" style={{ width: `${sahihPct}%` }} />}
                        {hasanPct > 0 && <div className="bg-amber-400 h-1.5" style={{ width: `${hasanPct}%` }} />}
                        {daifPct  > 0 && <div className="bg-red-400 h-1.5"  style={{ width: `${daifPct}%`  }} />}
                      </div>
                    )}
                  </Link>
                )
              })}
              {filtered.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  {search ? 'لا نتائج لهذا البحث' : 'لا يوجد علماء'}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function ScholarsPage() {
  return (
    <Suspense>
      <ScholarsList />
    </Suspense>
  )
}
