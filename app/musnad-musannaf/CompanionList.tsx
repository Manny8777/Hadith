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
}

// strip leading kunya/article tokens so grouping keys off the real first letter
function sectionLetter(name: string): string {
  let s = (name || '').trim()
  // drop leading «ابن / أبو / أم» kunya words
  s = s.replace(/^(?:ابن|أبو|أبا|أبي|أم|بنت)\s+/, '')
  // drop the «ال» definite article
  s = s.replace(/^ال/, '')
  s = s.trim()
  const first = s.charAt(0)
  if (!first) return '#'
  // normalize hamza variants of alef to a single bucket
  if (/[أإآا]/.test(first)) return 'ا'
  if (first === 'ة') return 'ه'
  if (first === 'ى') return 'ي'
  return first
}

export default function CompanionList({ companions }: { companions: CompanionRow[] }) {
  const [filter, setFilter] = useState('')

  const groups = useMemo(() => {
    const q = filter.trim()
    const list = q ? companions.filter(c => c.name.includes(q)) : companions
    const map = new Map<string, CompanionRow[]>()
    for (const c of list) {
      const letter = sectionLetter(c.name)
      const bucket = map.get(letter)
      if (bucket) bucket.push(c)
      else map.set(letter, [c])
    }
    // sort section headers by Arabic collation
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'))
  }, [companions, filter])

  const totalShown = groups.reduce((sum, [, rows]) => sum + rows.length, 0)

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
        {filter.trim() && (
          <span className="text-xs text-gray-500">{totalShown} نتيجة</span>
        )}
      </div>

      {totalShown === 0 ? (
        <div className="ui-prose-block text-sm text-gray-600">لا يوجد صحابي مطابق لبحثك.</div>
      ) : (
        groups.map(([letter, rows]) => (
          <section key={letter} className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="min-w-7 h-7 px-2 rounded-md bg-green-800 text-white flex items-center justify-center text-sm font-bold"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {letter}
              </span>
              <span className="flex-1 h-px bg-[var(--color-border)]" />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {rows.map(c => (
                <div key={c.id} className="ui-card !p-3 flex items-center gap-3">
                  {c.seq != null && (
                    <span
                      className="shrink-0 text-2xl font-bold text-green-100 leading-none"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
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
                        <Link href={`/narrator/${c.narrator_id}`} className="text-[11px] ui-link">
                          ترجمة ↗
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
