/** Logical rules contain commas inside nested clauses. Split only the outer rule fields. */
export function splitRuleFields(value: string): string[] {
  const fields: string[] = []
  let start = 0
  let depth = 0
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '(') depth++
    else if (value[index] === ')') depth = Math.max(0, depth - 1)
    else if (value[index] === ',' && depth === 0) {
      fields.push(value.slice(start, index))
      start = index + 1
    }
  }
  fields.push(value.slice(start))
  return fields
}
