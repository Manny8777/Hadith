import type { ReactNode } from 'react'
import { stripTashkeel } from '@/lib/ghareeb'

// The tarf (the hadith's opening, as the takhrij books cite it) is shown inside the matn as a faint
// highlight rather than repeated beside it. It links to a tarf-only search for the other narrations
// that open the same way.

export type Range = [number, number]

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Where the tarf sits in the displayed matn (with or without tashkeel), or null. */
export function findTarfRange(display: string, tarf: string, showTashkeel: boolean): Range | null {
  const t = (showTashkeel ? tarf : stripTashkeel(tarf)).trim()
  if (!t) return null
  const i = display.indexOf(t)
  if (i !== -1) return [i, i + t.length]
  // Fall back to the same words with any spacing between them
  const words = t.split(/\s+/).filter(Boolean).map(escapeRegExp)
  if (words.length === 0) return null
  const m = new RegExp(words.join('\\s+')).exec(display)
  return m ? [m.index, m.index + m[0].length] : null
}

function tarfHref(tarf: string) {
  const q = stripTashkeel(tarf).replace(/[^ء-ي\s]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ')
  return `/search?q=${encodeURIComponent(q)}&search_scope=tarf`
}

/** A slice of the matn (starting at `offset` in the displayed text), with the part inside the tarf highlighted. */
export function withTarf(text: string, offset: number, range: Range | null, tarf: string, key: string): ReactNode[] {
  if (!range) return [text]
  const s = Math.max(range[0] - offset, 0)
  const e = Math.min(range[1] - offset, text.length)
  if (s >= e) return [text]
  const out: ReactNode[] = []
  if (s > 0) out.push(text.slice(0, s))
  out.push(
    <a key={`tarf-${key}`} href={tarfHref(tarf)} className="hadith-tarf" title="طرف الحديث — ابحث عن الروايات التي تبدأ به">
      {text.slice(s, e)}
    </a>
  )
  if (e < text.length) out.push(text.slice(e))
  return out
}
