import { cache, Suspense, type ReactNode } from 'react'
import pool from '@/lib/db'
import { INLINE_SERVICE_CONFIGS } from './HadithServiceSection'
import Chips, { type Chip } from './Chips'

// Counts shown beside each collapsed section's title on the hadith page, so readers see what a
// section holds before opening it. The bodies load their data on first open; these are cheap COUNT
// versions of the same queries (see the matching /api/hadith/[id]/* routes), run once per request.

// Same rule as NarratorsByRegionInline
function primaryCity(living: string | null, birth: string | null): string {
  const raw = (living || birth || '').trim()
  if (!raw) return ''
  return raw.split('،')[0].replace(/قال.*?:/g, '').trim()
}

const fetchSectionChips = cache(async (hadithId: number): Promise<Record<string, Chip[]>> => {
  const empty = { rows: [] as never[] }
  const [commentaryRes, groupRes, witnessesRes, narratorsRes, quranRes] = await Promise.all([
    // /api/hadith/[id]/commentary — per service type (content capped at 100 there)
    pool.query<{ type_id: number; n: number; books: number }>(
      `SELECT hsl.type_id, COUNT(*)::int AS n, COUNT(DISTINCT hsc.book_id)::int AS books
       FROM hadith_service_links hsl
       JOIN hadith_service_content hsc ON hsc.id = hsl.service_content_id
       WHERE hsl.hadith_id = $1
       GROUP BY hsl.type_id`,
      [hadithId]
    ).catch(() => empty),
    // /api/hadith/[id]/matn-similarity (cap 150, source included) and /parallel (cap 200, source excluded)
    pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
       FROM takhrij t
       JOIN hadith_toc h ON h.main_id = t.hadith_id
       JOIN books b ON b.id = t.book_id
       WHERE t.group_id = (SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1)
         AND t.hadith_id <> $1`,
      [hadithId]
    ).catch(() => empty),
    // /api/hadith/[id]/witnesses-inline — one row per companion (or per hadith without one), cap 60
    pool.query<{ paths: number; companions: number; unknown: boolean }>(
      `SELECT COUNT(DISTINCT COALESCE(comp.id::text, t2.hadith_id::text))::int AS paths,
              COUNT(DISTINCT comp.id)::int AS companions,
              COALESCE(bool_or(comp.id IS NULL), false) AS unknown
       FROM takhrij t2
       JOIN hadith_toc ht ON ht.main_id = t2.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
       LEFT JOIN isnad_hadiths ih2 ON ih2.hadith_id = t2.hadith_id
       LEFT JOIN isnad_chains ic2 ON ic2.id = ih2.isnad_id
       LEFT JOIN narrators comp ON comp.id = ic2.narrator_id_array[1] AND comp.is_companion = true
       WHERE t2.group_id = (SELECT group_id FROM takhrij WHERE hadith_id = $1 AND group_id IS NOT NULL LIMIT 1)
         AND t2.hadith_id != $1`,
      [hadithId]
    ).catch(() => empty),
    // /api/hadith/[id]/narrators-by-region
    pool.query<{ living_city: string | null; birth_city: string | null }>(
      `SELECT DISTINCT ON (n.id) n.living_city, n.birth_city
       FROM isnad_hadiths ih
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       JOIN narrators n ON n.id = ANY(ic.narrator_id_array)
       WHERE ih.hadith_id = $1
       ORDER BY n.id`,
      [hadithId]
    ).catch(() => empty),
    // /api/hadith/[id]/quran-refs
    pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT DISTINCT q.sura, q.aya
         FROM hadith_judgment_hits hjh
         JOIN hadith_judgment_links hjl ON hjl.say_id = hjh.say_id AND hjl.is_book_toc = false
         JOIN hadith_service_content jlc ON jlc.id = hjl.service_main_id
         JOIN hadith_service_content anc
           ON anc.book_id = jlc.book_id
           AND anc.left_value <= jlc.left_value
           AND anc.right_value >= jlc.right_value
         JOIN quran_ayat_services q ON q.service_main_id = anc.id
         WHERE hjh.hadith_id = $1
       ) x`,
      [hadithId]
    ).catch(() => empty),
  ])

  const chips: Record<string, Chip[]> = {}

  const byType = new Map(commentaryRes.rows.map(r => [Number(r.type_id), r]))
  for (const cfg of INLINE_SERVICE_CONFIGS) {
    if (cfg.kind !== 'commentary' || cfg.commentaryType == null) continue
    const r = byType.get(cfg.commentaryType)
    if (r && r.n > 0) chips[cfg.id] = [{ text: `${Math.min(r.n, 100)} نص في ${r.books} كتاب` }]
  }

  const others = groupRes.rows[0]?.n ?? 0
  if (others > 0) {
    chips['matn-similarity'] = [{ text: `${Math.min(others, 149)} رواية للمقارنة` }]
    chips['variants'] = [{ text: `${Math.min(others, 200) + 1} رواية` }]
  }

  const w = witnessesRes.rows[0]
  if (w && w.paths > 0) {
    chips['svc-shawahed'] = [
      { text: `${Math.min(w.paths, 60)} طريق موازٍ` },
      { text: `${w.companions + (w.unknown ? 1 : 0)} مجموعة`, tone: 'violet' },
    ]
  }

  if (narratorsRes.rows.length > 0) {
    const cities = new Set(narratorsRes.rows.map(n => primaryCity(n.living_city, n.birth_city)).filter(Boolean))
    chips['svc-countries'] = [
      { text: `${narratorsRes.rows.length} راوٍ` },
      ...(cities.size > 0 ? [{ text: `${cities.size} بلد`, tone: 'info' as const }] : []),
    ]
  }

  const ayat = quranRes.rows[0]?.n ?? 0
  if (ayat > 0) chips['svc-kerat'] = [{ text: `${ayat} آية` }]

  return chips
})

async function SectionBadges({ hadithId, sectionId }: { hadithId: number; sectionId: string }) {
  const chips = (await fetchSectionChips(hadithId))[sectionId]
  return chips ? <Chips chips={chips} /> : null
}

// Badge slots for the sections whose counts need the database, keyed by section id. Each streams
// in on its own (Suspense) so the page never waits on these counts.
export function sectionBadgeSlots(hadithId: number, sectionIds: string[]): Record<string, ReactNode> {
  return Object.fromEntries(sectionIds.map(id => [
    id,
    <Suspense key={id} fallback={null}><SectionBadges hadithId={hadithId} sectionId={id} /></Suspense>,
  ]))
}
