'use client'
import { useState, useEffect, useRef } from 'react'

const NOTES_KEY = 'hadith_notes'

function getNotes(): Record<number, string> {
  try {
    const raw = localStorage.getItem(NOTES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveNote(hadithId: number, note: string) {
  const notes = getNotes()
  if (note.trim()) {
    notes[hadithId] = note
  } else {
    delete notes[hadithId]
  }
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
}

interface Props {
  hadithId: number
}

export default function HadithNote({ hadithId }: Props) {
  const [mounted, setMounted] = useState(false)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setMounted(true)
    const notes = getNotes()
    setNote(notes[hadithId] || '')
    if (notes[hadithId]) setOpen(true)
  }, [hadithId])

  useEffect(() => {
    if (open && taRef.current) {
      taRef.current.focus()
    }
  }, [open])

  function handleSave() {
    saveNote(hadithId, note)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  if (!mounted) return null

  const hasNote = note.trim().length > 0

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          hasNote
            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
            : 'bg-white text-gray-500 border-gray-200 hover:border-blue-200 hover:text-blue-600'
        }`}
      >
        {hasNote ? `📝 ملاحظة (${note.trim().slice(0, 20)}...)` : '📝 إضافة ملاحظة بحثية'}
      </button>

      {open && (
        <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
          <p className="text-xs text-blue-700 mb-2 font-medium">ملاحظتك البحثية (محفوظة محلياً)</p>
          <textarea
            ref={taRef}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="سجّل ملاحظاتك ونتائجك وتحليلك لهذا الحديث..."
            rows={4}
            className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
            dir="rtl"
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="text-xs px-3 py-1.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors"
              >
                {saved ? '✓ محفوظة' : 'حفظ الملاحظة'}
              </button>
              {hasNote && (
                <button
                  onClick={() => { setNote(''); saveNote(hadithId, '') }}
                  className="text-xs px-3 py-1.5 bg-white text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  حذف
                </button>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
