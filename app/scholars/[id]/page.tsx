'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import HadithNumber from '@/app/components/HadithNumber'

interface Judgment {
  hadith_id: number
  say_text: string
  tarf: string | null
  book_title: string
  part_num: number
  page_num: number
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_class: 'صحيح' | 'حسن' | 'ضعيف' | null
}

interface Summary { total: number; sahih: number; hasan: number; daif: number }
interface Scientist { id: number; name: string; death_year: string | null; martaba_ibn_hajar: string | null }

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function ScholarDetail() {
  const { id } = useParams<{ id: string }>()
  const [scientist, setScientist] = useState<Scientist | null>(null)
  const [judgments, setJudgments] = useState<Judgment[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [grade, setGrade] = useState('')
  const [loading, setLoading] = useState(true)
  const limit = 30

  const fetchData = useCallback(async (pg: number, gr: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pg) })
      if (gr) params.set('grade', gr)
      const res = await fetch(`/api/scholars/${id}?${params}`)
      const data = await res.json()
      if (data.error) return
      setScientist(data.scientist)
      setJudgments(data.judgments || [])
      setSummary(data.summary)
      setTotal(data.total || 0)
      setPage(pg)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchData(1, '') }, [fetchData])

  const handleGradeChange = (g: string) => {
    setGrade(g)
    fetchData(1, g)
  }

  const totalPages = Math.ceil(total / limit)

  const gradeBtnClass = (g: string) => {
    const active = grade === g
    if (g === 'sahih') return active ? 'bg-green-700 text-white border-green-700' : 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100'
    if (g === 'hasan') return active ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
    if (g === 'daif')  return active ? 'bg-red-600 text-white border-red-600'   : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
    return active ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
  }

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/scholars" className="text-amber-200 hover:text-white text-sm">← المحدثون</Link>
          <h1 className="text-lg font-bold text-amber-100">أحكام المحدث</h1>
          <Link href="/" className="text-amber-200 hover:text-white text-sm">الرئيسية</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Scholar info */}
        {scientist && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-bold text-green-900 text-2xl mb-1">{scientist.name}</h2>
                {scientist.death_year && (
                  <p className="text-sm text-gray-500">ت {scientist.death_year} هـ</p>
                )}
                {scientist.martaba_ibn_hajar && (
                  <p className="text-xs text-gray-400 mt-1">درجته: {scientist.martaba_ibn_hajar}</p>
                )}
              </div>
              <Link href={`/narrator/${scientist.id}`} className="text-sm text-green-700 border border-green-200 bg-green-50 px-4 py-2 rounded-lg hover:bg-green-100 transition-colors">
                صفحة الراوي
              </Link>
            </div>
            {summary && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-gray-800">{summary.total.toLocaleString('ar-EG')}</div>
                  <div className="text-xs text-gray-500 mt-0.5">مجموع الأحكام</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100 cursor-pointer hover:bg-green-100 transition-colors" onClick={() => handleGradeChange(grade === 'sahih' ? '' : 'sahih')}>
                  <div className="text-xl font-bold text-green-700">{summary.sahih.toLocaleString('ar-EG')}</div>
                  <div className="text-xs text-green-600 mt-0.5">صحيح</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100 cursor-pointer hover:bg-amber-100 transition-colors" onClick={() => handleGradeChange(grade === 'hasan' ? '' : 'hasan')}>
                  <div className="text-xl font-bold text-amber-700">{summary.hasan.toLocaleString('ar-EG')}</div>
                  <div className="text-xs text-amber-600 mt-0.5">حسن</div>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100 cursor-pointer hover:bg-red-100 transition-colors" onClick={() => handleGradeChange(grade === 'daif' ? '' : 'daif')}>
                  <div className="text-xl font-bold text-red-700">{summary.daif.toLocaleString('ar-EG')}</div>
                  <div className="text-xs text-red-600 mt-0.5">ضعيف</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grade filter + results */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-sm font-semibold text-gray-600 ml-2">تصفية:</span>
            {[
              { key: '', label: 'الكل' },
              { key: 'sahih', label: 'صحيح' },
              { key: 'hasan', label: 'حسن' },
              { key: 'daif', label: 'ضعيف' },
            ].map(g => (
              <button
                key={g.key}
                onClick={() => handleGradeChange(g.key)}
                className={`text-sm px-4 py-1.5 rounded-full border font-medium transition-colors ${gradeBtnClass(g.key)}`}
              >
                {g.label}
              </button>
            ))}
            <span className="text-xs text-gray-400 mr-auto">
              {total.toLocaleString('ar-EG')} نتيجة
            </span>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-12">تحميل...</div>
          ) : (
            <div className="space-y-3">
              {judgments.map((j, i) => (
                <div key={i} className={`rounded-xl border p-4 ${
                  j.grade_class === 'صحيح' ? 'bg-green-50 border-green-100' :
                  j.grade_class === 'حسن'  ? 'bg-amber-50 border-amber-100' :
                  j.grade_class === 'ضعيف' ? 'bg-red-50 border-red-100' :
                  'bg-gray-50 border-gray-100'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Judgment text */}
                      <p className="text-sm text-gray-700 leading-relaxed mb-2 font-medium">
                        {j.say_text}
                      </p>
                      {/* Hadith excerpt */}
                      {j.tarf && (
                        <p className="text-xs text-gray-500 leading-relaxed mb-2 border-r-2 border-gray-200 pr-3">
                          {stripTags(j.tarf).slice(0, 150)}{stripTags(j.tarf).length > 150 ? '…' : ''}
                        </p>
                      )}
                      {/* Book + number */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                          {j.book_title}
                        </span>
                        <HadithNumber harf={j.tarqeem_harf} matboa={j.tarqeem_matboa1} />
                        {j.part_num > 0 && (
                          <span className="text-xs text-gray-400">ج{j.part_num} ص{j.page_num}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      {j.grade_class && (
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                          j.grade_class === 'صحيح' ? 'bg-green-100 text-green-700 border border-green-200' :
                          j.grade_class === 'حسن'  ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                          'bg-red-100 text-red-600 border border-red-200'
                        }`}>
                          {j.grade_class}
                        </span>
                      )}
                      <Link
                        href={`/hadith/${j.hadith_id}`}
                        className="text-xs text-teal-600 hover:text-teal-800 bg-teal-50 border border-teal-100 px-2.5 py-1 rounded-lg hover:border-teal-300 transition-colors"
                      >
                        عرض الحديث
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
              {judgments.length === 0 && (
                <div className="text-center text-gray-400 py-8">لا توجد أحكام</div>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              {page > 1 && (
                <button onClick={() => fetchData(page - 1, grade)} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                  السابق
                </button>
              )}
              <span className="text-sm text-gray-500 px-2">{page} / {totalPages}</span>
              {page < totalPages && (
                <button onClick={() => fetchData(page + 1, grade)} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                  التالي
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function ScholarPage() {
  return (
    <Suspense>
      <ScholarDetail />
    </Suspense>
  )
}
