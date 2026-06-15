'use client'
import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'

interface HadithData {
  id: number
  tarf: string
  book_title: string
  takhrij_author: string | null
  chain_narrators: Array<{ id: number; name: string; martaba: string | null; death_year: string | null }>
  judgments: Array<{ scientist: string; scientist_id: number | null; say_text: string; grade: string | null }>
  group_id: number | null
  parallel_count: number
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function gradeColor(g: string | null) {
  if (!g) return 'text-gray-500 bg-gray-50'
  if (/صحيح/.test(g)) return 'text-green-700 bg-green-50'
  if (/حسن/.test(g)) return 'text-amber-700 bg-amber-50'
  if (/ضعيف|منكر|متروك/.test(g)) return 'text-red-600 bg-red-50'
  return 'text-gray-600 bg-gray-50'
}

function narratorGrade(m: string | null) {
  if (!m) return 'bg-gray-100'
  if (/ثقة|ثبت|حجة/.test(m)) return 'bg-green-200'
  if (/صدوق/.test(m)) return 'bg-amber-200'
  if (/ضعيف/.test(m)) return 'bg-red-200'
  return 'bg-gray-100'
}

export default function HadithComparePage() {
  const [idA, setIdA] = useState('')
  const [idB, setIdB] = useState('')
  const [hadithA, setHadithA] = useState<HadithData | null>(null)
  const [hadithB, setHadithB] = useState<HadithData | null>(null)
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)
  const [errorA, setErrorA] = useState('')
  const [errorB, setErrorB] = useState('')
  const [sameGroup, setSameGroup] = useState<boolean | null>(null)

