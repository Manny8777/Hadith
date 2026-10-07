'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/app/components/Link'
import { api } from '@/lib/useLibrary'
import type { LibraryItem } from '@/lib/library'
import ItemSummary from '../ItemSummary'

interface Props {
  collection: { id: number; title: string; description: string | null; share_token: string | null; list: LibraryItem[] }
}

const EXPORTS: [string, string, string][] = [
  ['bib', 'BibTeX / BibLaTeX', 'LaTeX، Zotero، JabRef'],
  ['ris', 'RIS', 'EndNote، Mendeley، Zotero'],
  ['json', 'CSL-JSON', 'Zotero، Pandoc'],
  ['csv', 'CSV', 'Excel، جداول'],
  ['txt', 'حواشٍ عربية', 'نصّ للصق في Word'],
]

export default function CollectionView({ collection }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(collection.list)
  const [title, setTitle] = useState(collection.title)
  const [description, setDescription] = useState(collection.description ?? '')
  const [editing, setEditing] = useState(false)
  const [share, setShare] = useState(collection.share_token)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')
  const base = `/api/library/collections/${collection.id}`
  const run = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn() } catch (e) { setErr((e as Error).message) } }

  const shareUrl = share ? `${typeof location === 'undefined' ? '' : location.origin}/library/shared/${share}` : ''
  const hadiths = items.filter(i => i.kind === 'hadith').length

  return (
    <div dir="rtl" className="max-w-5xl mx-auto space-y-6">
      <nav className="text-sm sm:text-[1.1rem]"><Link href="/library" className="text-green-700 hover:underline">← مكتبتي</Link></nav>

      <header className="ui-card rounded-2xl p-5 space-y-3">
        {editing ? (
          <form className="space-y-2" onSubmit={e => { e.preventDefault(); run(async () => { await api(base, 'PATCH', { title, description }); setEditing(false); router.refresh() }) }}>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required className="w-full rounded-lg border border-border bg-white px-3 py-2 text-lg sm:text-[1.6rem] font-bold focus:outline-none focus:border-green-600" />
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} rows={3} placeholder="وصف المجموعة…" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm sm:text-[1.15rem] focus:outline-none focus:border-green-600" />
            <div className="flex gap-2 text-sm sm:text-[1.1rem]">
              <button className="rounded-lg bg-green-800 text-white px-4 py-1.5">حفظ</button>
              <button type="button" onClick={() => setEditing(false)} className="text-gray-500 px-2">إلغاء</button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-[2.1rem] font-bold text-green-900">{title}</h1>
              {description && <p className="text-sm sm:text-[1.15rem] text-gray-600 mt-1 whitespace-pre-wrap">{description}</p>}
              <p className="text-xs sm:text-[1rem] text-gray-400 mt-1">{items.length.toLocaleString('ar-EG')} عنصرًا</p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm sm:text-[1.05rem] text-gray-600 hover:border-green-600">تعديل</button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center text-sm sm:text-[1.1rem] pt-2 border-t border-border">
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg bg-green-800 text-white px-3 py-1.5 [&::-webkit-details-marker]:hidden" aria-disabled={!hadiths}>تصدير المراجع ▾</summary>
            <div className="absolute z-30 mt-1 start-0 w-72 rounded-xl border border-border bg-surface shadow-xl p-2">
              {hadiths ? EXPORTS.map(([f, name, hint]) => (
                <a key={f} href={`${base}/export?format=${f}`} className="flex justify-between gap-2 rounded-lg px-3 py-2 hover:bg-surface-sunken/60">
                  <span className="font-semibold text-gray-800" dir="ltr">{name}</span><span className="text-xs text-gray-500">{hint}</span>
                </a>
              )) : <p className="px-3 py-2 text-gray-500 text-xs">لا أحاديث في المجموعة بعد</p>}
              <p className="px-3 pt-2 text-[11px] sm:text-[0.95rem] text-gray-400">الأحاديث بترتيب المجموعة، مع ملاحظاتك ووسومك</p>
            </div>
          </details>
          {share ? (
            <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-1.5">
              <span className="text-green-800">مُشارَكة للقراءة</span>
              <button type="button" className="underline text-green-800" onClick={() => { navigator.clipboard?.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? '✓ نُسخ الرابط' : 'نسخ الرابط'}</button>
              <button type="button" className="text-gray-500 hover:text-red-700" onClick={() => run(async () => { await api(`${base}/share`, 'POST', { on: false }); setShare(null) })}>إيقاف</button>
            </span>
          ) : (
            <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-gray-700 hover:border-green-600"
              title="رابط يقرأ به غيرك المجموعة وملاحظاتك عليها، دون أن يعدّلها"
              onClick={() => run(async () => { const r = await api<{ share_token: string }>(`${base}/share`, 'POST', { on: true }); setShare(r.share_token) })}>
              مشاركة برابط
            </button>
          )}
          <button type="button" className="ms-auto text-gray-400 hover:text-red-700"
            onClick={() => { if (confirm('حذف المجموعة؟ تبقى ملاحظاتك على الأحاديث في مكتبتك.')) run(async () => { await api(base, 'DELETE'); router.push('/library') }) }}>
            حذف المجموعة
          </button>
        </div>
        {share && <p className="text-xs sm:text-[1rem] text-gray-500">من معه الرابط يرى عناصر المجموعة وملاحظاتك ووسومك عليها، ولا يستطيع تعديلها.</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </header>

      {items.length === 0 ? (
        <div className="ui-card rounded-2xl p-6 text-sm sm:text-[1.2rem] text-gray-600 leading-relaxed">
          المجموعة فارغة. أضف إليها من زرّ «☆ حفظ» في صفحة أي حديث، أو في نتائج البحث، أو في صفحة الراوي.
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li key={it.id} className="ui-card rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-7 text-center text-sm sm:text-[1.1rem] text-gray-400 pt-0.5 tabular-nums">{(i + 1).toLocaleString('ar-EG')}</span>
                <div className="flex-1 min-w-0"><ItemSummary item={it} /></div>
                <div className="shrink-0 flex items-center gap-1 text-gray-400">
                  <button type="button" aria-label="أعلى" disabled={i === 0} className="w-8 h-8 rounded hover:bg-surface-sunken disabled:opacity-30"
                    onClick={() => run(async () => { await api(`${base}/items`, 'PATCH', { itemId: it.id, direction: 'up' }); const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setItems(n) })}>↑</button>
                  <button type="button" aria-label="أسفل" disabled={i === items.length - 1} className="w-8 h-8 rounded hover:bg-surface-sunken disabled:opacity-30"
                    onClick={() => run(async () => { await api(`${base}/items`, 'PATCH', { itemId: it.id, direction: 'down' }); const n = [...items]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setItems(n) })}>↓</button>
                  <button type="button" aria-label="إزالة" className="w-8 h-8 rounded hover:bg-red-50 hover:text-red-700"
                    onClick={() => run(async () => { await api(`${base}/items?kind=${it.kind}&ref=${encodeURIComponent(it.ref)}`, 'DELETE'); setItems(items.filter(x => x.id !== it.id)) })}>✕</button>
                </div>
              </div>
              <NoteEditor item={it} onSaved={(note, tags) => setItems(items.map(x => x.id === it.id ? { ...x, note, tags } : x))} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function NoteEditor({ item, onSaved }: { item: LibraryItem; onSaved: (note: string, tags: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(item.note ?? '')
  const [tags, setTags] = useState(item.tags.join('، '))
  const [busy, setBusy] = useState(false)
  if (!open) {
    return (
      <div className="ms-10 mt-2">
        {item.note && <p className="text-sm sm:text-[1.15rem] text-gray-700 whitespace-pre-wrap bg-blue-50/60 rounded-lg px-3 py-2">{item.note}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs sm:text-[1rem]">
          {item.tags.map(t => <Link key={t} href={`/library?q=${encodeURIComponent(t)}`} className="text-gray-500 hover:text-green-700">#{t}</Link>)}
          {(item.kind === 'hadith' || item.kind === 'narrator') && (
            <button type="button" onClick={() => setOpen(true)} className="text-blue-700 hover:underline">{item.note || item.tags.length ? 'تعديل الملاحظة' : '+ ملاحظة / وسوم'}</button>
          )}
        </div>
      </div>
    )
  }
  return (
    <form className="ms-10 mt-2 space-y-2" onSubmit={async e => {
      e.preventDefault(); setBusy(true)
      const t = tags.split(/[,،]/).map(s => s.trim()).filter(Boolean)
      try { await api('/api/library/notes', 'PUT', { kind: item.kind, ref: item.ref, body: note, tags: t }); onSaved(note, t); setOpen(false) } finally { setBusy(false) }
    }}>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={20000} autoFocus placeholder="ملاحظتك البحثية…"
        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm sm:text-[1.15rem] focus:outline-none focus:ring-2 focus:ring-blue-300" />
      <input value={tags} onChange={e => setTags(e.target.value)} placeholder="وسوم مفصولة بفواصل"
        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm sm:text-[1.1rem] focus:outline-none focus:ring-2 focus:ring-blue-300" />
      <div className="flex gap-2 text-sm sm:text-[1.05rem]">
        <button disabled={busy} className="rounded-lg bg-blue-700 text-white px-3 py-1.5 disabled:opacity-50">حفظ</button>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-500 px-2">إلغاء</button>
      </div>
    </form>
  )
}
