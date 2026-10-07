'use client'
// A private research note and tags on a hadith (or a narrator): in the reader's account when signed
// in (lib/library.ts — on every device, in «مكتبتي» and its exports), otherwise in this browser.
import { useState, useEffect, useRef } from 'react'
import UiIcon from './UiIcon'
import Link from '@/app/components/Link'
import { api, useMe } from '@/lib/useLibrary'

const NOTES_KEY = 'hadith_notes'
const TAGS_KEY = 'hadith_tags'
const localGet = (key: string): Record<string, string> => { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } }
function localSave(key: string, id: string, value: string) {
  const all = localGet(key)
  if (value.trim()) all[id] = value; else delete all[id]
  try { localStorage.setItem(key, JSON.stringify(all)) } catch {}
}

interface Props { hadithId?: number; kind?: 'hadith' | 'narrator'; itemRef?: string }

export default function HadithNote({ hadithId, kind = 'hadith', itemRef }: Props) {
  const ref = itemRef ?? String(hadithId)
  const me = useMe()
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<'' | 'saving' | 'saved' | 'error'>('')
  const [err, setErr] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (me === undefined) return
    if (me) {
      api<{ note: { body: string; tags: string[] } | null }>(`/api/library/state?kind=${kind}&ref=${encodeURIComponent(ref)}`)
        .then(s => { setNote(s.note?.body ?? ''); setTags((s.note?.tags ?? []).join('، ')); if (s.note?.body) setOpen(true) })
        .catch(() => {})
    } else if (kind === 'hadith') {
      const n = localGet(NOTES_KEY)[ref] ?? ''
      setNote(n); setTags(localGet(TAGS_KEY)[ref] ?? '')
      if (n) setOpen(true)
    }
  }, [me, kind, ref])

  useEffect(() => { if (open && taRef.current && !note) taRef.current.focus() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(body = note, tagText = tags) {
    setStatus('saving'); setErr('')
    try {
      if (me) {
        await api('/api/library/notes', 'PUT', { kind, ref, body, tags: tagText.split(/[,،]/).map(t => t.trim()).filter(Boolean) })
      } else {
        localSave(NOTES_KEY, ref, body); localSave(TAGS_KEY, ref, tagText)
      }
      setStatus('saved'); setTimeout(() => setStatus(''), 1500)
    } catch (e) { setStatus('error'); setErr((e as Error).message) }
  }

  if (me === undefined || (me === null && kind !== 'hadith')) return null
  const hasNote = note.trim().length > 0

  return (
    <div className={open ? 'basis-full order-last text-right' : ''}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          hasNote
            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
            : 'bg-white text-gray-500 border-gray-200 hover:border-blue-200 hover:text-blue-600'
        }`}
      >
        <UiIcon name="pen" size={14} className="inline-block align-[-3px] ml-1" />
        {hasNote ? `ملاحظة (${note.trim().slice(0, 20)}…)` : 'إضافة ملاحظة بحثية'}
      </button>

      {open && (
        <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
          <p className="text-xs text-blue-700 mb-2 font-medium">
            {me ? 'ملاحظتك البحثية — في حسابك، تظهر في «مكتبتي» وفي التصدير' : <>ملاحظتك البحثية — محفوظة في هذا المتصفح فقط · <Link href="/login" className="underline">سجّل الدخول</Link> لتُحفظ في حسابك</>}
          </p>
          <textarea
            ref={taRef}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="سجّل ملاحظاتك ونتائجك وتحليلك لهذا الحديث..."
            rows={4}
            maxLength={20000}
            className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
            dir="rtl"
          />
          <input
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="وسوم، مفصولة بفواصل: النية، الأعمال، ماجستير"
            className="mt-2 w-full border border-blue-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
            dir="rtl"
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-2 items-center">
              <button
                onClick={() => save()}
                disabled={status === 'saving'}
                className="text-xs px-3 py-1.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-60"
              >
                {status === 'saved' ? '✓ محفوظة' : status === 'saving' ? 'يُحفظ…' : 'حفظ الملاحظة'}
              </button>
              {(hasNote || tags.trim()) && (
                <button
                  onClick={() => { setNote(''); setTags(''); save('', '') }}
                  className="text-xs px-3 py-1.5 bg-white text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  حذف
                </button>
              )}
              {err && <span className="text-xs text-red-600">{err}</span>}
            </div>
            <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">إغلاق</button>
          </div>
        </div>
      )}
    </div>
  )
}
