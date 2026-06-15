import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface PeerRow {
  peer_id: number
  peer_name: string
  abb_name: string | null
  death_year_num: number | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
  shared_chains: number
  shared_hadiths: number
  relation_type: string
}

export default async function PeerNetworkPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const narratorId = parseInt(id)

  const [narratorRes, peersRes, topTeachersRes, topStudentsRes] = await Promise.all([
    pool.query<{ id: number; name: string; abb_name: string | null; martaba_ibn_hajar: string | null; death_year_num: number | null }>(
      `SELECT id, name, abb_name, martaba_ibn_hajar, death_year_num FROM narrators WHERE id = $1`,
      [narratorId]
    ).catch(() => ({ rows: [] })),

    // All peers appearing in same chains
    pool.query<PeerRow>(
      `SELECT
         n2.id AS peer_id,
         n2.name AS peer_name,
         n2.abb_name,
         n2.death_year_num,
         n2.martaba_ibn_hajar,
         n2.is_companion,
         COUNT(DISTINCT ic.id)::int AS shared_chains,
         COUNT(DISTINCT ih.hadith_id)::int AS shared_hadiths,
         CASE
           WHEN COUNT(DISTINCT CASE WHEN pos_self.ord > pos_peer.ord THEN ic.id END) >
                COUNT(DISTINCT CASE WHEN pos_self.ord < pos_peer.ord THEN ic.id END)
           THEN 'شيخ'
           WHEN COUNT(DISTINCT CASE WHEN pos_self.ord < pos_peer.ord THEN ic.id END) >
                COUNT(DISTINCT CASE WHEN pos_self.ord > pos_peer.ord THEN ic.id END)
           THEN 'تلميذ'
           ELSE 'معاصر'
         END AS relation_type
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN narrators n2 ON n2.id = ANY(ic.narrator_id_array) AND n2.id != $1
       CROSS JOIN LATERAL (
         SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = $1 LIMIT 1
       ) pos_self
       CROSS JOIN LATERAL (
         SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = n2.id LIMIT 1
       ) pos_peer
       WHERE $1 = ANY(ic.narrator_id_array)
       GROUP BY n2.id, n2.name, n2.abb_name, n2.death_year_num, n2.martaba_ibn_hajar, n2.is_companion
       ORDER BY shared_chains DESC
       LIMIT 30`,
      [narratorId]
    ).catch(() => ({ rows: [] as PeerRow[] })),

    // Most common teachers (narrators before this one in chains)
    pool.query<{ id: number; name: string; abb_name: string | null; death_year_num: number | null; martaba_ibn_hajar: string | null; is_companion: boolean; count: number }>(
      `SELECT
         n2.id, n2.name, n2.abb_name, n2.death_year_num, n2.martaba_ibn_hajar, n2.is_companion,
         COUNT(DISTINCT ic.id)::int AS count
       FROM isnad_chains ic
       CROSS JOIN LATERAL (
         SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = $1 LIMIT 1
       ) pos
       JOIN narrators n2 ON n2.id = ic.narrator_id_array[pos.ord - 1]
       WHERE $1 = ANY(ic.narrator_id_array) AND pos.ord > 1
       GROUP BY n2.id, n2.name, n2.abb_name, n2.death_year_num, n2.martaba_ibn_hajar, n2.is_companion
       ORDER BY count DESC
       LIMIT 10`,
      [narratorId]
    ).catch(() => ({ rows: [] })),

    // Most common students (narrators after this one in chains)
    pool.query<{ id: number; name: string; abb_name: string | null; death_year_num: number | null; martaba_ibn_hajar: string | null; is_companion: boolean; count: number }>(
      `SELECT
         n2.id, n2.name, n2.abb_name, n2.death_year_num, n2.martaba_ibn_hajar, n2.is_companion,
         COUNT(DISTINCT ic.id)::int AS count
       FROM isnad_chains ic
       CROSS JOIN LATERAL (
         SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = $1 LIMIT 1
       ) pos
       JOIN narrators n2 ON n2.id = ic.narrator_id_array[pos.ord + 1]
       WHERE $1 = ANY(ic.narrator_id_array)
         AND pos.ord < array_length(ic.narrator_id_array, 1)
       GROUP BY n2.id, n2.name, n2.abb_name, n2.death_year_num, n2.martaba_ibn_hajar, n2.is_companion
       ORDER BY count DESC
       LIMIT 10`,
      [narratorId]
    ).catch(() => ({ rows: [] })),
  ])

  const narrator = narratorRes.rows[0]
  const peers = peersRes.rows
  const teachers = topTeachersRes.rows
  const students = topStudentsRes.rows

  if (!narrator) {
    return <div dir="rtl" className="text-center py-8 text-gray-400">لم يُعثر على الراوي</div>
  }

  const maxChains = Math.max(...peers.map(p => p.shared_chains), 1)

  function gradeColor(g: string | null, isCompanion: boolean) {
    if (isCompanion) return 'text-amber-700'
    if (!g) return 'text-gray-400'
    if (/ثقة/.test(g)) return 'text-green-700'
    if (/صدوق/.test(g)) return 'text-blue-600'
    if (/ضعيف/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  const companions = peers.filter(p => p.is_companion)
  const nonCompanions = peers.filter(p => !p.is_companion)

  return (
    <div dir="rtl">
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href={`/narrator/${narratorId}`} className="hover:text-green-700">
            {narrator.abb_name || narrator.name}
          </Link>
          <span>←</span>
          <span>الشبكة التحليلية</span>
        </div>
        <h1 className="text-xl font-bold text-green-900 mb-0.5">
          شبكة الرواة المصاحبين لـ {narrator.abb_name || narrator.name}
        </h1>
        <p className="text-xs text-gray-400">
          الرواة الذين اشتركوا في أسانيده — مرتَّبون بعدد الأسانيد المشتركة
        </p>
      </div>

      {/* Direct teachers and students */}
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <h2 className="text-sm font-bold text-amber-900 mb-3">
            أبرز الشيوخ المباشرين ({teachers.length})
          </h2>
          <div className="space-y-2">
            {teachers.map(t => (
              <div key={t.id} className="flex items-center gap-2">
                <Link href={`/narrator/${t.id}`}
                  className={`text-sm hover:underline shrink-0 ${t.is_companion ? 'text-amber-700 font-medium' : 'text-green-800'}`}>
                  {t.abb_name || t.name}
                </Link>
                {t.is_companion && <span className="text-xs text-amber-600">(صحابي)</span>}
                {t.martaba_ibn_hajar && <span className={`text-xs ${gradeColor(t.martaba_ibn_hajar, t.is_companion)}`}>{t.martaba_ibn_hajar.slice(0, 15)}</span>}
                <span className="text-xs text-gray-400 mr-auto">{t.count} سند</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <h2 className="text-sm font-bold text-blue-900 mb-3">
            أبرز التلاميذ المباشرين ({students.length})
          </h2>
          <div className="space-y-2">
            {students.map(s => (
              <div key={s.id} className="flex items-center gap-2">
                <Link href={`/narrator/${s.id}`}
                  className="text-sm text-blue-900 hover:underline shrink-0">
                  {s.abb_name || s.name}
                </Link>
                {s.martaba_ibn_hajar && <span className={`text-xs ${gradeColor(s.martaba_ibn_hajar, false)}`}>{s.martaba_ibn_hajar.slice(0, 15)}</span>}
                <span className="text-xs text-gray-400 mr-auto">{s.count} سند</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Companion peers */}
      {companions.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-100 p-4 mb-4">
          <h2 className="text-sm font-bold text-amber-900 mb-3">
            الصحابة في أسانيده ({companions.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {companions.map(p => (
              <Link key={p.peer_id} href={`/narrator/${p.peer_id}`}
                className="text-xs bg-amber-50 border border-amber-100 text-amber-800 px-2.5 py-1 rounded-full hover:bg-amber-100">
                {p.abb_name || p.peer_name}
                <span className="text-amber-600 mr-1">({p.shared_chains})</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* All peer narrators */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 text-xs text-gray-500 font-medium">
          جميع الرواة المصاحبين ({nonCompanions.length})
        </div>
        <div className="divide-y divide-gray-50">
          {nonCompanions.map((p, i) => (
            <div key={p.peer_id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50">
              <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
              <Link href={`/narrator/${p.peer_id}`}
                className="text-sm text-green-900 hover:underline shrink-0">
                {p.abb_name || p.peer_name}
              </Link>
              {p.death_year_num && <span className="text-xs text-gray-400 shrink-0">ت {p.death_year_num}</span>}
              {p.martaba_ibn_hajar && (
                <span className={`text-xs ${gradeColor(p.martaba_ibn_hajar, false)} shrink-0`}>
                  {p.martaba_ibn_hajar.slice(0, 15)}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                p.relation_type === 'شيخ' ? 'bg-amber-50 text-amber-700' :
                p.relation_type === 'تلميذ' ? 'bg-blue-50 text-blue-700' :
                'bg-gray-50 text-gray-500'
              }`}>
                {p.relation_type}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-32">
                <div className="bg-green-400 h-1.5 rounded-full"
                  style={{ width: `${(p.shared_chains / maxChains) * 100}%` }} />
              </div>
              <span className="text-xs text-gray-500 shrink-0 w-12 text-left">
                {p.shared_chains} سند
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/narrator/${narratorId}`} className="text-green-700 hover:underline">← الترجمة</Link>
        <Link href={`/narrator/${narratorId}/teachers-list`} className="text-green-700 hover:underline">← الشيوخ</Link>
        <Link href={`/narrator/${narratorId}/students-list`} className="text-green-700 hover:underline">← التلاميذ</Link>
        <Link href={`/narrator/${narratorId}/reliability`} className="text-green-700 hover:underline">← الموثوقية</Link>
      </div>
    </div>
  )
}
