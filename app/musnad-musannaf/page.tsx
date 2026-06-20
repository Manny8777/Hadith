export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import CompanionList, { type CompanionRow } from './CompanionList'

export default async function MusnadIndexPage() {
  const res = await pool.query<CompanionRow>(
    `SELECT c.id, c.seq, c.name, c.slug, c.narrator_id, COUNT(e.id)::int AS n
     FROM ilal_companions c
     LEFT JOIN ilal_entries e ON e.companion_id = c.id
     GROUP BY c.id
     HAVING COUNT(e.id) > 0
     ORDER BY c.seq NULLS LAST, c.id`
  )
  const companions = res.rows

  const companionCount = companions.length
  const entryCount = companions.reduce((sum, c) => sum + c.n, 0)

  return (
    <div dir="rtl" className="mx-auto max-w-4xl">
      {/* header block */}
      <header className="ui-card mb-5 !p-5">
        <h1
          className="text-2xl font-bold text-gray-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          المسند المصنف المعلل
        </h1>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          مسند منظَّم بالصحابة مع تخريج الأحاديث وعللها — للمؤلف د. بشار عواد معروف وآخرون
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <span className="ui-chip">{companionCount} صحابي</span>
          <span className="ui-chip">{entryCount} حديث</span>
        </div>
      </header>

      {companionCount === 0 ? (
        <div className="ui-prose-block text-sm text-gray-600">
          لم تُستخرج البيانات بعد.
        </div>
      ) : (
        <CompanionList companions={companions} />
      )}
    </div>
  )
}