  // Read from URL on mount
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const a = sp.get('a') || ''
    const b = sp.get('b') || ''
    if (a) { setIdA(a); loadHadith(a, 'a') }
    if (b) { setIdB(b); loadHadith(b, 'b') }
  }, []) // eslint-disable-line

  const loadHadith = useCallback(async (id: string, side: 'a' | 'b') => {
    const numId = parseInt(id)
    if (isNaN(numId)) return

    if (side === 'a') { setLoadingA(true); setErrorA('') }
    else { setLoadingB(true); setErrorB('') }

    try {
      const res = await fetch(`/api/hadith-compare-data?id=${numId}`)
      if (!res.ok) throw new Error('لم يُعثر على الحديث')
      const data = await res.json()
      if (side === 'a') {
        setHadithA(data)
        setLoadingA(false)
      } else {
        setHadithB(data)
        setLoadingB(false)
      }
    } catch {
      if (side === 'a') { setErrorA('لم يُعثر على الحديث'); setLoadingA(false) }
      else { setErrorB('لم يُعثر على الحديث'); setLoadingB(false) }
    }
  }, [])

  useEffect(() => {
    if (hadithA && hadithB) {
      setSameGroup(
        hadithA.group_id !== null && hadithB.group_id !== null &&
        hadithA.group_id === hadithB.group_id
      )
    } else {
      setSameGroup(null)
    }
  }, [hadithA, hadithB])

  function handleLoad(side: 'a' | 'b') {
    const id = side === 'a' ? idA : idB
    if (id.trim()) {
      loadHadith(id.trim(), side)
      const sp = new URLSearchParams(window.location.search)
      sp.set(side, id.trim())
      window.history.replaceState({}, '', `?${sp.toString()}`)
    }
  }

  const HadithPanel = ({
    data,
    loading,
    error,
    id,
    setId,
    side,
    label,
  }: {
    data: HadithData | null
    loading: boolean
    error: string
    id: string
    setId: (v: string) => void
    side: 'a' | 'b'
    label: string
  }) => (
    <div className="flex-1 min-w-0 border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
        <span className="font-bold text-green-900 text-sm">{label}</span>
        <input
          type="number"
          value={id}
          onChange={e => setId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLoad(side)}
          placeholder="رقم الحديث..."
          className="border border-gray-200 rounded-lg px-2 py-1 text-sm flex-1 focus:outline-none focus:border-green-400"
          dir="ltr"
        />
        <button onClick={() => handleLoad(side)}
          className="bg-green-700 text-white px-3 py-1 rounded-lg text-xs hover:bg-green-600 transition-colors">
          تحميل
        </button>
      </div>

      <div className="p-4">
        {loading && (
          <div className="text-center text-gray-400 py-8">جارٍ التحميل...</div>
        )}
        {error && (
          <div className="text-center text-red-500 py-8 text-sm">{error}</div>
        )}
        {!loading && !error && !data && (
          <div className="text-center text-gray-400 py-8 text-sm">أدخل رقم الحديث وانقر تحميل</div>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {/* Book + Link */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-green-700 font-medium">{data.book_title}</p>
                {data.takhrij_author && <p className="text-xs text-gray-400">{data.takhrij_author}</p>}
              </div>
              <Link href={`/hadith/${data.id}`} target="_blank"
                className="text-xs text-indigo-600 hover:underline">
                صفحة الحديث ↗
              </Link>
            </div>

            {/* Text */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p className="text-sm text-gray-800 leading-loose">
                {stripTags(data.tarf).slice(0, 400)}
              </p>
            </div>

            {/* Chain */}
            {data.chain_narrators.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">السند</p>
                <div className="flex flex-wrap gap-1 items-center">
                  {data.chain_narrators.map((n, i) => (
                    <span key={n.id} className="flex items-center gap-0.5">
                      <Link href={`/narrator/${n.id}`} target="_blank"
                        className={`text-xs px-2 py-0.5 rounded font-medium hover:opacity-80 ${narratorGrade(n.martaba)}`}
                        title={n.martaba || ''}>
                        {n.name.split(' ').slice(0, 3).join(' ')}
                        {n.death_year && <span className="opacity-60 mr-1">ت{n.death_year}</span>}
                      </Link>
                      {i < data.chain_narrators.length - 1 && (
                        <span className="text-gray-300 text-xs">→</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Judgments */}
            {data.judgments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">
                  أحكام المحدثين ({data.judgments.length})
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {data.judgments.slice(0, 8).map((j, i) => (
                    <div key={i} className={`text-xs px-2 py-1.5 rounded-lg ${gradeColor(j.grade)}`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {j.scientist_id ? (
                          <Link href={`/narrator/${j.scientist_id}`} target="_blank"
                            className="font-semibold hover:underline">
                            {j.scientist}
                          </Link>
                        ) : (
                          <span className="font-semibold">{j.scientist}</span>
                        )}
                        {j.grade && <span className="opacity-70">({j.grade})</span>}
                      </div>
                      <p className="leading-relaxed line-clamp-2">{j.say_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parallel count */}
            {data.parallel_count > 1 && (
              <p className="text-xs text-gray-400">
                {data.parallel_count} رواية متوازية عبر التخريج
                {sameGroup !== null && sameGroup && (
                  <span className="text-green-600 font-semibold mr-2">✓ كلا الحديثين متوازيان</span>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مقارنة حديثين</h1>
        <p className="text-sm text-gray-500">
          قارن بين حديثين بجانب بعضهما — المتن والإسناد والأحكام العلمية —
          لتحديد أوجه الاتفاق والاختلاف في الرواية
        </p>
      </div>

      {sameGroup === true && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-800 font-medium">
          ✓ الحديثان روايتان متوازيتان للحديث ذاته (نفس المجموعة في التخريج)
        </div>
      )}
      {sameGroup === false && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 text-sm text-gray-600">
          الحديثان من مجموعتَي تخريج مختلفتَين — قد يكونان حديثين مستقلَّين
        </div>
      )}

      <div className="flex gap-4 flex-wrap md:flex-nowrap">
        <HadithPanel
          data={hadithA} loading={loadingA} error={errorA}
          id={idA} setId={setIdA} side="a" label="الحديث الأول"
        />
        <HadithPanel
          data={hadithB} loading={loadingB} error={errorB}
          id={idB} setId={setIdB} side="b" label="الحديث الثاني"
        />
      </div>

      <div className="mt-4 text-xs text-gray-400 text-center">
        ابحث في صفحة الحديث عن رقمه في الرابط، ثم أدخله هنا للمقارنة
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap justify-center">
        <Link href="/search" className="text-green-700 hover:underline">← البحث في الأحاديث</Link>
        <Link href="/matn-compare" className="text-green-700 hover:underline">← مقارنة المتون المتوازية</Link>
        <Link href="/saved" className="text-green-700 hover:underline">← المجموعة البحثية</Link>
      </div>
    </div>
  )
}
