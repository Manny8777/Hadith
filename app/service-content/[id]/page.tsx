import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cardInfoField, cardInfoLines } from '@/lib/bookReference'
import ServiceContentRenderer from '@/app/components/ServiceContentRenderer'

export const dynamic = 'force-dynamic'

interface ServiceNode {
  id: number
  book_id: number
  book_name: string
  parent_id: number
  section_text: string | null
  part_text: string | null
  is_leaf: boolean
  is_paragraph: boolean
  part_num: number | null
  page_num: number | null
  content: string | null
  tarf: string | null
}

interface QuranRef {
  sura: number
  aya: number
  sura_name: string
  aya_text: string | null
}

interface ChildNode {
  id: number
  section_text: string | null
  part_text: string | null
  tarf: string | null
  is_leaf: boolean
  part_num: number | null
  page_num: number | null
}

// The catalogue row for the book this passage belongs to, joined to its author so the page can cite
// the source the reader is looking at.
interface BookMeta {
  id: number
  title: string | null
  card_info: string | null
  print1_edition: string | null
  takhrij_author: string | null
  takhrij_death: number | null
  author_id: number | null
  author_name: string | null
  author_short: string | null
  author_death: number | null
}

export default async function ServiceContentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const nodeId = parseInt(id)
  if (isNaN(nodeId)) notFound()

  const [nodeRes, quranRes, suraRes, childrenRes, parentRes, bookRes] = await Promise.all([
    pool.query<ServiceNode>(
      `SELECT id, book_id, book_name, parent_id, section_text, part_text,
              is_leaf, is_paragraph, part_num, page_num, content, tarf
       FROM hadith_service_content WHERE id = $1`,
      [nodeId]
    ),
    pool.query<QuranRef>(
      `SELECT q.sura, q.aya, s.name AS sura_name, a.text AS aya_text
       FROM quran_ayat_services q
       JOIN quran_suras s ON s.id = q.sura
       LEFT JOIN quran_ayat a ON a.sora_id = q.sura AND a.aya_num = q.aya
       WHERE q.service_main_id = $1`,
      [nodeId]
    ),
    pool.query<{ id: number; name: string }>('SELECT id, name FROM quran_suras'),
    pool.query<ChildNode>(
      `SELECT id, section_text, part_text, tarf, is_leaf, part_num, page_num
       FROM hadith_service_content WHERE parent_id = $1
       ORDER BY part_num, id`,
      [nodeId]
    ),
    pool.query<{ id: number; section_text: string | null; part_text: string | null }>(
      `SELECT id, section_text, part_text
       FROM hadith_service_content WHERE id = (
         SELECT parent_id FROM hadith_service_content WHERE id = $1
       )`,
      [nodeId]
    ),
    pool.query<BookMeta>(
      `SELECT b.id, b.title, b.card_info, b.print1_edition, b.takhrij_author, b.takhrij_death,
              a.id AS author_id, a.name AS author_name, a.short_name AS author_short,
              a.death_date AS author_death
       FROM hadith_service_content s
       JOIN books b ON b.id = s.book_id
       LEFT JOIN authors a ON a.id = b.author_id
       WHERE s.id = $1`,
      [nodeId]
    ).catch(() => ({ rows: [] as BookMeta[] })),
  ])

  if (!nodeRes.rows.length) notFound()
  const node = nodeRes.rows[0]
  const quranRef = quranRes.rows[0] ?? null
  const children = childrenRes.rows
  const parent = parentRes.rows[0] ?? null

  const book = bookRes.rows[0] ?? null
  const cardLines = cardInfoLines(book?.card_info)
  const publisher = cardInfoField(cardLines, ['الناشر'])
  const edition = cardInfoField(cardLines, ['الطبعة'])
  const volumeCount = cardInfoField(cardLines, ['عدد الأجزاء'])
  const authorName = book?.author_name || book?.author_short || book?.takhrij_author || null
  const authorDeath = book?.author_death ?? book?.takhrij_death ?? null

  const suraByName = Object.fromEntries(suraRes.rows.map(s => [s.name, Number(s.id)]))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
      <nav className="text-sm text-gray-500 mb-6 flex gap-2 items-center flex-wrap">
        <Link href="/" className="hover:text-gray-700">{'الرئيسية'}</Link>
        <span>/</span>
        {quranRef && (
          <>
            <Link href="/quran" className="hover:text-gray-700">{'القرآن الكريم'}</Link>
            <span>/</span>
            <Link href={`/quran/${quranRef.sura}`} className="hover:text-gray-700">
              {quranRef.sura_name}
            </Link>
            <span>/</span>
          </>
        )}
        {book ? (
          <Link href={`/books/${book.id}`} className="text-gray-700 font-medium hover:text-amber-700">
            {book.title || node.book_name}
          </Link>
        ) : (
          <span className="text-gray-700 font-medium">{node.book_name}</span>
        )}
      </nav>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-amber-600 font-medium mb-1">{node.book_name}</p>
            {node.section_text && (
              <h1 className="text-xl font-bold text-gray-900 font-arabic leading-relaxed mb-1">
                {node.section_text}
              </h1>
            )}
            {node.part_text && node.part_text !== node.section_text && (
              <h2 className="text-lg text-gray-700 font-arabic leading-relaxed">
                {node.part_text}
              </h2>
            )}
          </div>
          {(node.part_num || node.page_num) && (
            <div className="text-xs text-gray-400 text-left shrink-0">
              {node.part_num && <div>{'ج'} {node.part_num}</div>}
              {node.page_num && <div>{'ص'} {node.page_num}</div>}
            </div>
          )}
        </div>

        {quranRef && (
          <div className="mt-4 pt-4 border-t border-amber-200">
            <p className="text-xs text-amber-600 mb-2">{'الآية المفسَّرة'}</p>
            <div className="bg-white rounded-lg p-4 border border-amber-100">
              <div className="flex items-center gap-3 mb-2">
                <Link
                  href={`/quran/${quranRef.sura}`}
                  className="text-amber-700 hover:underline text-sm font-medium"
                >
                  {quranRef.sura_name} ({quranRef.sura}:{quranRef.aya})
                </Link>
              </div>
              {quranRef.aya_text && (
                <p className="text-lg font-arabic text-gray-800 leading-loose">
                  {quranRef.aya_text}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {(book || node.book_name) && (
        <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6" aria-label="مرجع النص">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
            <div className="w-1 h-6 bg-amber-400 rounded" />
            <h3 className="text-sm font-semibold text-gray-600">{'المرجع'}</h3>
          </div>
          <dl className="space-y-1.5 text-sm leading-relaxed font-arabic">
            <div className="flex gap-2 items-baseline">
              <dt className="w-24 shrink-0 text-gray-500">{'الكتاب'}</dt>
              <dd className="text-gray-900">
                {book ? (
                  <Link href={`/books/${book.id}`} className="text-emerald-800 hover:underline">
                    {book.title || node.book_name}
                  </Link>
                ) : node.book_name}
              </dd>
            </div>
            {authorName && (
              <div className="flex gap-2 items-baseline">
                <dt className="w-24 shrink-0 text-gray-500">{'المؤلف'}</dt>
                <dd className="text-gray-900">
                  {book?.author_id ? (
                    <Link href={`/authors/${book.author_id}`} className="text-emerald-800 hover:underline">
                      {authorName}
                    </Link>
                  ) : authorName}
                  {authorDeath ? ` (ت ${authorDeath} هـ)` : ''}
                </dd>
              </div>
            )}
            {publisher && (
              <div className="flex gap-2 items-baseline">
                <dt className="w-24 shrink-0 text-gray-500">{'الناشر'}</dt>
                <dd className="text-gray-900">{publisher}</dd>
              </div>
            )}
            {edition && (
              <div className="flex gap-2 items-baseline">
                <dt className="w-24 shrink-0 text-gray-500">{'الطبعة'}</dt>
                <dd className="text-gray-900">{edition}</dd>
              </div>
            )}
            {volumeCount && volumeCount !== '1' && (
              <div className="flex gap-2 items-baseline">
                <dt className="w-24 shrink-0 text-gray-500">{'عدد الأجزاء'}</dt>
                <dd className="text-gray-900">{volumeCount}</dd>
              </div>
            )}
            {(node.part_num != null || node.page_num != null) && (
              <div className="flex gap-2 items-baseline">
                <dt className="w-24 shrink-0 text-gray-500">{'موضع الطبعة'}</dt>
                <dd className="text-gray-900">
                  {node.part_num != null ? `ج ${node.part_num}` : ''}
                  {node.part_num != null && node.page_num != null ? ' · ' : ''}
                  {node.page_num != null ? `ص ${node.page_num}` : ''}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {parent && parent.id !== 0 && (
        <div className="mb-4">
          <Link
            href={`/service-content/${parent.id}`}
            className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
          >
            {'←'} {parent.section_text || parent.part_text || 'القسم الأعلى'}
          </Link>
        </div>
      )}

      {children.length > 0 && !node.is_paragraph && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {'الأقسام'} ({children.length})
          </h3>
          <div className="space-y-2">
            {children.map((child: ChildNode) => (
              <Link
                key={child.id}
                href={`/service-content/${child.id}`}
                className="block bg-white border border-gray-100 rounded-lg p-4 hover:border-amber-200 hover:bg-amber-50 transition-colors"
              >
                <div className="font-arabic text-gray-800 text-sm leading-relaxed">
                  {child.tarf || child.part_text || child.section_text}
                </div>
                {child.page_num && (
                  <div className="text-xs text-gray-400 mt-1">{'ص'} {child.page_num}</div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {node.content && node.is_leaf && (
        <article className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
            <div className="w-1 h-6 bg-amber-400 rounded" />
            <h3 className="text-sm font-semibold text-gray-600">النص</h3>
          </div>
          <ServiceContentRenderer
            content={node.content}
            suraByName={suraByName}
            className="text-base leading-9"
          />
        </article>
      )}

      {children.length > 0 && node.is_paragraph && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {'فقرات أخرى'} ({children.length})
          </h3>
          <div className="space-y-2">
            {children.map((child: ChildNode) => (
              <Link
                key={child.id}
                href={`/service-content/${child.id}`}
                className="block bg-white border border-gray-100 rounded-lg p-3 hover:border-amber-200 transition-colors"
              >
                <div className="font-arabic text-gray-700 text-sm">
                  {child.tarf || child.part_text}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
