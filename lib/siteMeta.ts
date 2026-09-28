import type { Metadata } from 'next'

// Shared link-preview (Open Graph / X card) settings. A page's openGraph and twitter objects replace
// the layout's rather than merging with them, so pages that set their own build on these.
export const SITE_NAME = 'جامع خادم الحرمين الشريفين'
export const SITE_DESCRIPTION = 'موسوعة الحديث النبوي الشريف – بحث وتحقيق'

// A light 1200×630 card — WhatsApp skips preview images over ~300 KB
const SHARE_IMAGE = { url: '/assets/brand/share-card.jpg', width: 1200, height: 630, alt: SITE_NAME }

export function openGraph(og: NonNullable<Metadata['openGraph']> = {}): Metadata['openGraph'] {
  return { siteName: SITE_NAME, locale: 'ar_AR', type: 'website', images: [SHARE_IMAGE], ...og }
}

export function twitter(tw: NonNullable<Metadata['twitter']> = {}): Metadata['twitter'] {
  return { card: 'summary_large_image', images: [SHARE_IMAGE.url], ...tw }
}

// Metadata for a page about one thing (a narrator, a book, a topic…): its own title and description
// in the <title>, the description tag, and the link preview.
export function pageMeta({ title, description, path, type = 'website' }: {
  title: string
  description?: string | null
  path: string
  type?: 'website' | 'article' | 'profile'
}): Metadata {
  const desc = description?.replace(/\s+/g, ' ').trim() || SITE_DESCRIPTION
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: openGraph({ title, description: desc, url: path, type }),
    twitter: twitter({ title, description: desc }),
  }
}

// Shorten text for a description, cutting at a word boundary
export function clip(text: string | null | undefined, n = 200): string {
  const s = (text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s
}
