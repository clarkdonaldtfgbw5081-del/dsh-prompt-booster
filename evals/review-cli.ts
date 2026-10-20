import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { prepareReview, summarizeReview } from './review.ts'

const read = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as unknown
const write = async (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
try {
  const [command, input, out, scores, report] = process.argv.slice(2)
  if (command === 'prepare' && input && out && !scores) {
    const local = resolve('.local')
    const target = resolve(out)
    const inside = relative(local, target)
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Review packets contain drafts; output must be a new directory under .local/')
    const prepared = prepareReview(await read(input))
    await mkdir(local, { recursive: true })
    await mkdir(target, { recursive: false })
    await write(join(target, 'blind.json'), prepared.packet)
    await write(join(target, 'key.private.json'), prepared.key)
    await write(join(target, 'scores.json'), prepared.scores)
    console.log('Blind packet and score template prepared locally; keep key.private.json hidden from reviewers.')
  } else if (command === 'summarize' && input && out && scores && report) {
    const summary = summarizeReview(await read(input), await read(out), await read(scores))
    await write(report, summary)
    console.log('Review summary written without draft text. Constructed examples do not establish real-user quality.')
  } else throw new Error('Usage: prepare <approved-dataset.json> <.local/new-directory> | summarize <dataset> <key.private.json> <scores.json> <report.json>')
} catch {
  console.error('Review failed: check consent, schema, complete scores, matching case ids and a fresh output path. Input content was not printed.')
  process.exitCode = 1
}
