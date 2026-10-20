import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useSyncExternalStore, type ReactElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { baseResult } from '../src/core/engine.ts'
import { copyFor } from '../src/client/copy.ts'
import type { BoostEvent, BoostRequest, BoostResult } from '../src/types.ts'
import type { DraftSnapshot } from '../src/client/draft.ts'

const ORIGINAL = '写一份周报'
const OPTIMIZED = '请写一份周报，按重点组织内容。'

// The test deliberately keeps structural copies of the two DSH contracts it
// fakes instead of importing the client packages: those declarations merge into
// the global Context and would change host-side `ctx.sessions` typing in the
// shared `tsconfig.checks` project (host tests import the real host plugin).
interface ComposerInputState {
  draft: string
  attachmentIds: readonly string[]
  draftRev: number
  phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
  occurrences: readonly { occurrenceId: number }[]
  queue: readonly unknown[]
}
interface ComposerTokenSpan {
  start: number
  end: number
  draftRev: number
}
interface ComposerSlotProps {
  sessionId: string
  useInput: <S>(selector: (state: ComposerInputState) => S) => S
  readDraft(): DraftSnapshot
  inputActions: {
    insertText(text: string, span: ComposerTokenSpan): boolean
    persistDraft(): void
  }
  generate(request: BoostRequest, signal: AbortSignal): Promise<BoostResult>
  focusDraft(): void
  trackEvent(event: BoostEvent): void
}
type ComposerComponent = (props: ComposerSlotProps) => ReactElement | null

// Load the real component through a computed dynamic import for the same reason:
// a static `import ... from '../src/client/index.tsx'` would pull the DSH client
// declarations into the host test program. The module is identical at runtime.
const clientEntry = new URL('../src/client/index.tsx', import.meta.url).href
const { ComposerBooster } = await import(clientEntry) as { ComposerBooster: ComposerComponent }

/** Build the published InputState a mounted composer would expose to the slot. */
function plainState(draft: string, draftRev: number): ComposerInputState {
  return { draft, attachmentIds: [], draftRev, phase: 'plain', occurrences: [], queue: [] }
}

interface FixtureOptions {
  text?: string
  revision?: number
  insertText?: (text: string, span: ComposerTokenSpan) => boolean
  persistDraft?: () => void
}

/**
 * Slot-host fixture: the real ComposerBooster is rendered with the same standard
 * props the DSH session slot provides (useInput/inputActions/readDraft/...).
 * `useInput` is a genuine external-store hook, so insertText results re-render
 * the component the way the composer store does in the running app.
 */
function setup(options: FixtureOptions = {}) {
  let input = plainState(options.text ?? ORIGINAL, options.revision ?? 1)
  const listeners = new Set<() => void>()
  const inserts: { text: string; span: ComposerTokenSpan }[] = []
  const generated: BoostRequest[] = []
  const events: BoostEvent[] = []
  const pending: { request: BoostRequest; signal: AbortSignal; resolve(value: BoostResult): void }[] = []
  let persists = 0
  let focuses = 0
  let renderer: ReactTestRenderer | undefined

  const publish = (next: ComposerInputState): void => {
    input = next
    for (const listener of [...listeners]) listener()
  }
  const readDraft = (): DraftSnapshot => ({
    text: input.draft,
    revision: input.draftRev,
    locked: input.phase !== 'plain',
    hasReferences: input.occurrences.length > 0,
  })
  // SnapshotSelectorHook contract: use a real external store instead of a plain
  // getter so writes observed by replaceDraft reach React like the real store.
  const useInput = <S,>(selector: (state: ComposerInputState) => S): S => {
    const snapshot = useSyncExternalStore(
      listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
      () => input,
    )
    return selector(snapshot)
  }
  const props = (): ComposerSlotProps => ({
    sessionId: 'session-composer',
    useInput,
    readDraft,
    inputActions: {
      insertText(text, span) {
        inserts.push({ text, span })
        if (options.insertText) return options.insertText(text, span)
        publish({ ...input, draft: text, draftRev: input.draftRev + 1 })
        return true
      },
      persistDraft() {
        persists++
        options.persistDraft?.()
      },
    },
    generate(request, signal) {
      generated.push(request)
      return new Promise(resolve => { pending.push({ request, signal, resolve }) })
    },
    focusDraft() { focuses++ },
    trackEvent(event) { events.push(event) },
  })
  // The real slot composes many more standard props; this fixture supplies the
  // subset ComposerBooster actually consumes.
  const element = () => <ComposerBooster {...props()} />

  const refresh = (): void => { act(() => { renderer!.update(element()) }) }
  const button = (label: string) => {
    const found = renderer!.root.findAllByType('button').find(node => node.props['aria-label'] === label)
    assert.ok(found, `missing composer button: ${label}`)
    return found
  }
  const statusText = (): string => {
    const node = renderer!.root.findAll(candidate => candidate.props.role === 'status')[0]
    assert.ok(node, 'composer status region must be rendered')
    return node.children.filter((child): child is string => typeof child === 'string').join('')
  }
  return {
    render() { act(() => { renderer = create(element()) }) },
    unmount() { if (renderer) act(() => renderer!.unmount()) },
    refresh,
    button,
    statusText,
    readDraft,
    inserts,
    generated,
    events,
    persists: () => persists,
    focuses: () => focuses,
    setInput(patch: Partial<ComposerInputState>) { publish({ ...input, ...patch }); refresh() },
    start() { act(() => { button('优化提示词').props.onClick() }) },
    async complete(overrides: Partial<BoostResult> = {}, index = pending.length - 1) {
      const call = pending[index]
      assert.ok(call, 'generate must have been called before completing')
      await act(async () => {
        call.resolve({ ...baseResult(call.request, 'fixture'), status: 'ok', optimized: OPTIMIZED, ...overrides })
        await Promise.resolve()
      })
      refresh()
    },
  }
}

