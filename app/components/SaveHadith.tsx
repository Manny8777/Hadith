'use client'
import { useState, useEffect } from 'react'

const STORAGE_KEY = 'hadith_collection'

function getCollection(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function setCollection(ids: number[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

interface Props {
  hadithId: number
}

export default function SaveHadith({ hadithId }: Props) {
  const [saved, setSaved] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setSaved(getCollection().includes(hadithId))
  }, [hadithId])

  function toggle() {
    const col = getCollection()
    let next: number[]
    if (col.includes(hadithId)) {
      next = col.filter(id => id !== hadithId)
    } else {
      next = [...col, hadithId]
    }
    setCollection(next)
    setSaved(next.includes(hadithId))
  }

  if (!mounted) return null

  return (
    <button
      onClick={toggle}
      className={`text-xs font-sans px-3 py-1.5 rounded-lg border transition-colors ${
        saved
          ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
          : 'bg-white text-gray-600 border-gray-200 hover:border-green-300 hover:text-green-800'
      }`}
      title={saved ? 'إزالة من المجموعة البحثية' : 'حفظ في المجموعة البحثية'}
    >
      {saved ? '★ محفوظ' : '☆ حفظ'}
    </button>
  )
}
