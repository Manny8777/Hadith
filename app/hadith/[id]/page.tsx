export const dynamic = 'force-dynamic'
import pool from '@/lib/db'
import { notFound } from 'next/navigation'
import HadithSidebarLayout from '@/app/components/HadithSidebarLayout'
import type { NarratorInChain, Chain } from '@/app/components/HadithSidebarLayout'
import ServicesBadges from '@/app/components/ServicesBadges'
import TakhrijSection from '@/app/components/TakhrijSection'

export default async function HadithPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const mainId = parseInt(id)

  const [hadithRes, judgmentsRes, isnadRes, takhrijBooksRes, subjectsRes, relatedRes, takhrijSummaryRes] = await Promise.all([
    pool.query(
      `SELECT h.*, b.title as book_title, b.takhrij_author, b.takhrij_death
       FROM hadith_toc h
       JOIN books b ON h.book_id = b.id
       WHERE h.main_id = $1`,
      [mainId]
    ),
    pool.query(
      `SELECT j.say_text, n.name as scientist_name, n.abb_name,
              CASE
                WHEN j.say_text ~* 'صحيح' THEN 'صحيح'
                WHEN j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح' THEN 'حسن'
                WHEN j.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
                ELSE NULL
              END as grade_class
       FROM hadith_judgments j
       LEFT JOIN narrators n ON j.scientist_id = n.id
       WHERE j.hadith_id = $1
       ORDER BY CASE
         WHEN j.say_text ~* 'صحيح' THEN 1
         WHEN j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' THEN 2
         WHEN j.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 3
         ELSE 4 END
       LIMIT 30`,
      [mainId]
    ),
    pool.query(
      `SELECT ic.narrator_ids
       FROM isnad_hadiths ih
       JOIN isnad_chains ic ON ih.isnad_id = ic.id
       WHERE ih.hadith_id = $1`,
      [mainId]
    ),
    pool.query(
      `SELECT DISTINCT b.title
       FROM takhrij t
       JOIN books b ON b.id = t.book_id
       WHERE t.group_id = (SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1)
         AND t.hadith_id != $1
       ORDER BY b.title
       LIMIT 20`,
      [mainId]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT si.id, si.title
       FROM hadith_subjects hs
       JOIN subject_items si ON si.id = hs.subject_id
       WHERE hs.paragraph_main_id = $1
       ORDER BY si.left_value
       LIMIT 15`,
      [mainId]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT DISTINCT ht.main_id, ht.tarf, b.title as book_title
       FROM hadith_subjects hs_other
       JOIN hadith_toc ht ON ht.main_id = hs_other.paragraph_main_id
       JOIN books b ON b.id = ht.book_id
       WHERE hs_other.subject_id IN (
         SELECT subject_id FROM hadith_subjects WHERE paragraph_main_id = $1
       )
       AND hs_other.paragraph_main_id != $1
       LIMIT 8`,
      [mainId]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT
         (SELECT COALESCE(ic.narrator_id_array[1], 0)
          FROM isnad_hadiths ih2
          JOIN isnad_chains ic ON ic.id = ih2.isnad_id
          WHERE ih2.hadith_id = $1 AND ic.narrator_id_array[1] IS NOT NULL
          LIMIT 1) as current_companion,
         COUNT(DISTINCT t.hadith_id)::int as total_takhrij
       FROM takhrij t
       WHERE t.group_id = (SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1)
         AND t.hadith_id != $1`,
      [mainId]
    ).then(async (r) => {
      const currentCompanion = r.rows[0]?.current_companion
      const total = r.rows[0]?.total_takhrij || 0
      if (!currentCompanion || total === 0) return { mutabaatCount: 0, shawahidCount: total }
      const compRes = await pool.query(
        `SELECT
           COUNT(DISTINCT CASE WHEN comp.companion_id = $2 THEN t.hadith_id END)::int as mutabaat,
           COUNT(DISTINCT CASE WHEN comp.companion_id != $2 OR comp.companion_id IS NULL THEN t.hadith_id END)::int as shawahid
         FROM takhrij t
         JOIN hadith_toc ht ON ht.main_id = t.hadith_id
         LEFT JOIN LATERAL (
           SELECT ic.narrator_id_array[1] as companion_id
           FROM isnad_hadiths ih2
           JOIN isnad_chains ic ON ic.id = ih2.isnad_id
           WHERE ih2.hadith_id = t.hadith_id AND ic.narrator_id_array[1] IS NOT NULL
           LIMIT 1
         ) comp ON true
         WHERE t.group_id = (SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1)
           AND t.hadith_id != $1`,
        [mainId, currentCompanion]
      )
      return { mutabaatCount: compRes.rows[0]?.mutabaat || 0, shawahidCount: compRes.rows[0]?.shawahid || 0 }
    }).catch(() => ({ mutabaatCount: 0, shawahidCount: 0 })),
  ])

  if (!hadithRes.rows[0]) notFound()
  const h = hadithRes.rows[0]

  // Build narrator chains
  const chains: Chain[] = []
  if (isnadRes.rows.length > 0) {
    const allIds = new Set<number>()
    const chainIdArrays: number[][] = []
    for (const row of isnadRes.rows) {
      const ids = (row.narrator_ids as string).trim().split(/\s+/).filter(Boolean).map(Number)
      chainIdArrays.push(ids)
      ids.forEach(nid => allIds.add(nid))
    }
    if (allIds.size > 0) {
      const narRes = await pool.query<NarratorInChain>(
        `SELECT id, name, abb_name, martaba_ibn_hajar, martaba_zahabi, is_companion, tabaqa, death_year_num
         FROM narrators WHERE id = ANY($1)`,
        [Array.from(allIds)]
      )
      const narMap: Record<number, NarratorInChain> = {}
      narRes.rows.forEach(n => { narMap[n.id] = n })

      const seenChains = new Set<string>()
      for (const ids of chainIdArrays) {
        const key = ids.join('-')
        if (seenChains.has(key)) continue
        seenChains.add(key)
        const narrators = ids.map(nid => narMap[nid] || {
          id: nid, name: `[${nid}]`, abb_name: null,
          martaba_ibn_hajar: null, martaba_zahabi: null,
          is_companion: false, tabaqa: null, death_year_num: null,
        })
        chains.push({ narrators })
      }
    }
  }

  // Common narrators across all chains
  let commonNarrators: NarratorInChain[] = []
  if (chains.length > 1) {
    const idSets = chains.map(c => new Set(c.narrators.map(n => n.id)))
    const sharedIds = Array.from(idSets[0]).filter(id => idSets.every(s => s.has(id)))
    if (sharedIds.length > 0) {
      const narMap: Record<number, NarratorInChain> = {}
      chains[0].narrators.forEach(n => { narMap[n.id] = n })
      commonNarrators = sharedIds.map(id => narMap[id]).filter(Boolean)
    }
  }

  const takhrijBooks = (takhrijBooksRes as { rows: Array<{ title: string }> }).rows.map(r => r.title)
  const takhrijSummary = takhrijSummaryRes as { mutabaatCount: number; shawahidCount: number }
  const subjects = (subjectsRes as { rows: Array<{ id: number; title: string }> }).rows
  const relatedHadiths = (relatedRes as { rows: Array<{ main_id: number; tarf: string | null; book_title: string }> }).rows
  const judgments = judgmentsRes.rows.map(j => ({
    say_text: j.say_text as string,
    scientist_name: (j.scientist_name as string | null) || null,
    abb_name: (j.abb_name as string | null) || null,
    grade_class: (j as { grade_class?: string }).grade_class || null,
  }))

  return (
    <HadithSidebarLayout
      hadithId={mainId}
      hadith={h}
      chains={chains}
      commonNarrators={commonNarrators}
      judgments={judgments}
      subjects={subjects}
      relatedHadiths={relatedHadiths}
      takhrijBooks={takhrijBooks}
      takhrijSummary={takhrijSummary}
      servicesBadgesSlot={<ServicesBadges hadithId={mainId} />}
      takhrijSlot={<TakhrijSection hadithId={mainId} />}
    />
  )
}
