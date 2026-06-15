export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'

interface TermNode {
  id: number
  text: string
  parent_id: number
  is_leaf: boolean
  node_id: number
  left_value: number
  right_value: number
  hit_count: number
  say_count: number
}

export const metadata = {
  title: 'تطبيقات المصطلح — جامع خادم الحرمين',
}

export default async function HadithTermsPage() {
  const { rows } = await pool.query<TermNode>(`
    SELECT
      et.id, et.text, et.parent_id, et.is_leaf, et.node_id,
      et.left_value, et.right_value,
      COUNT(DISTINCT eh.hit_id)::int  AS hit_count,
      COUNT(DISTINCT es.link_id)::int AS say_count
    FROM hadith_expressions_tree et
    LEFT JOIN hadith_expressions_hits eh ON eh.node_id = et.node_id
    LEFT JOIN hadith_expressions_says  es ON es.node_id = et.node_id
    WHERE et.parent_id != 0
    GROUP BY et.id, et.text, et.parent_id, et.is_leaf, et.node_id,
             et.left_value, et.right_value
    ORDER BY et.left_value
  `)

  // Build tree map
  const nodeMap = new Map(rows.map(r => [r.id, r]))
  const childMap = new Map<number, TermNode[]>()
  for (const row of rows) {
    if (!childMap.has(row.parent_id)) childMap.set(row.parent_id, [])
    childMap.get(row.parent_id)!.push(row)
  }

  // Get root children (parent_id = 1 which is the root المصطلح)
  const root = rows.find(r => r.parent_id === 0) ?? rows[0]
  const topLevel = childMap.get(1) ?? []

  function TermTree({ nodes, depth = 0 }: { nodes: TermNode[]; depth?: number }) {
    return (
      <ul className={`space-y-1 ${depth > 0 ? 'mr-4 mt-1 border-r border-gray-100 pr-3' : ''}`}>
        {nodes.map(node => {
          const children = childMap.get(node.id) ?? []
          const hasContent = node.hit_count > 0 || node.say_count > 0
          return (
            <li key={node.id}>
              <Link
                href={`/hadith-terms/${node.id}`}
                className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-green-50 ${
                  node.is_leaf
                    ? 'text-gray-700 hover:text-green-800'
                    : 'font-semibold text-green-900 hover:text-green-700'
                }`}
              >
                <span>{node.text}</span>
                {hasContent && (
                  <span className="text-[10px] text-gray-400 bg-gray-50 rounded-full px-1.5 py-0.5 leading-tight">
                    {node.hit_count > 0 ? `${node.hit_count} نص` : ''}
                    {node.hit_count > 0 && node.say_count > 0 ? ' · ' : ''}
                    {node.say_count > 0 ? `${node.say_count} قول` : ''}
                  </span>
                )}
              </Link>
              {children.length > 0 && <TermTree nodes={children} depth={depth + 1} />}
            </li>
          )
        })}
      </ul>
    )
  }

  const totalTerms = rows.length
  const totalWithContent = rows.filter(r => r.hit_count > 0 || r.say_count > 0).length

  return (
    <div dir="rtl" className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-green-900 mb-2">تطبيقات المصطلح</h1>
        <p className="text-gray-600 text-sm leading-relaxed">
          شجرة مصطلحات علوم الحديث — تعريفات ومناقشات علماء الحديث لكل مصطلح من كتبهم
        </p>
        <div className="flex gap-4 mt-3 text-xs text-gray-400">
          <span>{totalTerms} مصطلح</span>
          <span>{totalWithContent} مصطلح بمحتوى</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <TermTree nodes={topLevel} />
      </div>

      <div className="mt-6 bg-green-50 border border-green-100 rounded-xl p-4 text-xs text-green-800">
        <p className="font-semibold mb-1">ما هذه الصفحة؟</p>
        <p className="leading-relaxed">
          تتضمن هذه الصفحة مصطلحات علم مصطلح الحديث مرتبةً في شجرة هرمية. اضغط على أي مصطلح
          لعرض تعريفاته وأقوال العلماء فيه ونصوص الكتب المتعلقة به.
        </p>
      </div>
    </div>
  )
}