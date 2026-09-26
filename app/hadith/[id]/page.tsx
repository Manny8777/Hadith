export const dynamic = 'force-dynamic'
import pool from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import HadithSidebarLayout from '@/app/components/HadithSidebarLayout'
import type { NarratorInChain, Chain, CriticismGroup } from '@/app/components/HadithSidebarLayout'
import TakhrijSection, { TakhrijBadges } from '@/app/components/TakhrijSection'
import MatnGroupSection from '@/app/components/MatnGroupSection'
import { sectionBadgeSlots } from '@/app/components/SectionBadges'
import { activeServiceSections, INLINE_SERVICE_CONFIGS } from '@/app/components/HadithServiceSection'
import DorarJudgment from '@/app/components/DorarJudgment'
import type { DorarRuling } from '@/app/components/DorarJudgment'
import { DORAR_SOURCES, dorarKey, matnSearchWords, dorarSearchUrl } from '@/lib/dorar'
import {
  parseSanadNarratorSegments,
  sanadSegmentsHaveNarrators,
  type SanadNarratorPreview,
} from '@/lib/sanadNarrators'

export default async function HadithPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const mainId = parseInt(id)

  const [hadithRes, judgmentsRes, sourcesRes, isnadRes, takhrijBooksRes, subjectsRes, relatedRes, takhrijSummaryRes] = await Promise.all([
    pool.query(
      `SELECT h.*, b.title as book_title, b.takhrij_author, b.takhrij_death, b.print1_edition,
              hs.takhreg, hs.compound_matn, hs.rwah, hs.asnad, hs.shawahed,
              hs.ghareeb, hs.degree, hs.sharh, hs.subjects, hs.tafsser,
              hs.biography, hs.medicine, hs.feqh, hs.asbab, hs.mokhtalaf,
              hs.amthal, hs.motawater,
              hs.countries, hs.modrag, hs.kerat, hs.proper_name, hs.matn_comparison
       FROM hadith_toc h
       JOIN books b ON h.book_id = b.id
       LEFT JOIN hadith_services hs ON hs.hadith_id = h.main_id
       WHERE h.main_id = $1`,
      [mainId]
    ),
    pool.query(
      `SELECT j.id as say_id, j.legacy_say_id, j.say_text, j.scientist_id,
              n.name as scientist_name, n.abb_name,
              n.death_year_num, n.martaba_ibn_hajar,
              CASE
                WHEN j.say_text ~* 'صحيح' THEN 'صحيح'
                WHEN j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح' THEN 'حسن'
                WHEN j.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
                ELSE NULL
              END as grade_class
       FROM hadith_judgments j
       LEFT JOIN narrators n ON j.scientist_id = n.id
       WHERE j.hadith_id = $1
       ORDER BY n.death_year_num ASC NULLS LAST
       LIMIT 300`,
      [mainId]
    ),
    pool.query(
      // The original prints each saying together with the source it is linked to (SayLink →
      // ServiceMainID). hadith_judgment_links holds exactly those links, per saying, so the book no
      // longer has to be guessed from a death year or a ربط attribute and then assigned positionally.
      `SELECT DISTINCT ON (jh.say_id)
              jh.say_id,
              hjl.service_main_id, hsc.book_name, hsc.part_num, hsc.page_num
       FROM hadith_judgment_hits jh
       JOIN hadith_judgment_links hjl ON hjl.say_id = jh.say_id AND hjl.is_book_toc = false
       JOIN hadith_service_content hsc ON hsc.id = hjl.service_main_id
       WHERE jh.hadith_id = $1
       ORDER BY jh.say_id, hjl.service_main_id`,
      [mainId]
    ),
    pool.query(
      `SELECT ic.narrator_ids, ih.isnad_type, it.sand_tahdeth AS tahdeth_term
       FROM isnad_hadiths ih
       JOIN isnad_chains ic ON ih.isnad_id = ic.id
       LEFT JOIN isnad_tahdeth it ON it.id = ih.sanad_tahdeth_id
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
      `SELECT DISTINCT si.id, si.title
       FROM hadith_subjects hs
       JOIN subject_items si ON si.id = hs.subject_id
       WHERE hs.paragraph_main_id = $1
       ORDER BY si.left_value
       LIMIT 300`,
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

  // Parse books_takhrij: space-separated book IDs on hadith_toc
  const booksTakhrijIds = (h.books_takhrij || '').trim().split(/\s+/).map(Number).filter((n: number) => n > 0)
  const booksTakhrijRes = booksTakhrijIds.length > 0
    ? await pool.query<{ id: number; title: string }>(
        `SELECT id, title FROM books WHERE id = ANY($1::int[])`,
        [booksTakhrijIds]
      ).catch(() => ({ rows: [] as Array<{ id: number; title: string }> }))
    : { rows: [] as Array<{ id: number; title: string }> }
  const booksTakhrij = booksTakhrijRes.rows

  // Dominant isnad type (most frequent across chains)
  const isnadTypeCounts: Record<number, number> = {}
  for (const row of isnadRes.rows) {
    const t = row.isnad_type as number | null
    if (t) isnadTypeCounts[t] = (isnadTypeCounts[t] ?? 0) + 1
  }
  const dominantIsnadType: number | null = Object.keys(isnadTypeCounts).length > 0
    ? Number(Object.entries(isnadTypeCounts).sort((a, b) => b[1] - a[1])[0][0])
    : null

  // Build narrator chains
  const chains: Chain[] = []
  if (isnadRes.rows.length > 0) {
    const allIds = new Set<number>()
    const chainRows: Array<{ ids: number[]; tahdethTerm: string | null }> = []
    for (const row of isnadRes.rows) {
      const ids = (row.narrator_ids as string).trim().split(/\s+/).filter(Boolean).map(Number)
      chainRows.push({ ids, tahdethTerm: (row.tahdeth_term as string | null) ?? null })
      ids.forEach(nid => allIds.add(nid))
    }
    if (allIds.size > 0) {
      const [narRes, tahdethTypesRes] = await Promise.all([
        pool.query<NarratorInChain>(
          `SELECT id, name, abb_name, martaba_ibn_hajar, martaba_zahabi, is_companion, tabaqa, death_year_num, death_year
           FROM narrators WHERE id = ANY($1)`,
          [Array.from(allIds)]
        ),
        pool.query<{ id: number; text: string }>(
          `SELECT id, text FROM isnad_tahdeth_types LIMIT 2000`
        ).catch(() => ({ rows: [] as Array<{ id: number; text: string }> })),
      ])
      const narMap: Record<number, NarratorInChain> = {}
      narRes.rows.forEach(n => { narMap[n.id] = n })
      const tahdethTypesMap: Record<number, string> = {}
      tahdethTypesRes.rows.forEach(r => { tahdethTypesMap[r.id] = r.text })

      const seenChains = new Set<string>()
      for (const { ids, tahdethTerm: rawTahdeth } of chainRows) {
        const key = ids.join('-')
        if (seenChains.has(key)) continue
        seenChains.add(key)
        const narrators = ids.map(nid => narMap[nid] || {
          id: nid, name: `[${nid}]`, abb_name: null,
          martaba_ibn_hajar: null, martaba_zahabi: null,
          is_companion: false, tabaqa: null, death_year_num: null, death_year: null,
        })
        // Parse "narrator_id type_id$..." format → per-narrator term + dominant term
        let tahdethTerm: string | null = null
        const narratorTerms: Record<number, string> = {}
        if (rawTahdeth) {
          const counts: Record<number, number> = {}
          for (const seg of rawTahdeth.split('$')) {
            const parts = seg.trim().split(/\s+/)
            if (parts.length >= 2) {
              const narId = parseInt(parts[0], 10)
              const typeId = parseInt(parts[1], 10)
              if (!isNaN(typeId)) {
                counts[typeId] = (counts[typeId] ?? 0) + 1
                const term = tahdethTypesMap[typeId]
                if (!isNaN(narId) && term && !narratorTerms[narId]) narratorTerms[narId] = term
              }
            }
          }
          const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
          tahdethTerm = dominant ? (tahdethTypesMap[parseInt(dominant[0])] ?? null) : null
        }
        chains.push({ narrators, tahdethTerm, narratorTerms })
      }
    }
  }

  // جرح وتعديل for the isnad narrators — show all critics' sayings (not just Ibn Hajar's grade)
  const narratorCriticism: Record<number, CriticismGroup[]> = {}
  if (chains.length > 0) {
    const chainNarIds = Array.from(new Set(chains.flatMap(c => c.narrators.map(n => n.id))))
    if (chainNarIds.length > 0) {
      const critRes = await pool.query<{ narrator_id: number; scientist_name: string | null; scientist_noun_id: number | null; say_text: string | null; garh_label: string | null; say_sort: number }>(
        `SELECT narrator_id, COALESCE(scientist_name, 'غير معروف') AS scientist_name,
                scientist_noun_id, say_text, garh_label, say_sort
         FROM narrator_criticism
         WHERE narrator_id = ANY($1::int[])
         ORDER BY narrator_id, scientist_name, say_sort`,
        [chainNarIds]
      ).catch(() => ({ rows: [] as Array<{ narrator_id: number; scientist_name: string | null; scientist_noun_id: number | null; say_text: string | null; garh_label: string | null; say_sort: number }> }))

      const byNar: Record<number, Record<string, CriticismGroup>> = {}
      for (const r of critRes.rows) {
        if (!r.say_text) continue
        const nid = Number(r.narrator_id)
        const sci = r.scientist_name || 'غير معروف'
        if (!byNar[nid]) byNar[nid] = {}
        if (!byNar[nid][sci]) byNar[nid][sci] = { scientist_name: sci, scientist_noun_id: r.scientist_noun_id, entries: [] }
        byNar[nid][sci].entries.push({ text: r.say_text, garh_label: r.garh_label || null })
      }
      for (const nid of Object.keys(byNar)) narratorCriticism[Number(nid)] = Object.values(byNar[Number(nid)])
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
  // Each saying's source is its own link row (keyed by say_id), so a saying can no longer be shown
  // under a book it is not linked to and the same text can no longer print under three books.
  type SrcRow = { say_id: number; service_main_id: number; book_name: string; part_num: number; page_num: number }
  const sourcesMap = new Map<number, SrcRow>()
  for (const src of (sourcesRes as { rows: SrcRow[] }).rows) {
    sourcesMap.set(Number(src.say_id), src)
  }

  const judgments = judgmentsRes.rows.map(j => {
    const sciId = j.scientist_id != null ? Number(j.scientist_id) : null
    const src: SrcRow | null = j.legacy_say_id != null ? (sourcesMap.get(Number(j.legacy_say_id)) ?? null) : null
    return {
      say_text: j.say_text as string,
      scientist_id: sciId,
      scientist_name: (j.scientist_name as string | null) || null,
      abb_name: (j.abb_name as string | null) || null,
      death_year_num: (j.death_year_num as number | null) || null,
      martaba_ibn_hajar: (j.martaba_ibn_hajar as string | null) || null,
      grade_class: (j as { grade_class?: string }).grade_class || null,
      source_book: src?.book_name ?? null,
      source_part: src?.part_num != null ? Number(src.part_num) : null,
      source_page: src?.page_num != null ? Number(src.page_num) : null,
      source_content_id: src?.service_main_id != null ? Number(src.service_main_id) : null,
    }
  })

  // Extract hadith services flags from the joined row
  const SERVICE_COLUMNS = [
    'takhreg', 'compound_matn', 'rwah', 'asnad', 'shawahed',
    'ghareeb', 'degree', 'sharh', 'subjects', 'tafsser',
    'biography', 'medicine', 'feqh', 'asbab', 'mokhtalaf',
    'amthal', 'motawater',
    'countries', 'modrag', 'kerat', 'proper_name', 'matn_comparison',
  ] as const
  type ServiceKey = typeof SERVICE_COLUMNS[number]
  const hadithServices: Partial<Record<ServiceKey, boolean>> = {}
  for (const col of SERVICE_COLUMNS) {
    if (h[col] === true) hadithServices[col] = true
  }
  // A commentary section needs texts of its type linked to this hadith; the flag alone can be set
  // with none (e.g. tafsser, rwah), which left the section showing only its empty state.
  const linkedTypesRes = await pool.query<{ type_id: number }>(
    `SELECT DISTINCT type_id FROM hadith_service_links WHERE hadith_id = $1`,
    [mainId]
  ).catch(() => ({ rows: [] as Array<{ type_id: number }> }))
  const linkedTypes = new Set(linkedTypesRes.rows.map(r => Number(r.type_id)))
  for (const cfg of INLINE_SERVICE_CONFIGS) {
    if (cfg.kind === 'commentary' && !linkedTypes.has(cfg.commentaryType!)) delete hadithServices[cfg.key as ServiceKey]
  }

  const sanadSegments = parseSanadNarratorSegments(h.content as string)
  const sanadNarratorIds = [
    ...new Set(
      sanadSegments
        .filter(s => s.kind === 'narrator' && s.narratorId)
        .map(s => s.narratorId!)
    ),
  ]
  let sanadNarrators: Record<number, SanadNarratorPreview> = {}
  if (sanadNarratorIds.length > 0) {
    const sanadNarRes = await pool.query<SanadNarratorPreview>(
      `SELECT id, name, abb_name, kunia, tabaqa, death_year, death_year_num,
              martaba_ibn_hajar, martaba_zahabi, is_companion
       FROM narrators WHERE id = ANY($1::int[])`,
      [sanadNarratorIds]
    )
    for (const n of sanadNarRes.rows) sanadNarrators[n.id] = n
  }

  // Musakarat (مشكل) nodes for this hadith — badge linking to the leaf-node issue
  const musakaratRes = await pool.query<{ node_id: number; text: string; is_leaf: boolean }>(
    `SELECT hcd.node_id, ct.text, ct.is_leaf
     FROM hadith_service_links hsl
     JOIN hadith_controversial_descriptions hcd ON hcd.service_main_id = hsl.service_content_id
     JOIN hadith_controversial_tree ct ON ct.id = hcd.node_id
     WHERE hsl.hadith_id = $1
     ORDER BY ct.id
     LIMIT 5`,
    [mainId]
  ).catch(() => ({ rows: [] as Array<{ node_id: number; text: string; is_leaf: boolean }> }))
  const musakaratNodes = musakaratRes.rows

  // Dorar's rulings, fetched offline by scripts/dorar-crawl.mjs (table absent until its first run)
  const dorarSources = DORAR_SOURCES[Number(h.book_id)]
  const dorarNumber = dorarSources ? dorarKey(h.content as string) : null
  let dorarRulings: DorarRuling[] = []
  if (dorarSources && dorarNumber) {
    const rulingsRes = await pool.query<DorarRuling & { dorar_source_id: number | null }>(
      `SELECT source, dorar_number, muhaddith, rawi, hukm, dorar_hash, dorar_source_id
       FROM dorar_rulings WHERE book_id = $1 AND number = $2`,
      [h.book_id, dorarNumber]
    ).catch(() => ({ rows: [] as Array<DorarRuling & { dorar_source_id: number | null }> }))
    // The book's own ruling first, then the later gradings, in DORAR_SOURCES order
    const order = (id: number | null) => { const i = dorarSources.findIndex(s => s.id === id); return i === -1 ? 99 : i }
    dorarRulings = [...rulingsRes.rows].sort((a, b) => order(a.dorar_source_id) - order(b.dorar_source_id))
  }

  return (
    <>
      <HadithSidebarLayout
        relatedTopicsSlot={musakaratNodes.length > 0 && (
        <div className="hadith-related-topics mb-5 flex items-center gap-2 flex-wrap border-t border-border pt-4">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600">
            يُسار إلى شجرة مختلف الحديث
          </span>
          {musakaratNodes.map(n => (
            <Link
              key={n.node_id}
              href={`/topics/contradictions/node/${n.node_id}`}
              className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full border border-amber-200 hover:bg-amber-200"
            >
              {n.text}
            </Link>
          ))}
        </div>
      )}
        hadithId={mainId}
        hadith={h}
        chains={chains}
        narratorCriticism={narratorCriticism}
        commonNarrators={commonNarrators}
        sanadSegments={sanadSegmentsHaveNarrators(sanadSegments) ? sanadSegments : undefined}
        sanadNarrators={sanadNarrators}
        judgments={judgments}
        subjects={subjects}
        relatedHadiths={relatedHadiths}
        takhrijBooks={takhrijBooks}
        takhrijSummary={takhrijSummary}
        booksTakhrij={booksTakhrij}
        hadithServices={hadithServices}
        isnadType={dominantIsnadType}
        matngroupSlot={<MatnGroupSection hadithId={mainId} />}
        takhrijSlot={<TakhrijSection hadithId={mainId} />}
        sectionBadges={{
          ...sectionBadgeSlots(mainId, ['matn-similarity', 'variants', ...activeServiceSections(hadithServices).map(c => c.id)]),
          takhrij: <TakhrijBadges hadithId={mainId} />,
        }}
        dorarSlot={dorarRulings.length > 0 && dorarSources
          ? <DorarJudgment rulings={dorarRulings} searchUrl={dorarSearchUrl(matnSearchWords(h.content as string), dorarSources)} />
          : undefined}
      />
    </>
  )
}
