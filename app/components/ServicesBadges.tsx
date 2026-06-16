export const dynamic = 'force-dynamic'

import pool from '@/lib/db'

// Only flags with no sidebar link and no content page
const FLAG_LABELS: Record<string, string> = {
  ghareeb: 'غريب الحديث',
  kerat:   'قراءات',
}

function badgeClass(key: string): string {
  if (key === 'ghareeb') return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-700'
}

export default async function ServicesBadges({ hadithId }: { hadithId: number }) {
  const res = await pool.query(
    `SELECT ghareeb, kerat FROM hadith_services WHERE hadith_id = $1`,
    [hadithId]
  )

  const row = res.rows[0]
  if (!row) return null

  const activeKeys = Object.keys(FLAG_LABELS).filter(key => row[key] === true)
  if (activeKeys.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 mb-4" dir="rtl">
      {activeKeys.map(key => (
        <span
          key={key}
          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClass(key)}`}
        >
          {FLAG_LABELS[key]}
        </span>
      ))}
    </div>
  )
}
