import { Change, diff, type DiffConfig } from '@codemirror/merge'

const boundedDiff = { scanLimit: 1000, timeout: 25 }

/** Align complete lines first, then resolve character changes inside replacement lines. */
function diffYaml(a: string, b: string): readonly Change[] {
  if (a === b) return []
  const linesA = a.split('\n'), linesB = b.split('\n')
  const tokens = new Map<string, string>()
  const encode = (lines: string[]) => lines.map((line, index) => {
    const key = line + (index < lines.length - 1 ? '\n' : '')
    let token = tokens.get(key)
    if (token === undefined) {
      token = String.fromCharCode(256 + tokens.size)
      tokens.set(key, token)
    }
    return token
  }).join('')
  // Keep tokens within single, non-surrogate UTF-16 code units.
  if (linesA.length + linesB.length > 50_000) return diff(a, b, boundedDiff)
  const encodedA = encode(linesA), encodedB = encode(linesB)
  const offsets = (lines: string[], length: number) => {
    const result = [0]
    for (const line of lines) result.push(Math.min(length, result[result.length - 1] + line.length + 1))
    return result
  }
  const offsetsA = offsets(linesA, a.length), offsetsB = offsets(linesB, b.length)
  const changes: Change[] = []
  const deadline = Date.now() + 50
  const refine = (fromA: number, toA: number, fromB: number, toB: number) => {
    for (const change of diff(a.slice(fromA, toA), b.slice(fromB, toB), boundedDiff)) {
      changes.push(new Change(fromA + change.fromA, fromA + change.toA, fromB + change.fromB, fromB + change.toB))
    }
  }
  for (const block of diff(encodedA, encodedB, boundedDiff)) {
    const countA = block.toA - block.fromA, countB = block.toB - block.fromB
    if (countA === countB) {
      for (let i = 0; i < countA; i++) {
        if (Date.now() > deadline) return diff(a, b, { scanLimit: 500, timeout: 10 })
        refine(offsetsA[block.fromA + i], offsetsA[block.fromA + i + 1], offsetsB[block.fromB + i], offsetsB[block.fromB + i + 1])
      }
    } else {
      refine(offsetsA[block.fromA], offsetsA[block.toA], offsetsB[block.fromB], offsetsB[block.toB])
    }
  }
  return changes
}

export const yamlDiffConfig: DiffConfig = { override: diffYaml }
