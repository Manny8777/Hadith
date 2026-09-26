// Summary chips for a section header (see CollapsibleSection's `badges`).
export type Chip = { text: string; tone?: 'info' | 'violet' }

export default function Chips({ chips }: { chips: Chip[] }) {
  return (
    <>
      {chips.map((c, i) => (
        <span key={i} className={c.tone === 'info' ? 'ui-chip-info' : c.tone === 'violet' ? 'ui-chip-violet' : 'ui-chip'}>
          {c.text}
        </span>
      ))}
    </>
  )
}
