'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface HadithRow {
  main_id: number
  tarf: string
  book_name: string
  book_id: number
}

function stripTags(s: string) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function NarratorHadiths({ narratorId }: { narratorId: number }) {
  const [hadiths, setHadiths] = useState<HadithRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/narrator/${narratorId}/hadiths`)
      .then(r => r.json())
      .then(data => {
        setHadiths(data.hadiths || [])
        setTotal(data.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [narratorId])

  if (loading || total === 0) return null

  // Group by book
  const byBook: Record<string, HadithRow[]> = {}
  for (const h of hadiths) {
    if (!byBook[h.book_name]) byBook[h.book_name] = []
    byBook[h.book_name].push(h)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <h3 className="text-lg font-bold text-green-900 flex items-center gap-2">
          <span className="w-1 h-5 bg-green-500 rounded-full inline-block"></span>
          أحاديثه في السند
          <span className="text-sm text-gray-400 font-normal">
            ({total.toLocaleString('ar-EG')} حديث{hadiths.length < total ? ` — يُعرض ${hadiths.length}` : ''})
          </span>
        </h3>
        <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="mt-5 space-y-4">
          {Object.entries(byBook).map(([bookName, bookHadiths]) => (
            <div key={bookName}>
              <h4 className="text-xs font-semibold text-green-700 mb-2 uppercase tracking-wide">{bookName}</h4>
              <ul className="space-y-1.5">
                {bookHadiths.map(h => (
                  <li key={h.main_id}>
                    <Link
                      href={`/hadith/${h.main_id}`}
                      className="block text-sm text-gray-800 hover:text-green-800 hover:underline leading-6 line-clamp-2"
                    >
                      {stripTags(h.tarf) || `حديث رقم ${h.main_id}`}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {hadiths.length < total && (
            <Link
              href={`/search?narrator_id=${narratorId}`}
              className="inline-block text-xs text-green-700 hover:underline mt-2"
            >
              عرض كل {total.toLocaleString('ar-EG')} حديث ←
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
