'use client'
// Highlighting a passage of the sanad or matn, with an optional note (signed-in readers; stored by
// lib/library.ts). Select words in the text → «تظليل» / «تظليل وملاحظة». Highlights are drawn with the
// CSS Custom Highlight API — no change to the page's markup, so the sanad links, gharib words and
// tarf marking underneath keep working. A highlight is anchored by its character offsets in the text
// as shown and by the words quoted, so it is found again after tashkeel is hidden or shown.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, useMe } from '@/lib/useLibrary'

type Part = 'sanad' | 'matn'
interface HL { id: number; part: Part; start_at: number; end_at: number; quote: string; note: string | null }

const SELECTORS: Record<Part, string> = { sanad: '.hadith-sanad', matn: '#matn .hadith-matn' }
const MARKS = /[ً-ٰٟـ]/
const container = (p: Part) => document.querySelector<HTMLElement>(SELECTORS[p])

// The text node and offset at a character position of an element's text
function pointAt(el: HTMLElement, pos: number): [Node, number] | null {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let seen = 0
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const len = n.textContent?.length ?? 0
    if (pos <= seen + len) return [n, pos - seen]
    seen += len
  }
  return null
}
function rangeFor(el: HTMLElement, start: number, end: number): Range | null {
  const a = pointAt(el, start), b = pointAt(el, end)
  if (!a || !b) return null
  const r = document.createRange()
  r.setStart(a[0], a[1]); r.setEnd(b[0], b[1])
  return r
}
// Where the quote is now: at its offsets, else the same words elsewhere, else ignoring tashkeel
function locate(el: HTMLElement, h: HL): [number, number] | null {
  const text = el.textContent ?? ''
  if (text.slice(h.start_at, h.end_at) === h.quote) return [h.start_at, h.end_at]
  const i = text.indexOf(h.quote)
  if (i >= 0) return [i, i + h.quote.length]
  const map: number[] = []
  let bare = ''
  for (let k = 0; k < text.length; k++) if (!MARKS.test(text[k])) { map.push(k); bare += text[k] }
  const q = h.quote.replace(new RegExp(MARKS.source, 'g'), '')
  const j = bare.indexOf(q)
  if (j < 0 || !q) return null
  return [map[j], map[j + q.length - 1] + 1]
}

