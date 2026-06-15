import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface ServiceTypeGroup {
  type_id: number
  type_name: string
  entries: Array<{
    id: number
    book_name: string
    section_text: string | null
    part_num: number
    page_num: number
    tarf: string | null
    content: string | null
  }>
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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
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

export default async function HadithCommentaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) notFound()

  const [hadithRes, linksRes] = await Promise.all([
    pool.query(
      `SELECT ht.main_id,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.id AS book_id
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.main_id = $1`,
      [hadithId]
    ),
    pool.query<{ type_id: number; type_name: string; count: number }>(
      `SELECT hsl.type_id,
              coalesce(hst.name, 'غير محدد') AS type_name,
              COUNT(*) AS count
       FROM hadith_service_links hsl
       LEFT JOIN hadith_service_types hst ON hst.id = hsl.type_id
       WHERE hsl.hadith_id = $1
       GROUP BY hsl.type_id, hst.name
       ORDER BY hsl.type_id`,
      [hadithId]
    ),
  ])

  const hadith = hadithRes.rows[0]
  if (!hadith) notFound()

  const typeGroups = linksRes.rows
  const selectedTypeId = sp.type ? parseInt(sp.type) : typeGroups[0]?.type_id

  let contentRows: Array<{
    id: number
    book_name: string
    section_text: string | null
    part_num: number
    page_num: number
    tarf: string | null
    content: string | null
  }> = []

  if (selectedTypeId && typeGroups.length > 0) {
    const res = await pool.query(
      `SELECT hsc.id, hsc.book_name,
              hsc.section_text, hsc.part_num, hsc.page_num,
              hsc.tarf, hsc.content
       FROM hadith_service_links hsl
       JOIN hadith_service_content hsc ON hsc.id = hsl.service_content_id
       WHERE hsl.hadith_id = $1 AND hsl.type_id = $2
       ORDER BY hsc.book_id, hsc.id
       LIMIT 100`,
      [hadithId, selectedTypeId]
    )
    contentRows = res.rows
  }

  const selectedGroup = typeGroups.find(g => g.type_id === selectedTypeId)

  return (
    <div dir="rtl" className="max-w-4xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4 flex-wrap">
        <Link href={`/books/${hadith.book_id}`} className="text-green-700 hover:underline">
          {hadith.book_title}
        </Link>
        <span>←</span>
        <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline">
          {hadith.tarf?.slice(0, 60) || `حديث ${hadithId}`}…
        </Link>
        <span>←</span>
        <span>الخدمات العلمية</span>
      </div>

      <h1 className="text-lg font-bold text-green-900 mb-4">الخدمات العلمية للحديث</h1>

      {typeGroups.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium">لا تتوفر خدمات علمية لهذا الحديث بعد</p>
          <p className="text-xs text-amber-600 mt-1">قد تكون البيانات لا تزال قيد التحميل</p>
          <Link href={`/hadith/${hadithId}`} className="inline-block mt-3 text-sm text-green-700 hover:underline">
            ← العودة للحديث
          </Link>
        </div>
      ) : (
        <>
          {/* Type tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {typeGroups.map(g => (
              <Link
                key={g.type_id}
                href={`/hadith/${hadithId}/commentary?type=${g.type_id}`}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  g.type_id === selectedTypeId
                    ? 'bg-green-700 text-white border-green-700'
                    : 'border-gray-200 text-gray-600 hover:border-green-300 bg-white'
                }`}
              >
                {g.type_name}
                <span className={`mr-1.5 text-xs ${g.type_id === selectedTypeId ? 'text-green-200' : 'text-gray-400'}`}>
                  {g.count}
                </span>
              </Link>
            ))}
          </div>

          {/* Content */}
          {selectedGroup && (
            <div>
              <h2 className="font-bold text-green-800 text-base mb-4 pb-2 border-b border-gray-100">
                {selectedGroup.type_name}
              </h2>
              {contentRows.length === 0 ? (
                <p className="text-sm text-gray-400">لا توجد نصوص متاحة لهذا النوع</p>
              ) : (
                <div className="space-y-5">
                  {contentRows.map(row => (
                    <div key={row.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      {/* Source header */}
                      <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
                        <span className="text-sm font-semibold text-green-800">
                          {row.book_name}
                        </span>
                        <span className="text-xs text-gray-400">
                          {row.section_text?.trim() && <span>{row.section_text.trim()} · </span>}
                          {row.part_num > 0 && <span>ج{row.part_num} </span>}
                          {row.page_num > 0 && <span>ص{row.page_num}</span>}
                        </span>
                      </div>
                      {/* Commentary text */}
                      <div className="p-4 text-sm leading-loose text-gray-800 whitespace-pre-line">
                        {stripServiceTags(row.content) || stripServiceTags(row.tarf) || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Back link */}
      <div className="mt-8 pt-4 border-t border-gray-100">
        <Link href={`/hadith/${hadithId}`} className="text-sm text-green-700 hover:underline">
          ← العودة لصفحة الحديث
        </Link>
      </div>
    </div>
  )
}
