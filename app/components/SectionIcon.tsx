// A drawn icon for each section of the hadith page, keyed by the section's id (as in the page's
// table of contents). Line icons on a 24px grid in the current text colour, so they follow the theme.

const PATHS: Record<string, React.ReactNode> = {
  // the text: «» marks
  matn: <path d="M9.5 6.5 5 12l4.5 5.5M14.5 6.5 19 12l-4.5 5.5" />,
  // chain of narrators branching from one to several
  isnad: <>
    <circle cx="12" cy="4.5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="6.5" cy="19.5" r="2" /><circle cx="17.5" cy="19.5" r="2" />
    <path d="M12 6.5v3.5M10.9 13.7 7.6 17.8M13.1 13.7l3.3 4.1" />
  </>,
  // a scholar's saying
  aqwal: <>
    <path d="M4 5h16v10.5H10l-4.5 4v-4H4z" /><path d="M9 11.8 10 8.6M13.5 11.8l1-3.2" />
  </>,
  // one hadith, found in several books
  takhrij: <>
    <circle cx="5" cy="12" r="2.3" /><rect x="15" y="3.5" width="5" height="5" rx="1" /><rect x="15" y="9.5" width="5" height="5" rx="1" /><rect x="15" y="15.5" width="5" height="5" rx="1" />
    <path d="M7.3 11.2 15 6M7.3 12H15M7.3 12.8 15 18" />
  </>,
  // narrations side by side
  variants: <>
    <rect x="3.5" y="4" width="7" height="16" rx="1.5" /><rect x="13.5" y="4" width="7" height="16" rx="1.5" />
    <path d="M5.5 8h3M5.5 11h3M5.5 14h3M15.5 8h3M15.5 11h3M15.5 14h2" />
  </>,
  // wordings that overlap
  'matn-similarity': <><circle cx="9" cy="12" r="5.5" /><circle cx="15" cy="12" r="5.5" /></>,
  // the same matn, in several copies
  'matn-group': <>
    <rect x="7.5" y="3.5" width="12" height="15" rx="1.5" /><path d="M4.5 7v12a1.5 1.5 0 0 0 1.5 1.5h10" /><path d="M10.5 8h6M10.5 11h6M10.5 14h4" />
  </>,
  // linked hadiths
  related: <>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </>,
  // research tools
  adawat: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5M10.5 8v5M8 10.5h5" /></>,
  // commentary: an open book with notes
  'svc-sharh': <>
    <path d="M3 6.5c3-1 5.5-1 9 1 3.5-2 6-2 9-1v11c-3-1-5.5-1-9 1-3.5-2-6-2-9-1z" /><path d="M12 7.5v11M14.5 10.5h4M14.5 13.5h4M5.5 10.5h4" />
  </>,
  // books of takhrij and 'ilal, examined
  'svc-takhreg': <>
    <rect x="3" y="15" width="11" height="4.5" rx="1" /><rect x="4" y="10" width="9" height="4.5" rx="1" /><circle cx="17" cy="6.5" r="3" /><path d="m19.2 8.7 1.8 1.8" />
  </>,
  // witnesses and corroborations: narrators side by side
  'svc-shawahed': <>
    <circle cx="8" cy="8" r="2.6" /><circle cx="16" cy="8" r="2.6" />
    <path d="M3.5 19c.6-3 2.3-4.5 4.5-4.5s3.9 1.5 4.5 4.5M11.5 19c.6-3 2.3-4.5 4.5-4.5s3.9 1.5 4.5 4.5" />
  </>,
  // occasions of the saying: the key to its meaning
  'svc-asbab': <><circle cx="8" cy="12" r="3.5" /><path d="M11.5 12H21M18 12v3M15.5 12v2" /></>,
  // the Sira: a tent in the desert
  'svc-biography': <><path d="M3 19 12 5l9 14z" /><path d="M12 5v14M9.5 19l2.5-4.5 2.5 4.5M2 19h20" /></>,
  // prophetic medicine: a leaf
  'svc-medicine': <><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="m5 19 8-8" /></>,
  // reconciling hadiths that seem to differ: two paths meeting
  'svc-mokhtalaf': <path d="m4 5 6 7-6 7M10 12h10M17 9l3 3-3 3" />,
  // parables: a lamp of meaning
  'svc-amthal': <>
    <path d="M9 17h6M10 20h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  </>,
  // mass-transmitted: many lines meeting
  'svc-motawater': <><path d="M3 5l9 7M3 9l9 3M3 15l9-3M3 19l9-7M12 12h9" /><circle cx="12" cy="12" r="1.2" /></>,
  // interpolation: words inserted into the text
  'svc-modrag': <path d="M4 7h16M4 17h16M4 12h5M15 12h5M10 14.5l2-5 2 5" />,
  // narration by region: a globe
  'svc-countries': <>
    <circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z" />
  </>,
  // Quranic readings: a book on a rehal
  'svc-kerat': <>
    <path d="M4 9c3-1.2 5.5-1 8 .8 2.5-1.8 5-2 8-.8v5c-3-1.2-5.5-1-8 .8-2.5-1.8-5-2-8-.8z" /><path d="M12 9.8v5M5 20l7-5 7 5" />
  </>,
  // fiqh: the scales
  'svc-feqh': <><path d="M12 4v16M8 20h8M5 7h14" /><path d="M5 7 2.5 12h5zM19 7l-2.5 5h5z" /></>,
  // tafsir: an open book with a star
  'svc-tafsser': <>
    <path d="M3 6.5c3-1 5.5-1 9 1 3.5-2 6-2 9-1v11c-3-1-5.5-1-9 1-3.5-2-6-2-9-1z" /><path d="M12 7.5v11M16.5 9.5l.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2z" />
  </>,
  // takhrij of the narrators: a person and a list
  'svc-rwah': <><circle cx="8" cy="8" r="3" /><path d="M3 19c.7-3.3 2.6-5 5-5s4.3 1.7 5 5M15 8h6M15 12h6M16 16h5" /></>,
}

export function hasSectionIcon(id: string) {
  return id in PATHS
}

export default function SectionIcon({ id, size = 20, className = '' }: { id: string; size?: number; className?: string }) {
  const p = PATHS[id]
  if (!p) return null
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className={className}
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {p}
    </svg>
  )
}