export default function HadithHighlights({ hadithId }: { hadithId: number }) {
  const me = useMe()
  const [list, setList] = useState<HL[]>([])
  const [bar, setBar] = useState<{ x: number; y: number; part: Part; start: number; end: number; quote: string } | null>(null)
  const [noteFor, setNoteFor] = useState<{ part: Part; start: number; end: number; quote: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')
  const listRef = useRef(list)
  listRef.current = list

  useEffect(() => {
    if (!me) return
    api<{ highlights: HL[] }>(`/api/library/highlights?hadith=${hadithId}`).then(d => setList(d.highlights)).catch(() => {})
  }, [me, hadithId])

  // draw them (and again whenever the text is re-rendered, e.g. tashkeel shown/hidden)
  const paint = useCallback(() => {
    const reg = (globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights
    const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
    if (!reg || !HighlightCtor) return
    const ranges: Range[] = []
    for (const h of listRef.current) {
      const el = container(h.part)
      const at = el && locate(el, h)
      const r = el && at && rangeFor(el, at[0], at[1])
      if (r) ranges.push(r)
    }
    reg.set('hd-user', new HighlightCtor(...ranges))
  }, [])
  useEffect(() => { paint() }, [list, paint])
  useEffect(() => {
    const els = (['sanad', 'matn'] as Part[]).map(container).filter(Boolean) as HTMLElement[]
    const mo = new MutationObserver(() => paint())
    els.forEach(el => mo.observe(el, { childList: true, subtree: true, characterData: true }))
    return () => mo.disconnect()
  }, [paint, me])

  // a selection inside the sanad or matn → the small toolbar above it
  useEffect(() => {
    if (!me) return
    const onUp = () => setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) { setBar(null); return }
      const r = sel.getRangeAt(0)
      for (const part of ['matn', 'sanad'] as Part[]) {
        const el = container(part)
        if (!el || !el.contains(r.commonAncestorContainer)) continue
        const pre = document.createRange()
        pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset)
        const start = pre.toString().length
        const quote = r.toString()
        if (!quote.trim()) return
        const box = r.getBoundingClientRect()
        setBar({ x: box.left + box.width / 2, y: box.top, part, start, end: start + quote.length, quote })
        return
      }
      setBar(null)
    }, 10)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onUp)
    return () => { document.removeEventListener('mouseup', onUp); document.removeEventListener('touchend', onUp) }
  }, [me])

  async function add(sel: { part: Part; start: number; end: number; quote: string }, note: string | null) {
    setErr('')
    try {
      const { id } = await api<{ id: number }>('/api/library/highlights', 'POST', { hadith_id: hadithId, part: sel.part, start_at: sel.start, end_at: sel.end, quote: sel.quote, note })
      setList(l => [...l, { id, part: sel.part, start_at: sel.start, end_at: sel.end, quote: sel.quote, note }])
      setBar(null); setNoteFor(null); setDraft('')
      window.getSelection()?.removeAllRanges()
    } catch (e) { setErr((e as Error).message) }
  }

  if (!me) return null
  const ordered = [...list].sort((a, b) => (a.part === b.part ? a.start_at - b.start_at : a.part === 'sanad' ? -1 : 1))

  return (
    <>
      {bar && !noteFor && (
        <div className="fixed z-50 -translate-x-1/2 -translate-y-full flex gap-1 rounded-lg bg-[#0F3D2E] p-1 shadow-xl font-sans text-xs sm:text-[1.05rem]"
          style={{ left: bar.x, top: bar.y - 8 }} onMouseUp={e => e.stopPropagation()}>
          <button type="button" className="rounded-md px-2.5 py-1.5 text-[#F8F1E4] hover:bg-white/10" onClick={() => add(bar, null)}>تظليل</button>
          <button type="button" className="rounded-md px-2.5 py-1.5 text-[#E6C77A] hover:bg-white/10" onClick={() => { setNoteFor(bar); setBar(null) }}>تظليل وملاحظة</button>
        </div>
      )}
      {noteFor && (
        <form className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 font-sans space-y-2" dir="rtl"
          onSubmit={e => { e.preventDefault(); add(noteFor, draft.trim() || null) }}>
          <p className="text-sm sm:text-[1.15rem] text-gray-700">«{noteFor.quote.trim()}»</p>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} autoFocus maxLength={20000} placeholder="ملاحظتك على هذا الموضع…"
            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm sm:text-[1.15rem] focus:outline-none focus:ring-2 focus:ring-amber-300" />
          <div className="flex gap-2 text-sm sm:text-[1.05rem]">
            <button className="rounded-lg bg-[#0F3D2E] text-white px-3 py-1.5">حفظ</button>
            <button type="button" onClick={() => setNoteFor(null)} className="text-gray-500 px-2">إلغاء</button>
          </div>
        </form>
      )}
      {ordered.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border font-sans" dir="rtl">
          <p className="text-xs sm:text-[1.05rem] font-bold text-gray-500 mb-2">تظليلاتك على هذا الحديث</p>
          <ul className="space-y-2">
            {ordered.map(h => (
              <li key={h.id} className="flex items-start gap-2 text-sm sm:text-[1.15rem]">
                <span className="shrink-0 mt-1 text-[10px] sm:text-[0.9rem] rounded bg-amber-100 text-amber-800 px-1.5">{h.part === 'sanad' ? 'السند' : 'المتن'}</span>
                <div className="flex-1 min-w-0">
                  <span className="bg-amber-100/80 rounded px-1">{h.quote.trim()}</span>
                  {h.note && <p className="text-gray-600 mt-0.5 whitespace-pre-wrap">{h.note}</p>}
                </div>
                <button type="button" aria-label="حذف التظليل" className="shrink-0 text-gray-400 hover:text-red-700 px-1"
                  onClick={async () => { await api(`/api/library/highlights?id=${h.id}`, 'DELETE').catch(() => {}); setList(l => l.filter(x => x.id !== h.id)) }}>✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </>
  )
}
