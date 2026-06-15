'use client'

interface NarratorPoint {
  id: number
  name: string
  abb_name: string | null
  death_year_num: number | null
  is_companion: boolean
  martaba_ibn_hajar: string | null
}

interface Props {
  narrators: NarratorPoint[]
}

export default function ChainTimeline({ narrators }: Props) {
  const datedNarrators = narrators.filter(n => n.death_year_num && n.death_year_num > 0)
  if (datedNarrators.length < 2) return null

  const years = datedNarrators.map(n => n.death_year_num!)
  const minYear = Math.max(0, Math.min(...years) - 15)
  const maxYear = Math.max(...years) + 15
  const range = maxYear - minYear || 1

  const SVG_WIDTH = 800
  const SVG_HEIGHT = 250
  const PADDING_X = 30
  const TIMELINE_Y = 140
  const usableWidth = SVG_WIDTH - PADDING_X * 2

  function xPos(year: number): number {
    return PADDING_X + ((year - minYear) / range) * usableWidth
  }

  // Build positions for ALL narrators; interpolate x for those without a death year
  type Pos = { n: NarratorPoint; x: number; year: number | null; hasDate: boolean }
  const positions: Pos[] = narrators.map(n => ({
    n,
    x: (n.death_year_num && n.death_year_num > 0) ? xPos(n.death_year_num) : -1,
    year: (n.death_year_num && n.death_year_num > 0) ? n.death_year_num : null,
    hasDate: !!(n.death_year_num && n.death_year_num > 0),
  }))

  // Interpolate x for undated narrators between their nearest dated neighbours
  for (let i = 0; i < positions.length; i++) {
    if (positions[i].hasDate) continue

    // Find run extent
    let runStart = i
    while (runStart > 0 && !positions[runStart - 1].hasDate) runStart--
    let runEnd = i
    while (runEnd < positions.length - 1 && !positions[runEnd + 1].hasDate) runEnd++

    let prevX = PADDING_X
    for (let j = runStart - 1; j >= 0; j--) {
      if (positions[j].hasDate) { prevX = positions[j].x; break }
    }
    let nextX = PADDING_X + usableWidth
    for (let j = runEnd + 1; j < positions.length; j++) {
      if (positions[j].hasDate) { nextX = positions[j].x; break }
    }

    const runLength = runEnd - runStart + 1
    const posInRun = i - runStart + 1
    positions[i].x = prevX + (nextX - prevX) * (posInRun / (runLength + 1))
  }

  // Segments: gap only flagged when BOTH endpoints have real dates and span > 90 years
  const segments = positions.slice(0, -1).map((a, i) => {
    const b = positions[i + 1]
    const hasGap = a.hasDate && b.hasDate && (b.year! - a.year! > 90 || b.year! - a.year! < -10)
    return { x1: a.x, x2: b.x, hasGap }
  })

  function labelY(index: number): number {
    return index % 2 === 0 ? TIMELINE_Y - 72 : TIMELINE_Y + 50
  }

  return (
    <div className="mt-4 mb-2 overflow-x-auto" dir="ltr">
      <div className="text-xs text-gray-500 mb-1 text-right" dir="rtl">
        الجدول الزمني للسند — تواريخ الوفاة بالهجري
      </div>
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        width="100%"
        style={{ minWidth: '400px', maxWidth: '100%', display: 'block' }}
        aria-label="Timeline of narrators by death year"
      >
        <rect x={0} y={0} width={SVG_WIDTH} height={SVG_HEIGHT} fill="#fafafa" rx={8} />

        {/* Timeline axis */}
        <line x1={PADDING_X} y1={TIMELINE_Y} x2={SVG_WIDTH - PADDING_X} y2={TIMELINE_Y}
          stroke="#d1d5db" strokeWidth={2} />

        {/* Year markers every ~50 years */}
        {Array.from({ length: Math.floor(range / 50) + 1 }, (_, i) => {
          const y = Math.ceil(minYear / 50) * 50 + i * 50
          if (y > maxYear) return null
          const x = xPos(y)
          return (
            <g key={y}>
              <line x1={x} y1={TIMELINE_Y - 5} x2={x} y2={TIMELINE_Y + 5} stroke="#d1d5db" strokeWidth={1} />
              <text x={x} y={TIMELINE_Y + 18} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="serif">
                {y}هـ
              </text>
            </g>
          )
        })}

        {/* Segment lines */}
        {segments.map((seg, i) => (
          <line key={i}
            x1={seg.x1} y1={TIMELINE_Y} x2={seg.x2} y2={TIMELINE_Y}
            stroke={seg.hasGap ? '#f59e0b' : '#86efac'}
            strokeWidth={seg.hasGap ? 2.5 : 2}
            strokeDasharray={seg.hasGap ? '6,3' : undefined}
          />
        ))}

        {/* Narrator points and labels */}
        {positions.map(({ n, x, year, hasDate }, i) => {
          const color = hasDate ? '#6b7280' : '#9ca3af'
          const fill = hasDate ? '#f3f4f6' : '#f9fafb'
          const fullLabel = n.abb_name || n.name
          const labelWords = fullLabel.split(' ')
          const line1 = labelWords.slice(0, 2).join(' ')
          const line2 = labelWords.length > 2 ? labelWords.slice(2, 5).join(' ') : null
          const rectHeight = line2 ? 40 : 28
          const ly = labelY(i)
          const isAbove = ly < TIMELINE_Y

          return (
            <g key={n.id}>
              <line
                x1={x} y1={isAbove ? ly + rectHeight : ly - 4}
                x2={x} y2={isAbove ? TIMELINE_Y - 12 : TIMELINE_Y + 12}
                stroke={color} strokeWidth={1}
                strokeDasharray={hasDate ? '2,2' : '3,3'} opacity={0.5}
              />
              <circle cx={x} cy={TIMELINE_Y} r={6} fill={fill} stroke={color}
                strokeWidth={hasDate ? 2 : 1.5}
                strokeDasharray={hasDate ? undefined : '3,2'}
              />
              <text x={x} y={TIMELINE_Y + 3.5} textAnchor="middle" fontSize={7} fill={color} fontWeight="bold">
                {i + 1}
              </text>
              <rect x={x - 50} y={ly - 2} width={100} height={rectHeight}
                fill={fill} stroke={color} strokeWidth={1}
                strokeDasharray={hasDate ? undefined : '2,2'}
                rx={4} opacity={0.95}
              />
              <text x={x} y={ly + 10} textAnchor="middle" fontSize={8.5} fill={color} fontWeight="bold" fontFamily="serif">
                {line1}
                {line2 && <tspan x={x} dy={11}>{line2}</tspan>}
              </text>
              <text x={x} y={line2 ? ly + 34 : ly + 22} textAnchor="middle" fontSize={8} fill={color} opacity={0.8}>
                {hasDate ? `ت ${year}هـ` : 'غير محدد'}
              </text>
            </g>
          )
        })}

        {/* Legend */}
        <g transform={`translate(${PADDING_X}, ${SVG_HEIGHT - 18})`}>
          <line x1={0} y1={6} x2={14} y2={6} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4,2" />
          <text x={18} y={10} fontSize={8} fill="#9ca3af">فجوة زمنية كبيرة بين الرواة</text>
        </g>
      </svg>
    </div>
  )
}
