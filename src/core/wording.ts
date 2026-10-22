/** Deliberately narrow wording alternatives; never applied to opaque constraints. */
export const preferenceFamilies = [
  ['深色', '暗色'], ['浅色', '亮色'],
  ['移动端', '手机端', '移动设备'],
  ['初学者', '入门者', '新手'],
] as const

export function preservesPreference(preference: string, body: string): boolean {
  if (body.includes(preference)) return true
  const family = preferenceFamilies.find(terms => terms.some(term => term === preference))
  return !!family?.some(term => body.includes(term))
}
