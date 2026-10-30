// next/navigation in the offline build. notFound()/redirect() throw markers the renderer catches;
// the hooks read the offline router (./router).
import { useSyncExternalStore } from 'react'
import { router } from '../router'

export class NotFoundError extends Error { constructor() { super('NEXT_NOT_FOUND') } }
export class RedirectError extends Error { constructor(public url: string) { super('NEXT_REDIRECT') } }

export function notFound(): never { throw new NotFoundError() }
export function redirect(url: string): never { throw new RedirectError(url) }
export function permanentRedirect(url: string): never { throw new RedirectError(url) }
export const RedirectType = { push: 'push', replace: 'replace' } as const

const useLocation = () => useSyncExternalStore(router.subscribe, router.snapshot, router.snapshot)

export function useRouter() {
  return {
    push: (href: string, _o?: unknown) => router.navigate(href),
    replace: (href: string, _o?: unknown) => router.navigate(href, { replace: true }),
    refresh: () => router.refresh(),
    back: () => history.back(),
    forward: () => history.forward(),
    prefetch: (_href: string) => {},
  }
}
export function usePathname() { return useLocation().pathname }
export function useSearchParams() { return useLocation().searchParams }
export function useParams() { return useLocation().params }
export function useSelectedLayoutSegment() { return null }
export function useSelectedLayoutSegments() { return [] }
export type ReadonlyURLSearchParams = URLSearchParams
