export const dynamic = 'force-dynamic'
import pool from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

interface ContentNode {
  id: number
  book_id: number
  book_name: string
  parent_id: number | null
  prev_id: number | null
  next_id: number | null
  section_text: string | null
  part_text: string | null
  part_num: number
  page_num: number
  tarf: string | null
  content: string | null
  is_paragraph: boolean
}

function decodeEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
}

function renderContent(xml: string | null): string {
  if (!xml) return ''
  return decodeEntities(
    xml
      .replace(/<رقم_الفقرة[^>]*\/>/g, '')
      .replace(/<الصفحات[^>]*\/>/g, '')
      .replace(/<نه\/>/g, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

export default async function ServiceContentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const contentId = parseInt(id)
  if (isNaN(contentId)) notFound()

  const { rows } = await pool.query<ContentNode>(
    `SELECT id, book_id, book_name, parent_id, prev_id, next_id,
            section_text, part_text, part_num, page_num, tarf, content, is_paragraph
     FROM hadith_service_content
     WHERE id = $1`,
    [contentId]
  )
  if (!rows[0]) notFound()
  const node = rows[0]

  // Fetch prev and next siblings for navigation
  const [prevRes, nextRes] = await Promise.all([
    node.prev_id
      ? pool.query<Pick<ContentNode, 'id' | 'part_num' | 'page_num' | 'section_text'>>(
          `SELECT id, part_num, page_num, section_text FROM hadith_service_content WHERE id = $1`,
          [node.prev_id]
        )
      : Promise.resolve({ rows: [] }),
    node.next_id
      ? pool.query<Pick<ContentNode, 'id' | 'part_num' | 'page_num' | 'section_text'>>(
          `SELECT id, part_num, page_num, section_text FROM hadith_service_content WHERE id = $1`,
          [node.next_id]
        )
      : Promise.resolve({ rows: [] }),
  ])

  const prevNode = prevRes.rows[0] ?? null
  const nextNode = nextRes.rows[0] ?? null

  const text = renderContent(node.content) || renderContent(node.tarf) || ''
  const partLabel = node.part_num > 0 ? `ج${node.part_num}` : ''
  const pageLabel = node.page_num > 0 ? `ص${node.page_num}` : ''

  return (
    <div dir="rtl" className="max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-5 flex-wrap">
        <Link href="/" className="hover:text-green-700">الرئيسية</Link>
        <span>/</span>
        <span className="text-green-800 font-medium">{node.book_name}</span>
        {node.section_text && (
          <>
            <span>/</span>
            <span className="text-gray-500">{node.section_text}</span>
          </>
        )}
      </div>

      {/* Header card */}
      <div className="bg-green-50 border border-green-100 rounded-xl px-5 py-4 mb-5">
        <h1 className="text-lg font-bold text-green-900 mb-1">{node.book_name}</h1>
        {node.section_text && (
          <p className="text-sm text-green-800 mb-1">{node.section_text}</p>
        )}
        {node.part_text && (
          <p className="text-sm text-gray-600 mb-1">{node.part_text}</p>
        )}
        <div className="flex gap-3 text-xs text-gray-500 mt-2">
          {partLabel && <span className="bg-white border border-green-200 px-2 py-0.5 rounded-full">{partLabel}</span>}
          {pageLabel && <span className="bg-white border border-green-200 px-2 py-0.5 rounded-full">{pageLabel}</span>}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
        {text ? (
          <p
            className="text-gray-800 leading-[2.2] whitespace-pre-line"
            style={{ fontFamily: '"Scheherazade New", "Traditional Arabic", serif', fontSize: '1.1rem' }}
          >
            {text}
          </p>
        ) : (
          <p className="text-sm text-gray-400 py-4 text-center">لا يوجد نص متاح لهذا الموضع</p>
        )}
      </div>

      {/* Prev / Next navigation */}
      <div className="flex justify-between gap-3 text-sm">
        {prevNode ? (
          <Link
            href={`/service-content/${prevNode.id}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:border-green-300 hover:text-green-800 transition-colors"
          >
            →
            <span>
              {prevNode.section_text
                ? prevNode.section_text.slice(0, 30)
                : `ص${prevNode.page_num}`}
            </span>
          </Link>
        ) : <span />}

        {nextNode ? (
          <Link
            href={`/service-content/${nextNode.id}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:border-green-300 hover:text-green-800 transition-colors"
          >
            <span>
              {nextNode.section_text
                ? nextNode.section_text.slice(0, 30)
                : `ص${nextNode.page_num}`}
            </span>
            ←
          </Link>
        ) : <span />}
      </div>
    </div>
  )
}
