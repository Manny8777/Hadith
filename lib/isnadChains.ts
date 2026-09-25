import pool from '@/lib/db'
import type { NarratorInChain, Chain, CriticismGroup } from '@/app/components/HadithSidebarLayout'

/**
 * Build the {chains, narratorCriticism} payload that <IsnadTree> expects for a
 * single hadith (by hadith_toc.main_id). Extracted verbatim from the hadith
 * detail page so the /musnad-musannaf "lens" reuses the exact same isnad logic.
 */
export async function getChainsForHadith(hadithId: number): Promise<{
  chains: Chain[]
  narratorCriticism: Record<number, CriticismGroup[]>
}> {
  const isnadRes = await pool.query<{ narrator_ids: string; isnad_type: number | null; tahdeth_term: string | null }>(
    `SELECT ic.narrator_ids, ih.isnad_type, it.sand_tahdeth AS tahdeth_term
     FROM isnad_hadiths ih
     JOIN isnad_chains ic ON ih.isnad_id = ic.id
     LEFT JOIN isnad_tahdeth it ON it.id = ih.sanad_tahdeth_id
     WHERE ih.hadith_id = $1`,
    [hadithId]
  ).catch(() => ({ rows: [] as Array<{ narrator_ids: string; isnad_type: number | null; tahdeth_term: string | null }> }))

  const chains: Chain[] = []
  if (isnadRes.rows.length > 0) {
    const allIds = new Set<number>()
    const chainRows: Array<{ ids: number[]; tahdethTerm: string | null }> = []
    for (const row of isnadRes.rows) {
      const ids = (row.narrator_ids || '').trim().split(/\s+/).filter(Boolean).map(Number)
      chainRows.push({ ids, tahdethTerm: row.tahdeth_term ?? null })
      ids.forEach(nid => allIds.add(nid))
    }
    if (allIds.size > 0) {
      const [narRes, tahdethTypesRes] = await Promise.all([
        pool.query<NarratorInChain>(
          `SELECT id, name, abb_name, martaba_ibn_hajar, martaba_zahabi, is_companion, tabaqa, death_year_num, death_year
           FROM narrators WHERE id = ANY($1)`,
          [Array.from(allIds)]
        ),
        pool.query<{ id: number; text: string }>(`SELECT id, text FROM isnad_tahdeth_types LIMIT 2000`)
          .catch(() => ({ rows: [] as Array<{ id: number; text: string }> })),
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

  return { chains, narratorCriticism }
}
