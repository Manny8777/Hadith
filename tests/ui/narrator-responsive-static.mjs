import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const source = await readFile(path.join(root, 'app/narrator/[id]/page.tsx'), 'utf8')

assert.match(
  source,
  /className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3"/,
  'narrator header must wrap its navigation on narrow screens',
)
assert.match(
  source,
  /className="flex w-full min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 sm:w-auto sm:flex-none"/,
  'narrator subnavigation must scroll inside its own bounded container',
)
assert.match(source, /<h1 className="text-lg font-bold text-amber-100">/, 'narrator header title must remain present')

console.log('Narrator responsive static checks passed.')
