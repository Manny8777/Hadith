'use client'

import { useEffect, useState } from 'react'

interface TypeGroup {
  type_id: number
  type_name: string
  count: number
}

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

export default function CommentaryInline({
  hadithId,
  initialTypeId,
}: {
  hadithId: number
  initialTypeId: number
}) {
  const [typeGroups, setTypeGroups] = useState<TypeGroup[]>([])
  const [contentRows, setContentRows] = useState<ContentRow[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState<number>(initialTypeId)
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/hadith/${hadithId}/commentary?type=${initialTypeId}`)
      .then(r => r.json())
      .then(data => {
        setTypeGroups(data.typeGroups || [])
        setContentRows(data.contentRows || [])
        setSelectedTypeId(data.selectedTypeId ?? initialTypeId)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [hadithId, initialTypeId])

  function switchType(typeId: number) {
    if (typeId === selectedTypeId) return
    setSelectedTypeId(typeId)
    setContentLoading(true)
    fetch(`/api/hadith/${hadithId}/commentary?type=${typeId}`)
      .then(r => r.json())
      .then(data => {
        setContentRows(data.contentRows || [])
        setContentLoading(false)
      })
      .catch(() => { setError(true); setContentLoading(false) })
  }

  if (error) return <p className="text-sm text-red-500 py-4">حدث خطأ في تحميل المحتوى</p>

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
    </div>
  )

  if (typeGroups.length === 0) return (
    <p className="text-sm text-gray-400 py-4">لا تتوفر خدمات علمية لهذا الحديث</p>
  )

  return (
    <div dir="rtl">
      {typeGroups.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {typeGroups.map(g => (
            <button
              key={g.type_id}
              onClick={() => switchType(g.type_id)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                g.type_id === selectedTypeId
                  ? 'bg-green-700 text-white border-green-700'
                  : 'border-gray-200 text-gray-600 hover:border-green-300 bg-white'
              }`}
            >
              {g.type_name}
              <span className={`mr-1.5 ${g.type_id === selectedTypeId ? 'text-green-200' : 'text-gray-400'}`}>
                ({g.count})
              </span>
            </button>
          ))}
        </div>
      )}

      {contentLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
        </div>
      ) : contentRows.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">لا توجد نصوص متاحة</p>
      ) : (
        <div className="space-y-4">
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
      )}
    </div>
  )
}
