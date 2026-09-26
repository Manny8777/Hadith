import type { SnipPart } from '@/lib/matnSnippet'

/**
 * The match line shown under a result: where the query actually falls in the matn, with the matched
 * words marked. Renders nothing when the API attached no line (a query with no text terms, or a
 * match beyond the text read for the line).
 */
export default function MatnMatchLine({
  parts,
  label = 'موضع المطابقة في المتن',
}: {
  parts?: SnipPart[] | null
  label?: string
}) {
  if (!parts || parts.length === 0) return null
  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2">
      <span className="matn-match-label block text-[10px] font-semibold text-amber-700 mb-1">{label}</span>
      <p className="matn-match-text text-sm leading-relaxed text-gray-700">
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 ? ' ' : ''}
            {part.hit ? (
              <mark className="rounded bg-amber-200 px-0.5 font-semibold text-amber-900">
                {part.t}
              </mark>
            ) : (
              part.t
            )}
          </span>
        ))}
      </p>
    </div>
  )
}
