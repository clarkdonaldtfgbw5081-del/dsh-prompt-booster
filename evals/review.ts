import { z } from 'zod'
import { createHash, randomInt } from 'node:crypto'
import { percentile } from './metrics.ts'

const outcome = z.object({
  status: z.enum(['ok', 'skipped', 'fallback', 'cancelled']),
  text: z.string().max(30000),
  latency_ms: z.number().finite().nonnegative(),
}).strict()
export const reviewDatasetSchema = z.object({
  schema: z.literal(1),
  provenance: z.enum(['synthetic', 'user-approved']),
  consent_to_evaluate: z.boolean(),
  baseline: z.string().min(1).max(100),
  candidate: z.string().min(1).max(100),
  cases: z.array(z.object({
    id: z.string().regex(/^[\w-]{1,80}$/),
    raw: z.string().min(1).max(20000),
    must_preserve: z.array(z.string().min(1)).max(40).default([]),
    forbidden: z.array(z.string().min(1)).max(40).default([]),
    baseline: outcome, candidate: outcome,
  }).strict()).min(1).max(500),
}).strict().superRefine((data, ctx) => {
  if (!data.consent_to_evaluate) ctx.addIssue({ code: 'custom', message: 'Only explicitly approved evaluation data may be imported' })
  if (new Set(data.cases.map(row => row.id)).size !== data.cases.length) ctx.addIssue({ code: 'custom', message: 'Duplicate case id' })
})
export type ReviewDataset = z.infer<typeof reviewDatasetSchema>
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const rating = z.object({
  intent: z.number().int().min(0).max(2),
  completeness: z.number().int().min(0).max(2),
  usefulness: z.number().int().min(0).max(2),
}).strict()
export const reviewScoresSchema = z.array(z.object({
  id: z.string(), preferred: z.enum(['A', 'B', 'tie', 'neither']), A: rating, B: rating,
}).strict()).min(1)

/** The public packet hides version labels; the separate key must stay with the evaluator. */
export function prepareReview(input: unknown, flip: () => boolean = () => randomInt(2) === 1) {
  const data = reviewDatasetSchema.parse(input)
  const assignments = data.cases.map(row => ({ id: row.id, A: flip() ? 'candidate' as const : 'baseline' as const }))
  return {
    packet: { schema: 1, cases: data.cases.map((row, index) => ({
      id: row.id, raw: row.raw,
      A: row[assignments[index].A].text,
      B: row[assignments[index].A === 'candidate' ? 'baseline' : 'candidate'].text,
    })) },
    key: { schema: 1, fingerprint: digest(data), assignments },
    scores: data.cases.map(row => ({ id: row.id, preferred: null,
      A: { intent: null, completeness: null, usefulness: null }, B: { intent: null, completeness: null, usefulness: null } })),
  }
}

export function summarizeReview(input: unknown, privateKey: unknown, scores: unknown) {
  const data = reviewDatasetSchema.parse(input)
  const key = z.object({ schema: z.literal(1), fingerprint: z.string(), assignments: z.array(z.object({
    id: z.string(), A: z.enum(['baseline', 'candidate']),
  }).strict()) }).strict().parse(privateKey)
  const ratings = reviewScoresSchema.parse(scores)
  const ids = data.cases.map(row => row.id)
  for (const rows of [key.assignments, ratings]) {
    if (rows.length !== ids.length || new Set(rows.map(row => row.id)).size !== ids.length || rows.some(row => !ids.includes(row.id))) throw new Error('Review must contain exactly the dataset case ids')
  }
  if (key.fingerprint !== digest(data)) throw new Error('Dataset changed after blind review preparation')
  const result = (side: 'baseline' | 'candidate') => {
    let wins = 0, criticalFailures = 0, score = 0, ok = 0, preserved = 0, checked = 0
    for (const row of data.cases) {
      const a = key.assignments.find(item => item.id === row.id)!.A
      const label = a === side ? 'A' : 'B'
      const review = ratings.find(item => item.id === row.id)!
      if (review.preferred === label) wins++
      const marks = review[label]
      if (marks.intent === 0 || marks.completeness === 0) criticalFailures++
      score += marks.intent + marks.completeness + marks.usefulness
      if (row[side].status === 'ok') {
        ok++
        if (row.must_preserve.length || row.forbidden.length) {
          checked++
          if (row.must_preserve.every(text => row[side].text.includes(text)) && !row.forbidden.some(text => row[side].text.includes(text))) preserved++
        }
      }
    }
    return { version: data[side], total: ids.length, usable: ok, coverage: ok / ids.length,
      wins, criticalFailures, meanScore: score / ids.length,
      exactChecks: { passed: preserved, evaluated: checked },
      p90_ms: percentile(data.cases.map(row => row[side].latency_ms), 0.9) }
  }
  return { schema: 1, provenance: data.provenance, fingerprint: key.fingerprint,
    baseline: result('baseline'), candidate: result('candidate'),
    ties: ratings.filter(row => row.preferred === 'tie').length,
    neither: ratings.filter(row => row.preferred === 'neither').length }
}