test('renders the real composer wiring and applies the result through insertText and persistDraft', async () => {
  const view = setup()
  try {
    view.render()
    assert.equal(view.button('优化提示词').props.disabled, false)
    view.start()
    assert.equal(view.generated.length, 1)
    assert.equal(view.generated[0].raw, ORIGINAL)
    assert.equal(view.generated[0].draft_revision, 1)
    assert.equal(view.generated[0].mode, 'standard')
    assert.equal(view.generated[0].language, 'zh')
    assert.deepEqual(view.generated[0].context_sources, [])
    await view.complete()
    assert.equal(view.inserts.length, 1)
    assert.equal(view.inserts[0].text, OPTIMIZED)
    // The write replaces exactly the snapshot that was optimized.
    assert.deepEqual(view.inserts[0].span, { start: 0, end: ORIGINAL.length, draftRev: 1 })
    assert.equal(view.persists(), 1, 'a successful insert is followed by exactly one persistDraft')
    assert.equal(view.focuses(), 1)
    assert.equal(view.readDraft().text, OPTIMIZED)
    assert.equal(view.readDraft().revision, 2)
    const applied = view.events.filter(event => event.name === 'boost_applied')
    assert.equal(applied.length, 1)
    assert.equal(applied[0].ok, true)
    assert.equal(applied[0].request_id, view.generated[0].request_id)
    // Evaluation events flowing through the real wiring carry no draft text.
    assert.ok(!JSON.stringify(view.events).includes(ORIGINAL))
    assert.ok(!JSON.stringify(view.events).includes(OPTIMIZED))
    assert.equal(view.statusText(), copyFor(ORIGINAL).notices.applied)
    // The external store re-render updates the undo affordance from the applied revision.
    assert.ok(view.button('还原原稿'))
    act(() => { view.button('还原原稿').props.onClick() })
    assert.equal(view.inserts.length, 2)
    assert.equal(view.inserts[1].text, ORIGINAL)
    assert.deepEqual(view.inserts[1].span, { start: 0, end: OPTIMIZED.length, draftRev: 2 })
    assert.equal(view.persists(), 2)
    assert.equal(view.readDraft().text, ORIGINAL)
    assert.deepEqual(view.events.filter(event => event.name === 'boost_undone').map(event => event.ok), [true])
  } finally { view.unmount() }
})

test('a rejected insertText means a changed draft: no persist, draft kept, change notice', async () => {
  const view = setup({ insertText: () => false })
  try {
    view.render()
    view.start()
    await view.complete()
    assert.equal(view.inserts.length, 1, 'the attempt is visible to the test fixture')
    assert.equal(view.persists(), 0)
    assert.equal(view.readDraft().text, ORIGINAL)
    assert.equal(view.statusText(), copyFor(ORIGINAL).notices.changed)
    const applied = view.events.filter(event => event.name === 'boost_applied')
    assert.equal(applied.length, 1)
    assert.equal(applied[0].ok, false)
    assert.equal(view.focuses(), 0)
  } finally { view.unmount() }
})

test('an insertText throw is reported as a changed draft instead of an applied result', async () => {
  const view = setup({ insertText: () => { throw new Error('editor-secret-body') } })
  try {
    view.render()
    view.start()
    await view.complete()
    assert.equal(view.inserts.length, 1)
    assert.equal(view.persists(), 0, 'a failed editor write must not persist')
    assert.equal(view.readDraft().text, ORIGINAL)
    assert.equal(view.statusText(), copyFor(ORIGINAL).notices.changed)
    assert.equal(view.focuses(), 0)
    assert.ok(!JSON.stringify(view.events).includes('editor-secret-body'))
    assert.ok(!JSON.stringify(view.statusText()).includes('editor-secret-body'))
  } finally { view.unmount() }
})

test('a persistDraft throw cannot turn an already written draft into a failure', async () => {
  const view = setup({ persistDraft: () => { throw new Error('persist-secret-body') } })
  try {
    view.render()
    view.start()
    await view.complete()
    assert.equal(view.inserts.length, 1)
    assert.equal(view.persists(), 1)
    assert.equal(view.readDraft().text, OPTIMIZED)
    assert.equal(view.readDraft().revision, 2)
    assert.equal(view.statusText(), copyFor(ORIGINAL).notices.applied)
    const applied = view.events.filter(event => event.name === 'boost_applied')
    assert.equal(applied.length, 1)
    assert.equal(applied[0].ok, true)
    assert.ok(!JSON.stringify(view.events).includes('persist-secret-body'))
    assert.ok(!JSON.stringify(view.statusText()).includes('persist-secret-body'))
  } finally { view.unmount() }
})

test('structured references and a busy composer disable the control and never call generate', async () => {
  const cases: [Partial<ComposerInputState>, 'references' | 'locked'][] = [
    [{ occurrences: [{ occurrenceId: 1 }] }, 'references'],
    [{ phase: 'submitting' }, 'locked'],
  ]
  for (const [patch, notice] of cases) {
    const view = setup()
    try {
      view.render()
      view.setInput(patch)
      assert.equal(view.button('优化提示词').props.disabled, true)
      act(() => { view.button('优化提示词').props.onClick() })
      assert.equal(view.generated.length, 0, 'a disabled composer must not start a model request')
      assert.equal(view.events.length, 0, 'no evaluation event is emitted when the control cannot run')
      assert.equal(view.statusText(), copyFor(ORIGINAL).notices[notice])
    } finally { view.unmount() }
  }
})
