'use client'
import { useEffect } from 'react'

const RECENT_KEY = 'hadith_recent'
const MAX_RECENT = 30

export default function TrackHadithView({
  hadithId,
  hadithTitle,
}: {
  hadithId: number
  hadithTitle: string
}) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      const recent: Array<{ id: number; title: string; ts: number }> = raw ? JSON.parse(raw) : []
      // Remove existing entry for this hadith
      const filtered = recent.filter(r => r.id !== hadithId)
      // Add to front
      filtered.unshift({ id: hadithId, title: hadithTitle, ts: Date.now() })
      // Keep max 30
      localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)))
    } catch {
      // Ignore localStorage errors
    }
  }, [hadithId, hadithTitle])

  return null
}
