'use client'
// Once a reader signs in, what they had saved in this browser before (hadiths, notes, tags) moves into
// their account — merged, nothing overwritten — and a short notice says so. Once per account per browser.
import { useEffect, useState } from 'react'
import Link from '@/app/components/Link'
import { api, fetchMe } from '@/lib/useLibrary'

const read = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }

export default function LibraryImport() {
  const [done, setDone] = useState<{ added: number; notesAdded: number } | null>(null)
  useEffect(() => {
    fetchMe().then(async me => {
      if (!me) return
      const flag = `library_imported:${me.email}`
      try { if (localStorage.getItem(flag)) return } catch { return }
      const saved = read('hadith_collection'), notes = read('hadith_notes'), tags = read('hadith_tags')
      const has = (Array.isArray(saved) && saved.length) || (notes && Object.keys(notes).length) || (tags && Object.keys(tags).length)
      if (!has) { try { localStorage.setItem(flag, '1') } catch {} ; return }
      try {
        const r = await api<{ added: number; notesAdded: number }>('/api/library/import', 'POST', { saved, notes, tags })
        try { localStorage.setItem(flag, '1') } catch {}
        if (r.added || r.notesAdded) setDone(r)
      } catch { /* try again next time */ }
    })
  }, [])
  if (!done) return null
  return (
    <div role="status" className="fixed z-[60] bottom-4 inset-x-3 sm:inset-x-auto sm:start-4 sm:max-w-sm rounded-xl bg-[#0F3D2E] text-[#F8F1E4] shadow-2xl p-4 font-sans text-sm">
      <p className="font-bold mb-1">نُقلت محفوظاتك إلى حسابك</p>
      <p className="opacity-85">
        {done.added ? `${done.added.toLocaleString('ar-EG')} حديثًا في مجموعة «المحفوظات»` : ''}
        {done.added && done.notesAdded ? '، و' : ''}
        {done.notesAdded ? `${done.notesAdded.toLocaleString('ar-EG')} ملاحظة` : ''} — صارت في كل أجهزتك.
      </p>
      <div className="flex gap-3 mt-2">
        <Link href="/library" className="underline text-[#E6C77A]">مكتبتي</Link>
        <button type="button" onClick={() => setDone(null)} className="opacity-75 hover:opacity-100">إغلاق</button>
      </div>
    </div>
  )
}
