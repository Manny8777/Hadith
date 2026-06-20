export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface IntroSection { id: number; sort: number; title: string; content: string | null }

export default async function MusnadIntroPage() {
  const res = await pool.query<IntroSection>(`SELECT id, sort, title, content FROM ilal_intro ORDER BY sort`)
  const sections = res.rows
  if (sections.length === 0) notFound()

  return (
    <div dir="rtl" className="mx-auto max-w-3xl">
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4 flex-wrap">
        <Link href="/musnad-musannaf" className="ui-link">المسند المصنف المعلل</Link>
        <span className="text-gray-300">›</span>
        <span className="text-gray-800 font-medium">المقدمة</span>
      </nav>

      <header className="ui-card mb-4 !p-5">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>مقدمة الكتاب</h1>
        <p className="text-sm text-gray-600 mt-2">للمؤلف د. بشار عواد معروف وآخرون — موارد الكتاب ومنهجه</p>
      </header>

      {/* جدول المحتويات */}
      <nav className="ui-card mb-5 !p-4">
        <div className="text-[11px] font-bold text-gray-500 tracking-wider mb-2">المحتويات</div>
        <ul className="flex flex-col gap-1.5 text-sm">
          {sections.map(s => (
            <li key={s.id}>
              <a href={`#sec-${s.id}`} className="ui-link">{s.title}</a>
            </li>
          ))}
        </ul>
      </nav>

      {sections.map(s => (
        <section key={s.id} id={`sec-${s.id}`} className="ui-card mb-4 !p-5 scroll-mt-header">
          <h2 className="text-lg font-bold text-green-900 mb-3 pb-2 border-b border-[var(--color-border)]" style={{ fontFamily: 'var(--font-display)' }}>
            {s.title}
          </h2>
          <div
            className="intro-body text-[15px] leading-loose text-[var(--color-ink)]"
            style={{ fontFamily: 'var(--font-body, serif)' }}
            dangerouslySetInnerHTML={{ __html: s.content || '' }}
          />
        </section>
      ))}
    </div>
  )
}
