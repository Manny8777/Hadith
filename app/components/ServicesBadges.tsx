export const dynamic = 'force-dynamic'

import pool from '@/lib/db'

const LABELS: Record<string, string> = {
  takhreg:      'تخريج',
  compound_matn:'متن مركب',
  rwah:         'رواة',
  asnad:        'أسانيد',
  shawahed:     'شواهد',
  ghareeb:      'غريب الحديث',
  degree:       'الدرجة',
  sharh:        'شرح',
  subjects:     'موضوعات',
  tafsser:      'تفسير',
  biography:    'تراجم',
  medicine:     'طب',
  feqh:         'فقه',
  asbab:        'أسباب الورود',
  mokhtalaf:    'مختلف الحديث',
  amthal:       'أمثال',
  motawater:    'متواتر',
}

// Badge color groups
const GREEN_KEYS  = new Set(['takhreg', 'rwah', 'asnad'])
const BLUE_KEYS   = new Set(['sharh', 'subjects', 'biography'])
const AMBER_KEYS  = new Set(['ghareeb', 'amthal'])
const PURPLE_KEYS = new Set(['motawater'])

function badgeClass(key: string): string {
  if (GREEN_KEYS.has(key))  return 'bg-green-100 text-green-800'
  if (BLUE_KEYS.has(key))   return 'bg-blue-100 text-blue-800'
  if (AMBER_KEYS.has(key))  return 'bg-amber-100 text-amber-800'
  if (PURPLE_KEYS.has(key)) return 'bg-purple-100 text-purple-800'
  return 'bg-gray-100 text-gray-700'
}

export default async function ServicesBadges({ hadithId }: { hadithId: number }) {
  const res = await pool.query(
    `SELECT * FROM hadith_services WHERE hadith_id = $1`,
    [hadithId]
  )

  const row = res.rows[0]
  if (!row) return null

  const activeKeys = Object.keys(LABELS).filter(key => row[key] === true)
  if (activeKeys.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 mb-4" dir="rtl">
      {activeKeys.map(key => (
        <span
          key={key}
          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClass(key)}`}
        >
          {LABELS[key]}
        </span>
      ))}
    </div>
  )
}
