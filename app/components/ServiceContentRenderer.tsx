import Link from 'next/link'
import pool from '@/lib/db'
import type { ReactNode } from 'react'

type Attributes = Record<string, string>
type ContentNode =
  | { kind: 'text'; value: string }
  | { kind: 'element'; tag: string; attrs: Attributes; children: ContentNode[] }

interface ParsedContent {
  children: ContentNode[]
  footnotes: Map<string, string>
}

const VOID_TAGS = new Set(['الصفحات', 'رقم_الفقرة', 'نه', 'هامش'])

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
}

function plainText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/[\t ]+/g, ' ').trim()
}

function parseAttributes(source: string): Attributes {
  const attrs: Attributes = {}
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    attrs[decodeEntities(match[1])] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attrs
}

function parseContent(source: string): ParsedContent {
  const footnotes = new Map<string, string>()
  const withoutFootnoteBodies = source.replace(
    /<FootNote\b[^>]*\bID="([^"]+)"[^>]*>([\s\S]*?)<\/FootNote>/gi,
    (_full, id: string, body: string) => {
      const text = plainText(body)
      if (text && !footnotes.has(id)) footnotes.set(id, text)
      return ' '
    },
  ).replace(/<Margin\b[^>]*>[\s\S]*?<\/Margin>/gi, ' ')

  const root: ContentNode[] = []
  const stack: Array<{ tag: string | null; children: ContentNode[] }> = [
    { tag: null, children: root },
  ]
  const tagPattern = /<([^>]+)>/g
  let cursor = 0
  let match: RegExpExecArray | null

  const pushText = (value: string) => {
    if (!value) return
    stack[stack.length - 1].children.push({
      kind: 'text',
      value: decodeEntities(value).replace(/[\t ]+/g, ' '),
    })
  }

  while ((match = tagPattern.exec(withoutFootnoteBodies)) !== null) {
    pushText(withoutFootnoteBodies.slice(cursor, match.index))
    cursor = tagPattern.lastIndex

    const raw = match[1].trim()
    if (!raw || raw.startsWith('!') || raw.startsWith('?')) continue

    if (raw.startsWith('/')) {
      const tag = raw.slice(1).trim()
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i
          break
        }
      }
      continue
    }

    const selfClosing = raw.endsWith('/')
    const body = selfClosing ? raw.slice(0, -1).trim() : raw
    const nameEnd = body.search(/[\s/]/)
    const tag = nameEnd === -1 ? body : body.slice(0, nameEnd)
    const attrs = parseAttributes(nameEnd === -1 ? '' : body.slice(nameEnd))
    const node: ContentNode = { kind: 'element', tag, attrs, children: [] }
    stack[stack.length - 1].children.push(node)

    if (!selfClosing && !VOID_TAGS.has(tag)) {
      stack.push({ tag, children: node.children })
    }
  }

  pushText(withoutFootnoteBodies.slice(cursor))
  return { children: root, footnotes }
}

function nodeText(node: ContentNode): string {
  if (node.kind === 'text') return node.value
  return plainText(node.children.map(nodeText).join(' '))
}

function collectNarratorCandidates(nodes: ContentNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.kind !== 'element') continue
    if (node.tag === 'راوي' || node.tag === 'اسم_الراوي' || node.tag === 'سند') {
      const value = nodeText(node).trim()
      if (value.length >= 3 && value.length <= 120) into.add(value)
    }
    collectNarratorCandidates(node.children, into)
  }
  return into
}

const TAG_STYLES: Record<string, string> = {
  متن: 'bg-emerald-50/70 border-r-2 border-emerald-300 px-1.5 rounded-sm',
  قول: 'bg-amber-50/70 border-r-2 border-amber-300 px-1.5 rounded-sm',
  أصل: 'bg-sky-50/70 border-r-2 border-sky-300 px-1.5 rounded-sm',
  مخالف: 'bg-rose-50/70 border-r-2 border-rose-300 px-1.5 rounded-sm',
  حديث_خدمي: 'bg-violet-50/70 border-r-2 border-violet-300 px-1.5 rounded-sm',
  نقد: 'bg-rose-50/60 border-r-2 border-rose-200 px-1 rounded-sm',
  'قول_عالم': 'bg-amber-50/60 border-r-2 border-amber-200 px-1 rounded-sm',
  اغريب: 'bg-teal-50/70 border-r-2 border-teal-300 px-1.5 rounded-sm',
  غريب: 'bg-teal-50/70 border-r-2 border-teal-300 px-1.5 rounded-sm',
  مصطلح: 'underline decoration-teal-400 decoration-dotted underline-offset-4',
  'شرح_مصطلح': 'underline decoration-teal-400 decoration-dotted underline-offset-4',
  قراءة: 'bg-indigo-50/70 border-r-2 border-indigo-300 px-1.5 rounded-sm',
  رتبة: 'font-semibold text-indigo-800',
  سند: 'text-sky-900',
  قرآن: 'text-emerald-900',
  علم: 'underline decoration-amber-400 decoration-dotted underline-offset-4',
  'علم_مكان': 'underline decoration-amber-400 decoration-dotted underline-offset-4',
}

