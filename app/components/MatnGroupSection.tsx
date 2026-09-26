import pool from '@/lib/db'
import Link from 'next/link'
import CollapsibleSection from './CollapsibleSection'
import Chips from './Chips'

interface GroupMember {
  hadith_id: number
  book_name: string
  tarf: string | null
  part_num: number | null
  page_num: number | null
}

export default async function MatnGroupSection({ hadithId }: { hadithId: number }) {
  const groupRes = await pool.query<{ group_id: number }>(
    `SELECT group_id FROM hadith_group_matn WHERE hadith_main_id = $1 LIMIT 1`,
    [hadithId]
  ).catch(() => ({ rows: [] }))

  const groupId = groupRes.rows[0]?.group_id ?? null
  if (!groupId) return null

  const membersRes = await pool.query<GroupMember>(
    `SELECT DISTINCT ON (gm.hadith_main_id)
            gm.hadith_main_id AS hadith_id, ht.book_name, ht.tarf, ht.part_num, ht.page_num
     FROM hadith_group_matn gm
     JOIN hadith_toc ht ON ht.main_id = gm.hadith_main_id
     WHERE gm.group_id = $1 AND gm.hadith_main_id != $2
     ORDER BY gm.hadith_main_id, ht.book_id, ht.part_num NULLS LAST, ht.page_num NULLS LAST
     LIMIT 20`,
    [groupId, hadithId]
  ).catch(() => ({ rows: [] }))

  const members = membersRes.rows
  if (members.length === 0) return null

  return (
    <CollapsibleSection
      id="matn-group"
      label="روايات بنفس المتن"
      badges={<Chips chips={[{ text: `${members.length} مصدر` }]} />}
      sub={`روايات بنفس المتن في ${members.length} مصدر آخر`}
    >
      <div className="flex flex-wrap gap-2">
        {members.map(m => (
          <Link
            key={m.hadith_id}
            href={`/hadith/${m.hadith_id}`}
            className="inline-flex flex-col items-start bg-green-50 border border-green-200 rounded-lg px-3 py-2 hover:bg-green-100 hover:border-green-300 transition-colors max-w-xs"
            dir="rtl"
          >
            <span className="text-xs font-semibold text-green-800">{m.book_name}</span>
            {m.tarf && (
              <span className="text-xs text-gray-600 mt-0.5 line-clamp-2 leading-relaxed font-arabic">
                {m.tarf.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)}
              </span>
            )}
            {(m.part_num || m.page_num) && (
              <span className="text-[10px] text-gray-400 mt-1">
                {m.part_num ? `ج${m.part_num} ` : ''}{m.page_num ? `ص${m.page_num}` : ''}
              </span>
            )}
          </Link>
        ))}
      </div>
    </CollapsibleSection>
  )
}
