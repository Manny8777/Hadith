export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

function stripTags(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface LexiconHadith {
  main_id: number
  book_name: string
  tarf: string
  part_num: number
  page_num: number
}

export default async function LexiconEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const itemId = parseInt(id)

  if (isNaN(itemId)) notFound()

  const [itemRes, hadithRes, countRes] = await Promise.all([
    pool.query(`SELECT * FROM lexicon_items WHERE id = $1`, [itemId]),
    pool.query(
      `SELECT h.main_id, h.book_name, h.tarf, h.part_num, h.page_num
       FROM lexicon_hadith lh
       JOIN hadith_toc h ON h.main_id = lh.hadith_id
       WHERE lh.lexicon_item_id = $1
       LIMIT 20`,
      [itemId]
    ),
    pool.query(
      `SELECT COUNT(*) FROM lexicon_hadith WHERE lexicon_item_id = $1`,
      [itemId]
    ),
  ])

  if (!itemRes.rows[0]) notFound()

  const item = itemRes.rows[0]
  const hadiths: LexiconHadith[] = hadithRes.rows
  const totalHadiths = parseInt(countRes.rows[0].count)

  return (
    <div>
      <Link
        href="/lexicon"
        className="text-green-700 hover:underline text-sm mb-6 inline-block"
      >
        ← غريب الحديث
      </Link>

      {/* Word header */}
      <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-8 mb-8 text-center">
        <h1 className="text-5xl font-bold text-green-900 mb-4">{item.text}</h1>
        {totalHadiths > 0 && (
          <p className="text-amber-700 text-lg">
            ورد في{' '}
            <span className="font-bold">{totalHadiths.toLocaleString('ar')}</span>{' '}
            حديث
          </p>
        )}
      </div>

      {/* Hadiths list */}
      {hadiths.length > 0 ? (
        <div>
          <h2 className="text-xl font-bold text-green-800 mb-4">
            الأحاديث التي ورد فيها هذا اللفظ
            {totalHadiths > 20 && (
              <span className="text-sm font-normal text-gray-500 mr-2">
                (عرض أول 20 من {totalHadiths.toLocaleString('ar')})
              </span>
            )}
          </h2>
          <div className="grid gap-4">
            {hadiths.map(h => (
              <Link
                key={h.main_id}
                href={`/hadith/${h.main_id}`}
                className="block bg-white rounded-lg border border-gray-100 px-5 py-4 hover:shadow-md hover:border-green-200 transition-all"
              >
                <div className="text-xs text-green-700 mb-2 font-semibold">
                  {h.book_name}
                </div>
                <p className="text-gray-800 text-sm leading-relaxed line-clamp-4">
                  {stripTags(h.tarf).slice(0, 300) || '...'}
                </p>
                {(h.part_num > 0 || h.page_num > 0) && (
                  <span className="text-xs text-gray-400 mt-2 block">
                    ج{h.part_num} ص{h.page_num}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-500 py-12">
          لا توجد أحاديث مرتبطة بهذا اللفظ
        </div>
      )}
    </div>
  )
}