function renderNodes(
  nodes: ContentNode[],
  keyPrefix: string,
  suraByName: Record<string, number>,
  narratorByText: Map<string, { id: number; name: string }>,
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`
    if (node.kind === 'text') return node.value

    const { tag, attrs, children } = node
    const childrenNodes = renderNodes(children, key, suraByName, narratorByText)
    const className = TAG_STYLES[tag] || ''

    switch (tag) {
      case 'رقم_الفقرة':
      case 'نص_مخفي':
      case 'Margin':
      case 'FootNote':
        return null
      case 'نه':
        return <br key={key} />
      case 'الصفحات':
        return (
          <span
            key={key}
            className="mx-1 inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 align-middle text-[10px] font-medium text-amber-700 no-underline"
            title="موضع الطباعة في الكتاب"
          >
            [{attrs['جزء'] || '—'}/{attrs['صفحة'] || '—'}]
          </span>
        )
      case 'رقم_حديث': {
        const value = nodeText(node).trim()
        return value ? <span key={key} className="mx-1 font-semibold text-green-700">({value})</span> : null
      }
      case 'هامش': {
        const id = attrs.ID || attrs.id
        if (!id) return null
        return (
          <sup key={key} className="mx-0.5 text-[10px]">
            <a href={`#fn-${id}`} className="text-blue-700 hover:underline">({id})</a>
          </sup>
        )
      }
      case 'آية': {
        const suraName = attrs['السورة'] || ''
        const suraId = suraByName[suraName]
        const aya = attrs['الآية']
        const href = suraId ? `/quran/${suraId}${aya ? `#aya-${aya}` : ''}` : '/quran'
        return (
          <Link
            key={key}
            href={href}
            className="mx-0.5 rounded-sm bg-emerald-50/80 px-1 font-arabic text-emerald-950 decoration-emerald-400 underline-offset-4 hover:underline"
            title={suraName ? `${suraName}:${aya || '—'}` : undefined}
          >
            {childrenNodes}
          </Link>
        )
      }
      case 'راوي':
      case 'اسم_الراوي':
      case 'سند': {
        const value = nodeText(node).trim()
        const narrator = narratorByText.get(value)
        if (!narrator) return <span key={key} className={className}>{childrenNodes}</span>
        return (
          <Link
            key={key}
            href={`/narrator/${narrator.id}`}
            className={`rounded-sm px-0.5 text-sky-900 underline decoration-sky-300 underline-offset-4 hover:bg-sky-50 hover:underline ${className}`}
            title={narrator.name}
          >
            {childrenNodes}
          </Link>
        )
      }
      case 'علم':
      case 'الناقد': {
        const rawId = attrs['ربط'] || attrs.ID || attrs.id
        const linkedId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null
        const typeLabel = attrs['نوع'] ? ` (${attrs['نوع']})` : ''
        if (linkedId) {
          return (
            <Link
              key={key}
              href={`/narrator/${linkedId}`}
              className={`rounded-sm underline decoration-amber-400 underline-offset-4 hover:bg-amber-50 ${className}`}
              title={`معلومة: ${attrs['نوع'] || 'علم'}`}
            >
              {childrenNodes}
            </Link>
          )
        }
        return <span key={key} className={className} title={`معلومة: ${attrs['نوع'] || 'علم'}`}>{childrenNodes}{typeLabel && <span className="sr-only">{typeLabel}</span>}</span>
      }
      case 'شعر':
      case 'شطر_بيت':
        return (
          <span key={key} className="my-2 block border-r-2 border-purple-200 bg-purple-50/50 px-3 py-1 font-arabic leading-loose text-purple-950">
            {childrenNodes}
          </span>
        )
      case 'مسألة':
      case 'حديث':
      case 'أصل':
      case 'متن':
      case 'قول':
      case 'شرح':
      case 'تكشيف':
      case 'مخالف':
      case 'حديث_خدمي':
      case 'فوائد':
      case 'أسباب':
      case 'تواريخ':
        return <span key={key} className={className}>{childrenNodes}</span>
      default:
        return <span key={key} className={className}>{childrenNodes}</span>
    }
  })
}

export default async function ServiceContentRenderer({
  content,
  suraByName,
  className = '',
}: {
  content: string
  suraByName: Record<string, number>
  className?: string
}) {
  const { children, footnotes } = parseContent(content)
  const candidates = Array.from(collectNarratorCandidates(children))
  const narratorByText = new Map<string, { id: number; name: string }>()

  if (candidates.length > 0) {
    const result = await pool.query<{ raw: string; id: number; name: string }>(
      `SELECT DISTINCT ON (c.raw) c.raw, n.id, n.name
         FROM unnest($1::text[]) AS c(raw)
         JOIN LATERAL (
           SELECT id, name
           FROM narrators
           WHERE normalize_hadith(name) = normalize_hadith(c.raw)
           ORDER BY (abb_name IS NOT NULL) DESC, length(name), id
           LIMIT 1
         ) n ON true`,
      [candidates],
    )
    for (const row of result.rows) narratorByText.set(row.raw, { id: Number(row.id), name: row.name })
  }

  return (
    <div className={`font-arabic text-gray-900 leading-9 text-justify ${className}`}>
      {renderNodes(children, 'content', suraByName, narratorByText)}
      {footnotes.size > 0 && (
        <section className="mt-8 border-t border-dashed border-gray-200 pt-4 text-right">
          <h3 className="mb-2 text-sm font-bold text-gray-700">الحواشي</h3>
          <ol className="space-y-2 text-xs leading-6 text-gray-600">
            {Array.from(footnotes.entries()).map(([id, text]) => (
              <li key={id} id={`fn-${id}`} className="scroll-mt-32">
                <span className="me-1 font-semibold text-blue-700">({id})</span>
                {text}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
