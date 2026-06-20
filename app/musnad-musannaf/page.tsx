export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import CompanionList, { type CompanionRow } from './CompanionList'

export default async function MusnadIndexPage() {
  const [res, introRes] = await Promise.all([
    pool.query<CompanionRow>(
      `SELECT c.id, c.seq, c.name, c.slug, c.narrator_id, c.kind, c.title_page,
              COUNT(e.id)::int AS n
       FROM ilal_companions c
       LEFT JOIN ilal_entries e ON e.companion_id = c.id
       GROUP BY c.id
       ORDER BY c.title_page`
    ),
    pool.query<{ id: number; title: string }>(`SELECT id, title FROM ilal_intro ORDER BY sort`),
  ])
  const companions = res.rows
  const intro = introRes.rows

  const companionCount = companions.filter(c => c.kind === 'companion').length
  const entryCount = companions.reduce((sum, c) => sum + c.n, 0)

  return (
    <div dir="rtl" className="mx-auto max-w-4xl">
      {/* header block */}
      <header className="ui-card mb-3 !p-5">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
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

      {/* مقدمة الكتاب */}
      {intro.length > 0 && (
        <Link href="/musnad-musannaf/intro" className="ui-card mb-5 !p-4 flex items-center justify-between gap-3 hover:border-green-600 group">
          <div className="min-w-0">
            <div className="font-bold text-gray-900 group-hover:text-green-800" style={{ fontFamily: 'var(--font-display)' }}>مقدمة الكتاب</div>
            <div className="text-xs text-gray-500 mt-1 truncate">{intro.map(s => s.title).join(' · ')}</div>
          </div>
          <span className="shrink-0 text-green-700 text-sm">قراءة ←</span>
        </Link>
      )}

      {companionCount === 0 ? (
        <div className="ui-prose-block text-sm text-gray-600">لم تُستخرج البيانات بعد.</div>
      ) : (
        <CompanionList companions={companions} />
      )}
    </div>
  )
}
