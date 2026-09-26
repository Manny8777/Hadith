import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'search' | 'books' | 'narrator' | 'topics' | 'lexicon' | 'chart'
  | 'chain' | 'quarantine' | 'bio' | 'comparison' | 'network' | 'filter'
  | 'document' | 'scroll' | 'copy' | 'print' | 'download' | 'share'
  | 'bookmark' | 'sun' | 'moon' | 'landmark' | 'scale' | 'herb'
  | 'prayer' | 'star' | 'diamond' | 'science' | 'kaaba' | 'people'
  | 'handshake' | 'archery' | 'flower' | 'tree' | 'droplet' | 'grave'
  | 'link' | 'check' | 'clipboard' | 'medal' | 'pen' | 'external'
  | 'menu' | 'close' | 'chevron' | 'arrow' | 'spark' | 'compass' | 'layers'
  | 'shield' | 'book-open' | 'users' | 'quote' | 'map' | 'globe'

type Props = SVGProps<SVGSVGElement> & {
  name: IconName
  size?: number
  title?: string
}

type Common = {
  fill: 'none'
  stroke: 'currentColor'
  strokeWidth: number
  strokeLinecap: 'round'
  strokeLinejoin: 'round'
}

const common: Common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function glyph(name: IconName): ReactNode {
  switch (name) {
    case 'search': return <><circle cx="10.8" cy="10.8" r="6.5" {...common} /><path d="m16 16 4.4 4.4" {...common} /></>
    case 'books': return <><path d="M4 5.5h6.2a2 2 0 0 1 2 2V20a2.8 2.8 0 0 0-2-1.2H4z" {...common} /><path d="M20 5.5h-6.2a2 2 0 0 0-2 2V20a2.8 2.8 0 0 1 2-1.2H20z" {...common} /><path d="M6.3 9h3.4M14.3 9h3.4" {...common} /></>
    case 'narrator':
    case 'people':
    case 'users': return <><circle cx="12" cy="8" r="3.2" {...common} /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" {...common} /></>
    case 'topics':
    case 'layers': return <><path d="m12 3 8 4-8 4-8-4z" {...common} /><path d="m4 12 8 4 8-4M4 17l8 4 8-4" {...common} /></>
    case 'lexicon':
    case 'book-open': return <><path d="M3.5 5.5c2.8-.8 5.5-.4 8.5 1.2v13c-3-1.6-5.7-2-8.5-1.2z" {...common} /><path d="M20.5 5.5c-2.8-.8-5.5-.4-8.5 1.2v13c3-1.6 5.7-2 8.5-1.2z" {...common} /></>
    case 'chart': return <><path d="M4 19.5V4.5M4 19.5h16" {...common} /><path d="m7 15 3-3 2.2 1.7L17 8" {...common} /><path d="M15.5 8H17v1.5" {...common} /></>
    case 'chain':
    case 'link': return <><path d="M9.5 14.5 14.5 9.5" {...common} /><path d="M7.2 17.2 5.6 18.8a3.2 3.2 0 0 1-4.5-4.5l3.3-3.3a3.2 3.2 0 0 1 4.5 0" {...common} /><path d="m16.8 6.8 1.6-1.6a3.2 3.2 0 0 1 4.5 4.5l-3.3 3.3a3.2 3.2 0 0 1-4.5 0" {...common} /></>
    case 'quarantine': return <><path d="m12 3 9 17H3z" {...common} /><path d="M12 9v4M12 16.5v.1" {...common} /></>
    case 'bio':
    case 'document':
    case 'scroll': return <><path d="M6 3.5h9l3 3V20.5H6z" {...common} /><path d="M15 3.5v3h3M9 11h6M9 14.5h6M9 18h4" {...common} /></>
    case 'comparison':
    case 'compass': return <><circle cx="12" cy="12" r="8.5" {...common} /><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" {...common} /></>
    case 'network': return <><circle cx="12" cy="5" r="2" {...common} /><circle cx="5" cy="18" r="2" {...common} /><circle cx="19" cy="18" r="2" {...common} /><path d="m10.8 6.8-4.6 9.4M13.2 6.8l4.6 9.4M7 18h10" {...common} /></>
    case 'filter': return <><path d="M4 6h16M7 12h10M10 18h4" {...common} /></>
    case 'copy':
    case 'clipboard': return <><rect x="8" y="7" width="10" height="12" rx="1.5" {...common} /><path d="M16 7V5.5A1.5 1.5 0 0 0 14.5 4h-5A1.5 1.5 0 0 0 8 5.5V7M11 10.5h4M11 14h4" {...common} /></>
    case 'print': return <><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" {...common} /><path d="M7 14h10v6H7zM17 12h.1" {...common} /></>
    case 'download': return <><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16" {...common} /></>
    case 'share':
    case 'external': return <><circle cx="18" cy="5" r="2" {...common} /><circle cx="6" cy="12" r="2" {...common} /><circle cx="18" cy="19" r="2" {...common} /><path d="m7.8 11 8.4-5M7.8 13l8.4 5" {...common} /></>
    case 'bookmark': return <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21z" {...common} />
    case 'sun': return <>
      <circle cx="12" cy="12" r="4" {...common} strokeWidth={2} />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M19.07 4.93l-1.42 1.42M6.35 17.65l-1.42 1.42" {...common} strokeWidth={2} />
    </>
    case 'moon': return <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" {...common} strokeWidth={2} />
    case 'landmark':
    case 'kaaba': return <><path d="M3 20h18M5 17h14M6 17V9l6-4 6 4v8M9 17v-4h6v4M8 10h8" {...common} /></>
    case 'scale': return <><path d="M12 4v16M7 20h10M5 7h14M8 7l-3 6a3 3 0 0 0 6 0L8 7M16 7l-3 6a3 3 0 0 0 6 0l-3-6" {...common} /></>
    case 'herb':
    case 'flower': return <><path d="M12 20V9M12 13c-3.5 0-5-1.8-5-4 3.5 0 5 1.5 5 4M12 11c3.5 0 5-1.8 5-4-3.5 0-5 1.5-5 4" {...common} /><path d="M8 20h8" {...common} /></>
    case 'prayer':
    case 'star':
    case 'spark': return <><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" {...common} /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" {...common} /></>
    case 'diamond': return <path d="m12 3 8 9-8 9-8-9zM4 12h16M12 3l-4 9 4 9 4-9z" {...common} />
    case 'science': return <><path d="M9 3h6M10 3v6l-5.2 8.7A2.3 2.3 0 0 0 6.8 21h10.4a2.3 2.3 0 0 0 2-3.3L14 9V3" {...common} /><path d="M7.5 16h9" {...common} /></>
    case 'handshake': return <><path d="m3 11 3-3 4 2 3-2 4 2 4-2 3 3-4 4-3-2-3 2-4-2-3 2z" {...common} /><path d="m8 14 2 2 2-2 2 2 2-2" {...common} /></>
    case 'archery': return <><path d="M5 19 19 5M7 5h12v12" {...common} /><path d="m5 19 3-1 10-10M13 5l6 6" {...common} /></>
    case 'tree': return <path d="M12 21V10M8 21h8M5 10h14l-2.2-3H7.2zM7 7h10l-2.2-3H9.2zM9 4h6l-3-3z" {...common} />
    case 'droplet': return <path d="M12 3s6 6.4 6 11a6 6 0 1 1-12 0c0-4.6 6-11 6-11z" {...common} />
    case 'grave': return <><path d="M5 21V5a7 7 0 0 1 14 0v16M3 21h18M9 8h6M9 12h6" {...common} /></>
    case 'check': return <path d="m5 12 4.5 4.5L19 7" {...common} />
    case 'pen': return <><path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16zM13.8 6.7l3.5 3.5" {...common} /></>
    case 'menu': return <><path d="M4 6h16M4 12h16M4 18h16" {...common} /></>
    case 'close': return <path d="m6 6 12 12M18 6 6 18" {...common} />
    case 'chevron':
    case 'arrow': return <path d="m14 5-7 7 7 7" {...common} />
    case 'map': return <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" {...common} /></>
    case 'globe': return <><circle cx="12" cy="12" r="8.5" {...common} /><path d="M3.8 9h16.4M3.8 15h16.4M12 3.5c2.2 2.3 3.2 5.1 3.2 8.5s-1 6.2-3.2 8.5c-2.2-2.3-3.2-5.1-3.2-8.5S9.8 5.8 12 3.5z" {...common} /></>
    case 'shield': return <path d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6z" {...common} />
    case 'quote': return <><path d="M6 11h4v5H5v-4c0-3 1.5-5 4-6M15 11h4v5h-5v-4c0-3 1.5-5 4-6" {...common} /></>
    case 'medal': return <><circle cx="12" cy="14" r="5" {...common} /><path d="m8.5 10-2-7 3.5 2 2-2 2 2 3.5-2-2 7" {...common} /></>
  }
}

export default function UiIcon({ name, size = 20, title, className, ...props }: Props) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} focusable="false" {...props}>
      {title ? <title>{title}</title> : null}
      {glyph(name)}
    </svg>
  )
}
