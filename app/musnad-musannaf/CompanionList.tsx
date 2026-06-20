'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

export interface CompanionRow {
  id: number
  seq: number | null
  name: string
  slug: string
  narrator_id: number | null
  n: number
  kind: string | null
  title_page: number | null
}

// major structural headers (مسند الصحابة / أبواب الكنى / مسند النساء …) vs letter dividers (حرف X)
const isMajor = (t: string) => /^(مسند|أبواب|باب)\b/.test((t || '').trim())

function CompanionCard({ c }: { c: CompanionRow }) {
  return (
    <div className="ui-card !p-3 flex items-center gap-3">
      {c.seq != null && (
        <span className="shrink-0 text-2xl font-bold text-green-100 leading-none" style={{ fontFamily: 'var(--font-display)' }}>
          {c.seq}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Link
          href={`/musnad-musannaf/${c.slug}`}
          className="block font-bold text-gray-900 hover:text-green-800 truncate"
          style={{ fontFamily: 'var(--font-display)' }}
          title={c.name}
        >
          {c.name}
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <span className="ui-chip">{c.n} حديث</span>
          {c.narrator_id != null && (
            <Link href={`/narrator/${c.narrator_id}`} className="text-[11px] ui-link">ترجمة ↗</Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CompanionList({ companions }: { companions: CompanionRow[] }) {
  const [filter, setFilter] = useState('')
  const q = filter.trim()

  // walk the book-ordered rows; each `section` row opens a new group of the companions that follow it
  const groups = useMemo(() => {
    const out: { header: CompanionRow | null; items: CompanionRow[] }[] = [{ header: null, items: [] }]
    for (const c of companions) {
      if (c.kind === 'section') out.push({ header: c, items: [] })
      else out[out.length - 1].items.push(c)
    }
    return out.filter(g => g.header || g.items.length)
  }, [companions])

  const shown = useMemo(() => {
    if (!q) return groups
    return groups
      .map(g => ({ ...g, items: g.items.filter(c => c.name.includes(q)) }))
      .filter(g => g.items.length > 0)
  }, [groups, q])

  const total = shown.reduce((s, g) => s + g.items.length, 0)

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="search"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="ابحث باسم الصحابي…"
          className="flex-1 min-w-[220px] px-3.5 py-2 rounded-lg text-sm bg-[var(--color-surface-sunken)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-green-600/30 focus:border-green-600"
        />
        {q && <span className="text-xs text-gray-500">{total} نتيجة</span>}
      </div>

      {total === 0 ? (
        <div className="ui-prose-block text-sm text-gray-600">لا يوجد صحابي مطابق لبحثك.</div>
      ) : (
        shown.map((g, gi) => (
          <section key={gi} className="mb-5">
            {g.header && (
              isMajor(g.header.name) ? (
                <h2
                  className="text-lg font-bold text-green-900 bg-[var(--color-surface-sunken)] border border-[var(--color-border)] rounded-lg px-4 py-2 mb-3"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {g.header.name}
                </h2>
              ) : (
                <div className="flex items-center gap-2 mb-2">
                  <span className="min-w-7 h-7 px-2 rounded-md bg-green-800 text-white flex items-center justify-center text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                    {g.header.name.replace(/^حرف\s+/, '')}
                  </span>
                  <span className="flex-1 h-px bg-[var(--color-border)]" />
                </div>
              )
            )}
            {g.items.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {g.items.map(c => <CompanionCard key={c.id} c={c} />)}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  )
}
