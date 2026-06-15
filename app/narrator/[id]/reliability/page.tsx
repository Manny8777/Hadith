import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface AcceptedRow {
  total_hadiths: number
  sahih_hadiths: number
  hasan_hadiths: number
  daif_hadiths: number
  unjudged_hadiths: number
  gold_chain_hadiths: number
  multi_book_hadiths: number
}

interface ScholarRow {
  scientist_name: string
  grade_type: string
  count: number
}

interface PositionRow {
  position: number
  chain_count: number
  sahih_in_position: number
}

export default async function NarratorReliabilityPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const narId = parseInt(id)
  if (isNaN(narId)) notFound()

  const [narratorRes, acceptanceRes, scholarsRes, positionRes, criticsRes] = await Promise.all([
    pool.query<{ id: number; name: string; abb_name: string | null; death_year: string | null; martaba_ibn_hajar: string | null; is_companion: boolean }>(
      `SELECT id, name, abb_name, death_year, martaba_ibn_hajar, COALESCE(is_companion, false) AS is_companion
       FROM narrators WHERE id = $1`,
      [narId]
    ).catch(() => ({ rows: [] })),

    // Acceptance stats: for chains containing this narrator, what % have sahih judgments?
    pool.query<AcceptedRow>(
      `SELECT
         COUNT(DISTINCT ih.hadith_id)::int AS total_hadiths,
         COUNT(DISTINCT ih.hadith_id) FILTER (
           WHERE EXISTS (SELECT 1 FROM hadith_judgments hj WHERE hj.hadith_id = ih.hadith_id AND hj.say_text ~* '^صحيح|^إسناده صحيح')
         )::int AS sahih_hadiths,
         COUNT(DISTINCT ih.hadith_id) FILTER (
           WHERE EXISTS (SELECT 1 FROM hadith_judgments hj WHERE hj.hadith_id = ih.hadith_id AND hj.say_text ~* '^حسن|^إسناده حسن')
         )::int AS hasan_hadiths,
         COUNT(DISTINCT ih.hadith_id) FILTER (
           WHERE EXISTS (SELECT 1 FROM hadith_judgments hj WHERE hj.hadith_id = ih.hadith_id AND hj.say_text ~* '^ضعيف|^إسناده ضعيف')
         )::int AS daif_hadiths,
         COUNT(DISTINCT ih.hadith_id) FILTER (
           WHERE NOT EXISTS (SELECT 1 FROM hadith_judgments hj WHERE hj.hadith_id = ih.hadith_id)
         )::int AS unjudged_hadiths,
         COUNT(DISTINCT ih.hadith_id) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM isnad_chains ic2
             JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id AND ih2.hadith_id = ih.hadith_id
             WHERE $1 = ANY(ic2.narrator_id_array)
               AND NOT EXISTS (
                 SELECT 1 FROM unnest(ic2.narrator_id_array) AS nid
                 JOIN narrators nf ON nf.id = nid
                 WHERE NOT (nf.is_companion = true OR nf.martaba_ibn_hajar ~* 'ثقة')
               )
           )
         )::int AS gold_chain_hadiths,
         COUNT(DISTINCT ht.takhrij_id) FILTER (WHERE ht.takhrij_id IS NOT NULL)::int AS multi_book_hadiths
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       WHERE $1 = ANY(ic.narrator_id_array)`,
      [narId]
    ).catch(() => ({ rows: [] as AcceptedRow[] })),

    // Scholar verdicts on this narrator
    pool.query<ScholarRow>(
      `SELECT nc.scientist_name,
              CASE
                WHEN nc.say_text ~* 'ثقة ثبت|إمام حجة' THEN 'توثيق عالٍ'
                WHEN nc.say_text ~* 'ثقة' THEN 'ثقة'
                WHEN nc.say_text ~* 'صدوق' THEN 'صدوق'
                WHEN nc.say_text ~* 'ضعيف|لين' THEN 'ضعيف'
                WHEN nc.say_text ~* 'متروك|كذاب|وضاع' THEN 'متروك/ساقط'
                WHEN nc.say_text ~* 'مجهول' THEN 'مجهول'
                ELSE 'أخرى'
              END AS grade_type,
              COUNT(*)::int AS count
       FROM narrator_criticism nc
       WHERE nc.narrator_id = $1
       GROUP BY nc.scientist_name, grade_type
       ORDER BY count DESC
       LIMIT 20`,
      [narId]
    ).catch(() => ({ rows: [] as ScholarRow[] })),

    // Which positions does this narrator occupy, and how often are those chains sahih?
    pool.query<PositionRow>(
      `SELECT
         t.ord::int AS position,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ic.id) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM isnad_hadiths ih
             JOIN hadith_judgments hj ON hj.hadith_id = ih.hadith_id
             WHERE ih.isnad_id = ic.id AND hj.say_text ~* 'صحيح'
           )
         )::int AS sahih_in_position
       FROM isnad_chains ic,
            unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
       WHERE t.nid = $1
       GROUP BY t.ord
       ORDER BY t.ord`,
      [narId]
    ).catch(() => ({ rows: [] as PositionRow[] })),

    // Notable critics
    pool.query<{ say_text: string; scientist_name: string }>(
      `SELECT say_text, scientist_name FROM narrator_criticism
       WHERE narrator_id = $1 AND say_text ~* 'ضعيف|متروك|كذاب|ثقة ثبت'
       ORDER BY id LIMIT 5`,
      [narId]
    ).catch(() => ({ rows: [] })),
  ])

  const narrator = narratorRes.rows[0]
  if (!narrator) notFound()

  const acceptance = acceptanceRes.rows[0]
  const scholars = scholarsRes.rows
  const positions = positionRes.rows
  const critics = criticsRes.rows

  const totalJudged = (acceptance?.sahih_hadiths || 0) + (acceptance?.hasan_hadiths || 0) + (acceptance?.daif_hadiths || 0)
  const acceptancePct = totalJudged > 0
    ? Math.round(((acceptance.sahih_hadiths + acceptance.hasan_hadiths) / totalJudged) * 100)
    : null

  const gradeColors: Record<string, string> = {
    'توثيق عالٍ': 'bg-green-100 text-green-800 border-green-200',
    'ثقة': 'bg-green-50 text-green-700 border-green-100',
    'صدوق': 'bg-blue-50 text-blue-700 border-blue-100',
    'ضعيف': 'bg-red-50 text-red-700 border-red-100',
    'متروك/ساقط': 'bg-red-100 text-red-900 border-red-200',
    'مجهول': 'bg-gray-50 text-gray-600 border-gray-100',
    'أخرى': 'bg-gray-50 text-gray-500 border-gray-100',
  }

  const scholarGradeDist = scholars.reduce((acc, s) => {
    if (!acc[s.grade_type]) acc[s.grade_type] = 0
    acc[s.grade_type] += s.count
    return acc
  }, {} as Record<string, number>)

  const totalScholarOps = Object.values(scholarGradeDist).reduce((a, b) => a + b, 0)
  const positiveOps = (scholarGradeDist['توثيق عالٍ'] || 0) + (scholarGradeDist['ثقة'] || 0) + (scholarGradeDist['صدوق'] || 0)
  const consensusPct = totalScholarOps > 0 ? Math.round((positiveOps / totalScholarOps) * 100) : null

  return (
    <div dir="rtl">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Link href={`/narrator/${narId}`}
            className="text-green-700 hover:underline font-bold text-lg">
            {narrator.name}
          </Link>
          {narrator.death_year && (
            <span className="text-sm text-gray-400">ت {narrator.death_year}</span>
          )}
          {narrator.martaba_ibn_hajar && (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
              {narrator.martaba_ibn_hajar}
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-green-900">التحليل الإحصائي للموثوقية</h1>
      </div>

      {/* Score cards */}
      {acceptance && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            {
              label: 'معدل القبول',
              value: acceptancePct !== null ? `${acceptancePct}%` : '—',
              desc: 'صحيح + حسن / المحكوم',
              color: acceptancePct !== null && acceptancePct >= 70 ? 'text-green-700' : acceptancePct !== null && acceptancePct >= 50 ? 'text-blue-700' : 'text-red-600',
            },
            {
              label: 'توافق العلماء',
              value: consensusPct !== null ? `${consensusPct}%` : '—',
              desc: 'نسبة أقوال التوثيق والتعديل',
              color: consensusPct !== null && consensusPct >= 70 ? 'text-green-700' : 'text-amber-700',
            },
            {
              label: 'الأسانيد الذهبية',
              value: acceptance.gold_chain_hadiths?.toLocaleString('ar-EG') || '0',
              desc: 'أحاديث بسند ذهبي',
              color: 'text-green-700',
            },
            {
              label: 'إجمالي الأحاديث',
              value: acceptance.total_hadiths?.toLocaleString('ar-EG') || '0',
              desc: 'في الأسانيد المسجَّلة',
              color: 'text-gray-700',
            },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs font-medium text-gray-600 mt-0.5">{s.label}</div>
              <div className="text-xs text-gray-400">{s.desc}</div>
            </div>
          ))}
        </div>
      )}

      {/* Hadith grade distribution */}
      {acceptance && totalJudged > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <h2 className="font-bold text-green-900 text-sm mb-3">توزيع درجات أحاديثه ({acceptance.total_hadiths} حديث)</h2>
          <div className="space-y-2">
            {[
              { label: 'صحيح', count: acceptance.sahih_hadiths, color: 'bg-green-500' },
              { label: 'حسن', count: acceptance.hasan_hadiths, color: 'bg-blue-400' },
              { label: 'ضعيف', count: acceptance.daif_hadiths, color: 'bg-red-400' },
              { label: 'غير محكوم', count: acceptance.unjudged_hadiths, color: 'bg-gray-200' },
            ].map(g => (
              <div key={g.label} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 text-left">{g.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3">
                  <div className={`h-3 rounded-full ${g.color} transition-all`}
                    style={{ width: `${Math.round((g.count / acceptance.total_hadiths) * 100)}%` }} />
                </div>
                <span className="text-xs text-gray-600 w-12 text-left">
                  {g.count.toLocaleString('ar-EG')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chain position analysis */}
      {positions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <h2 className="font-bold text-green-900 text-sm mb-3">التحليل بحسب موضع الإسناد</h2>
          <div className="space-y-2">
            {positions.slice(0, 10).map(p => {
              const pct = p.chain_count > 0
                ? Math.round((p.sahih_in_position / p.chain_count) * 100) : 0
              return (
                <div key={p.position} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16 text-left">
                    الموضع {p.position}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3">
                    <div className="bg-green-400 h-3 rounded-full"
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-24 text-left">
                    {pct}% صحيح ({p.chain_count} سند)
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            الموضع 1 = أول السند (الصحابي عادةً) — كلما تقدَّم الموضع كلما بُعد عن النبي ﷺ
          </p>
        </div>
      )}

      {/* Scholar consensus */}
      {scholars.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <h2 className="font-bold text-green-900 text-sm mb-3">توزيع أحكام العلماء على الراوي</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(scholarGradeDist).map(([grade, count]) => (
              <span key={grade}
                className={`text-xs px-3 py-1 rounded-full border font-medium ${gradeColors[grade] || 'bg-gray-50 text-gray-600'}`}>
                {grade}: {count}
              </span>
            ))}
          </div>
          {critics.length > 0 && (
            <div className="space-y-1.5 mt-3 border-t border-gray-50 pt-3">
              <div className="text-xs text-gray-400 mb-1">أبرز الأقوال:</div>
              {critics.map((c, i) => (
                <div key={i} className="text-xs">
                  <span className="font-medium text-gray-700 ml-1">{c.scientist_name}:</span>
                  <span className="text-gray-600">{c.say_text.slice(0, 80)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/narrator/${narId}`} className="text-green-700 hover:underline">← صفحة الراوي</Link>
        <Link href={`/narrator/${narId}/criticism-history`} className="text-green-700 hover:underline">← تسلسل الأحكام</Link>
        <Link href={`/narrator/${narId}/students-list`} className="text-green-700 hover:underline">← التلاميذ</Link>
      </div>
    </div>
  )
}
