import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const js = ts.transpileModule(fs.readFileSync('lib/isnadPivot.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { findDisplayedPivot: pivot } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
test('8760: branches at al-Amash, excludes shared compiler', () => {
  assert.deepEqual(pivot([[3026,6088,2809,2638,2472,5178,5495],[3026,6088,2809,2638,2779,3875,941,5495]]), { narratorId:2638, studentIds:[2472,2779] })
})
test('shared Companion is pivot only when immediate students diverge', () => assert.deepEqual(pivot([[1,2,4],[1,3,4]]), {narratorId:1,studentIds:[2,3]}))
test('insufficient and ambiguous paths make no claim', () => {
  for (const paths of [[],[[1,2]],[[1,2],[1,2]],[[1,2],[1,2,3]],[[1,3,4],[2,3,4]],[[1,2,1],[1,3,1]],[[1,0],[1,2]]]) assert.equal(pivot(paths),null)
})
test('duplicates and input order do not change the pivot', () => {
  assert.equal(pivot([[1,2,4],[1,2,4],[1,3,4]]).narratorId,1)
  assert.equal(pivot([[1,3,4],[1,2,4]]).narratorId,1)
})

