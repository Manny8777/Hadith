// Server components, run in the browser. A page is an async function that returns elements, some
// of them other server components (async or not) and some client components ('use client', marked
// $$client by the offline build). This walks the tree: it calls every server component and awaits
// it, and leaves client components to React, resolving only what they are given (children, and
// any other prop holding elements). The result is an ordinary element tree React can render.
import { cloneElement, createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react'

type AnyFn = ((props: any) => any) & { $$client?: boolean; $$typeof?: symbol; render?: unknown; _payload?: unknown }

const isClient = (t: AnyFn) => t.$$client === true

async function resolveProps(props: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  await Promise.all(Object.entries(props).map(async ([k, v]) => { out[k] = await resolveValue(v) }))
  return out
}

async function resolveValue(v: unknown): Promise<unknown> {
  if (Array.isArray(v)) return Promise.all(v.map(resolveValue))
  if (isValidElement(v)) return resolveNode(v)
  if (v && typeof (v as Promise<unknown>).then === 'function') return resolveValue(await v)
  // Plain objects can hold elements too (a map of slots: { [section]: <Badges /> })
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype && hasElement(v, 3)) {
    return resolveProps(v as Record<string, unknown>)
  }
  return v
}

// Whether a value holds an element within a few levels (plain data, the bulk of props, is left as is)
function hasElement(v: unknown, depth: number): boolean {
  if (isValidElement(v)) return true
  if (depth === 0 || !v || typeof v !== 'object') return false
  if (Array.isArray(v)) return v.some(x => hasElement(x, depth - 1))
  if (Object.getPrototypeOf(v) !== Object.prototype) return false
  return Object.values(v).some(x => hasElement(x, depth - 1))
}

export async function resolveNode(node: ReactNode): Promise<ReactNode> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return node
  if (Array.isArray(node)) return Promise.all(node.map(resolveNode)) as Promise<ReactNode>
  if (node && typeof (node as unknown as Promise<ReactNode>).then === 'function') return resolveNode(await (node as unknown as Promise<ReactNode>))
  if (!isValidElement(node)) return node
  const el = node as ReactElement<Record<string, unknown>>
  const type = el.type as unknown

  // A server component: call it with its props and resolve what it returns
  if (typeof type === 'function' && !isClient(type as AnyFn) && !(type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) {
    const rendered = await (type as AnyFn)(el.props)
    const resolved = await resolveNode(rendered as ReactNode)
    // Keep the element's key so lists stay keyed
    return el.key != null ? createElement(Fragment, { key: el.key }, resolved) : resolved
  }
  // A host element, a client component, a context provider, Suspense…: keep it, resolve its props
  const props = await resolveProps(el.props ?? {})
  return cloneElement(el, props)
}
