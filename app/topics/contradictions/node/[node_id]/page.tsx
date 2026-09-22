import pool from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'مشكل الحديث — شجرة مختلف الحديث — جامع خادم الحرمين' }

interface HadithRow {
  hadith_id: number
  tarf: string | null
  book_title: string | null
}

function cleanTarf(tarf: string | null): string {
  return (tarf || '').replace(/<[^>]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function MusakaratNodePage({ params }: { params: Promise<{ node_id: string }> }) {
  const { node_id } = await params
  const nodeId = parseInt(node_id, 10)
  if (isNaN(nodeId)) notFound()

  const [nodeRes, hadithsRes] = await Promise.all([
    pool.query<{ id: number; text: string; parent_id: number; is_leaf: boolean }>(
      `SELECT id, text, parent_id, is_leaf FROM hadith_controversial_tree WHERE id = $1`,
      [nodeId]
    ),
    pool.query<HadithRow>(
      `SELECT DISTINCT hsl.hadith_id,
              (SELECT tarf FROM hadith_toc ht
               WHERE ht.main_id = hsl.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true LIMIT 1) AS tarf,
              (SELECT b.title FROM books b
               JOIN hadith_toc ht ON ht.book_id = b.id
               WHERE ht.main_id = hsl.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true LIMIT 1) AS book_title
       FROM hadith_controversial_tree ct
       JOIN hadith_controversial_descriptions hcd ON hcd.node_id = ct.id
       JOIN hadith_service_links hsl ON hsl.service_content_id = hcd.service_main_id
       WHERE ct.id = $1
       ORDER BY hsl.hadith_id`,
      [nodeId]
    ),
  ])

  if (!nodeRes.rows[0]) notFound()
  const node = nodeRes.rows[0]
  const hadiths = hadithsRes.rows

  return (
    <div dir="rtl">
      {/* ── Breadcrumb ── */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/topics/contradictions" className="text-green-700 hover:underline">ربط بالمخالف</Link>
        <span>/</span>
        <span className="text-gray-600">مشكل: {node.text.slice(0, 40)}</span>
      </div>

      {/* ── Title ── */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-green-900 mb-2">{node.text}</h1>
        <p className="text-gray-500 text-sm">
          الأحاديث المرتبطة بهذا المشكل — {hadiths.length} رواية
        </p>
      </div>

      {/* ── Pair view: side-by-side conflicting texts ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {hadiths.map((h, idx) => (
          <div
            key={h.hadith_id}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-green-200 transition-all"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-300 font-mono">{idx + 1}</span>
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                {h.book_title || '—'}
              </span>
            </div>
            <p className="text-sm text-gray-800 leading-relaxed mb-3">
              {cleanTarf(h.tarf).slice(0, 300)}
              {cleanTarf(h.tarf).length > 300 && <span className="text-gray-400">…</span>}
            </p>
            <Link href={`/hadith/${h.hadith_id}`} className="text-xs text-green-700 hover:underline">
              عرض الحديث ←
            </Link>
          </div>
        ))}
        {hadiths.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center col-span-full">
            <h2 className="text-xl font-bold text-green-900 mb-2">لا توجد أحاديث مرتبطة</h2>
            <p className="text-sm text-gray-600">
              لم يُستخرج أي حديث مرتبط بهذا المشكل من قاعدة البيانات. قد يكون الربط قيد الترحيل.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
