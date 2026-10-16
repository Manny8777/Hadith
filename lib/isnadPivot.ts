/** Chains are ordered from earliest transmitter to compiler.
 * Identifies the end of the shared prefix before distinct immediate students.
 * This describes only the supplied paths, not absolute uniqueness or grading.
 */
export function findDisplayedPivot(chains: readonly (readonly number[])[]): { narratorId: number; studentIds: number[] } | null {
  if (chains.some(chain => chain.length === 0 || chain.some(id => !Number.isInteger(id) || id <= 0) || new Set(chain).size !== chain.length)) return null
  const paths = [...new Map(chains.map(chain => [chain.join(','), chain])).values()]
  if (paths.length < 2) return null
  const shortest = Math.min(...paths.map(path => path.length))
  let split = 0
  while (split < shortest && paths.every(path => path[split] === paths[0][split])) split++
  // A shorter path ending at the shared node supplies no evidence of branching.
  if (split === 0 || split === shortest) return null
  const studentIds = [...new Set(paths.map(path => path[split]))]
  return studentIds.length > 1 ? { narratorId: paths[0][split - 1], studentIds } : null
}
