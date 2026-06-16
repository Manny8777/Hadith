'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { LexiconHadithRef } from '@/lib/ghareeb'

function stripHtml(text: string | null): string {
  if (!text) return ''
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function LexiconHadithList({ itemId }: { itemId: number }) {
  const [hadiths, setHadiths] = useState<LexiconHadithRef[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const limit = 30

  useEffect(() => {
    setLoading(true)
    fetch(`/api/lexicon/${itemId}/hadiths?page=${page}&limit=${limit}`)
      .then(r => r.json())
      .then(data => {
        setHadiths(data.hadiths || [])
        setTotal(data.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [itemId, page])

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg" />
        ))}
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-6 text-center text-gray-400 text-sm">
        لا توجد أحاديث مرتبطة بهذا اللفظ في فهرس المتون
      </div>
    )
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="space-y-2">
        {hadiths.map(h => (
          <Link
            key={h.main_id}
            href={`/hadith/${h.main_id}`}
            className="flex items-start gap-3 bg-white border border-gray-100 rounded-lg px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-green-700 mb-0.5">{h.book_title}</p>
              {h.tarqeem_harf && (
                <span className="text-[10px] text-gray-400 ml-2">#{h.tarqeem_harf}</span>
              )}
              {h.tarf && (
                <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 font-serif">
                  {stripHtml(h.tarf)}
                </p>
              )}
            </div>
            {(h.part_num || h.page_num) && (
              <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                {h.part_num ? `ج${h.part_num}` : ''}{h.page_num ? ` ص${h.page_num}` : ''}
              </span>
            )}
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:border-green-300"
          >
            السابق
          </button>
          <span className="text-xs text-gray-500">
            {page.toLocaleString('ar-EG')} / {totalPages.toLocaleString('ar-EG')}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:border-green-300"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  )
}
