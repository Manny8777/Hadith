'use client'

import { useEffect, useState } from 'react'

interface ContentRow {
  id: number
  book_name: string
  section_text: string | null
  part_num: number
  page_num: number
  tarf: string | null
  content: string | null
}

function decodeEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
}

function stripServiceTags(xml: string | null): string {
  if (!xml) return ''
  return decodeEntities(
    xml
      .replace(/<رقم_الفقرة[^>]*\/>/g, '')
      .replace(/<الصفحات[^>]*\/>/g, '')
      .replace(/<نه\/>/g, '\n')
      .replace(/<متن[^>]*>/g, '')
      .replace(/<\/متن>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

// The texts of one service type linked to this hadith. Each service section shows its own type
// only; the section is shown only when texts of that type exist (see the hadith page).
export default function CommentaryInline({
  hadithId,
  initialTypeId,
}: {
  hadithId: number
  initialTypeId: number
}) {
  const [contentRows, setContentRows] = useState<ContentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/hadith/${hadithId}/commentary?type=${initialTypeId}`)
      .then(r => r.json())
      .then(data => {
        setContentRows(data.contentRows || [])
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [hadithId, initialTypeId])

  if (error) return <p className="text-sm text-red-500 py-4">حدث خطأ في تحميل المحتوى</p>

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
    </div>
  )

  if (contentRows.length === 0) return (
    <p className="text-sm text-gray-400 py-4">لا توجد نصوص متاحة</p>
  )

  return (
    <div dir="rtl" className="space-y-4">
      {contentRows.map(row => (
        <div key={row.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-semibold text-green-800">{row.book_name}</span>
            <span className="text-xs text-gray-400">
              {row.section_text?.trim() && <span>{row.section_text.trim()} · </span>}
              {row.part_num > 0 && <span>ج{row.part_num} </span>}
              {row.page_num > 0 && <span>ص{row.page_num}</span>}
            </span>
          </div>
          <div className="p-4 text-sm leading-loose text-gray-800 whitespace-pre-line">
            {stripServiceTags(row.content) || stripServiceTags(row.tarf) || '—'}
          </div>
        </div>
      ))}
    </div>
  )
}
