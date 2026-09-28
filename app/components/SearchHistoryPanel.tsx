'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const SAVED_KEY = 'hadith_saved_searches'
const RECENT_KEY = 'hadith_recent_searches'
const MAX_SAVED = 20
const MAX_RECENT = 12

type SearchEntry = {
  id: string
  label: string
  url: string
  createdAt: number
}

function readEntries(key: string): SearchEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is SearchEntry =>
      !!entry && typeof entry.id === 'string' && typeof entry.label === 'string' && typeof entry.url === 'string',
    )
  } catch {
    return []
  }
}

function writeEntries(key: string, entries: SearchEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(entries))
  } catch {
    // Private browsing and storage-disabled contexts should not break search.
  }
}

function entryId(url: string) {
  return url.replace(/\/$/, '')
}

function labelForQuery(query: string) {
  const trimmed = query.trim()
  return trimmed ? `بحث: ${trimmed}` : 'بحث بلا كلمة'
}

export default function SearchHistoryPanel({
  currentUrl,
  currentQuery,
}: {
  currentUrl: string
  currentQuery: string
}) {
  const router = useRouter()
  const [saved, setSaved] = useState<SearchEntry[]>([])
  const [recent, setRecent] = useState<SearchEntry[]>([])
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setSaved(readEntries(SAVED_KEY))
    setRecent(readEntries(RECENT_KEY))
  }, [])

  useEffect(() => {
    if (!currentQuery.trim() || !currentUrl || currentUrl === '/search') return
    const id = entryId(currentUrl)
    const entry: SearchEntry = {
      id,
      label: labelForQuery(currentQuery),
      url: currentUrl,
      createdAt: Date.now(),
    }
    setRecent((current) => {
      const next = [entry, ...current.filter((item) => item.id !== id)].slice(0, MAX_RECENT)
      writeEntries(RECENT_KEY, next)
      return next
    })
  }, [currentQuery, currentUrl])

  function saveCurrent() {
    if (!currentQuery.trim()) return
    const id = entryId(currentUrl)
    const entry: SearchEntry = {
      id,
      label: labelForQuery(currentQuery),
      url: currentUrl,
      createdAt: Date.now(),
    }
    const next = [entry, ...saved.filter((item) => item.id !== id)].slice(0, MAX_SAVED)
    writeEntries(SAVED_KEY, next)
    setSaved(next)
    setStatus('تم حفظ البحث')
    window.setTimeout(() => setStatus(''), 1800)
  }

  function removeSaved(id: string) {
    const next = saved.filter((entry) => entry.id !== id)
    writeEntries(SAVED_KEY, next)
    setSaved(next)
  }

  function clearRecent() {
    writeEntries(RECENT_KEY, [])
    setRecent([])
    setStatus('تم مسح البحث الأخير')
    window.setTimeout(() => setStatus(''), 1800)
  }

  const renderEntry = (entry: SearchEntry, removable = false) => (
    <li key={entry.id} className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => router.push(entry.url)}
        className="min-w-0 flex-1 text-right text-sm text-gray-700 hover:text-green-800 hover:underline truncate"
        title={entry.label}
      >
        {entry.label}
      </button>
      {removable ? (
        <button
          type="button"
          onClick={() => removeSaved(entry.id)}
          className="text-xs text-gray-400 hover:text-red-600 px-1"
          aria-label={`إزالة ${entry.label}`}
        >
          ×
        </button>
      ) : null}
    </li>
  )

  // Collapsed by default: a one-line bar with the counts and the save button; opening it shows the
  // saved and recent searches side by side.
  return (
    <section aria-label="سجل البحث" className="rounded-xl border border-gray-200 bg-white/70">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="search-history-body"
          className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-green-800"
        >
          <svg aria-hidden viewBox="0 0 20 20" className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
          سجل البحث
          <span className="text-xs font-normal text-gray-400">({saved.length} محفوظ · {recent.length} أخير)</span>
        </button>
        <button
          type="button"
          onClick={saveCurrent}
          disabled={!currentQuery.trim()}
          className="text-xs px-2.5 py-1.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          حفظ البحث الحالي
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{status}</p>
      {open && (
        <div id="search-history-body" className="grid sm:grid-cols-2 gap-4 border-t border-gray-100 px-3 py-3">
          <div>
            <h3 className="text-xs font-medium text-gray-500">المحفوظات ({saved.length})</h3>
            {saved.length > 0 ? (
              <ul className="mt-2 space-y-1">{saved.map((entry) => renderEntry(entry, true))}</ul>
            ) : (
              <p className="mt-2 text-xs text-gray-400">لم تحفظ أي بحث بعد.</p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-medium text-gray-500">الأخيرة ({recent.length})</h3>
            {recent.length > 0 ? (
              <>
                <ul className="mt-2 space-y-1">{recent.map((entry) => renderEntry(entry))}</ul>
                <button type="button" onClick={clearRecent} className="mt-2 text-xs text-gray-400 hover:text-red-600">
                  مسح البحث الأخير
                </button>
              </>
            ) : (
              <p className="mt-2 text-xs text-gray-400">ستظهر عمليات البحث التي تجريها هنا.</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
