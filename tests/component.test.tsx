import { test } from 'node:test'
import assert from 'node:assert/strict'
import { create, act, type ReactTestRenderer } from 'react-test-renderer'
import { Booster, type BoosterProps } from '../src/client/Booster.tsx'
import { baseResult } from '../src/core/engine.ts'
import type { BoostEvent, BoostRequest, BoostResult } from '../src/types.ts'
import type { DraftSnapshot } from '../src/client/draft.ts'
import { ClientFailure } from '../src/client/transport.ts'

function setup(onEvent?: (event: BoostEvent) => void) {
  let draft: DraftSnapshot = { text: '写一份周报', revision: 0, locked: false, hasReferences: false }
  const pending: { request: BoostRequest; signal: AbortSignal; resolve(value: BoostResult): void; reject(error: Error): void }[] = []
  let renderer!: ReactTestRenderer
  let session = 'first'
  let focused = 0, writes = 0
  const props = (): BoosterProps => ({
    draft, readDraft: () => draft,
    replaceDraft(revision, text) { if (revision !== draft.revision) return false; writes++; draft = { ...draft, text, revision: revision + 1 }; return true },
    focusDraft() { focused++ },
    generate(request, signal) { return new Promise((resolve, reject) => { pending.push({ request, signal, resolve, reject }) }) },
    onEvent,
  })
  act(() => { renderer = create(<Booster key={session} {...props()} />) })
  const refresh = () => act(() => renderer.update(<Booster key={session} {...props()} />))
  const button = (label: string) => renderer.root.findAllByType('button').find(node => node.props['aria-label'] === label)!
  return {
    renderer, button, read: () => draft, pending, focused: () => focused, writes: () => writes,
    edit(text: string) { draft = { ...draft, text, revision: draft.revision + 1 }; refresh() },
    change(values: Partial<DraftSnapshot>, render = true) { draft = { ...draft, ...values }; if (render) refresh() },
    switchSession() { session = 'second'; draft = { text: '新会话任务', revision: 0, locked: false, hasReferences: false }; refresh() },
    async complete(overrides: Partial<BoostResult> = {}, index = pending.length - 1) {
      const call = pending[index]
      await act(async () => { call.resolve({ ...baseResult(call.request, 'fixture'), status: 'ok', optimized: '请写一份周报，按重点组织内容。', ...overrides }); await Promise.resolve() })
      refresh()
    },
    async fail(error = new Error('secret-provider-error')) { await act(async () => { pending.at(-1)!.reject(error); await Promise.resolve() }); refresh() },
    start() { act(() => { button('优化提示词').props.onClick() }) },
    refresh,
  }
}
test('one click directly replaces the draft without any dialog or preview editor', async () => {
  const view = setup()
  try {
    view.start(); assert.equal(view.read().text, '写一份周报')
    assert.equal(view.renderer.root.findAll(node => node.props.role === 'dialog').length, 0)
    await view.complete()
    assert.equal(view.read().text, '请写一份周报，按重点组织内容。')
    assert.equal(view.focused(), 1); assert.equal(view.writes(), 1)
    assert.equal(view.renderer.root.findAllByType('textarea').length, 0)
    assert.equal(view.renderer.root.findAll(node => node.props.role === 'dialog').length, 0)
    // The status line replaces its whole message, so screen readers must not rebuild a diff.
    assert.equal(view.renderer.root.findAll(node => node.props.role === 'status')[0].props['aria-atomic'], 'true')
    act(() => view.button('还原原稿').props.onClick()); view.refresh()
    assert.equal(view.read().text, '写一份周报')
    assert.equal(view.focused(), 2); assert.equal(view.writes(), 2)
  } finally { act(() => view.renderer.unmount()) }
})
test('automatic replacement cannot overwrite edits made during optimization', async () => {
  const view = setup()
  try {
    view.start(); view.edit('用户的新任务'); await view.complete()
    assert.equal(view.read().text, '用户的新任务')
    assert.equal(view.button('还原原稿'), undefined)
  } finally { act(() => view.renderer.unmount()) }
})
test('live draft revision protects edits even before a React rerender', async () => {
  const view = setup()
  try {
    view.start(); view.change({ text: '尚未渲染的新任务', revision: 1 }, false); await view.complete()
    assert.equal(view.read().text, '尚未渲染的新任务')
  } finally { act(() => view.renderer.unmount()) }
})
test('clicking the busy icon cancels and ignores a late response', async () => {
  const view = setup()
  try {
    view.start(); act(() => view.button('取消优化').props.onClick())
    assert.equal(view.pending[0].signal.aborted, true); await view.complete()
    assert.equal(view.read().text, '写一份周报')
    assert.equal(view.button('优化提示词').props.disabled, false)
  } finally { act(() => view.renderer.unmount()) }
})
test('a cancelled request cannot replace the result of a newer request', async () => {
  const view = setup()
  try {
    view.start(); act(() => view.button('取消优化').props.onClick()); view.start()
    await view.complete({ optimized: '请整理一份周报。' }, 1)
    await view.complete({}, 0)
    assert.equal(view.read().text, '请整理一份周报。')
  } finally { act(() => view.renderer.unmount()) }
})
test('automatic replacement validates constraints locally before writing', async () => {
  const view = setup()
  try {
    view.start(); await view.complete({ optimized: '使用 React 写一份周报' })
    assert.equal(view.read().text, '写一份周报')
    assert.equal(view.button('还原原稿'), undefined)
  } finally { act(() => view.renderer.unmount()) }
})
test('optional suggestions are not automatically appended or approved', async () => {
  const view = setup()
  try {
    view.start(); await view.complete({ additions: [{ id: 's', kind: 'suggestion', value: '额外准备演示文稿', action: 'pending' }] })
    assert.equal(view.read().text, '请写一份周报，按重点组织内容。')
    view.start(); await view.complete({ optimized: '额外准备演示文稿', additions: [{ id: 's', kind: 'suggestion', value: '额外准备演示文稿', action: 'pending' }] })
    assert.equal(view.read().text, '请写一份周报，按重点组织内容。')
  } finally { act(() => view.renderer.unmount()) }
})
test('automatically applied and undo feedback stay correlated without false sends', async () => {
  const events: BoostEvent[] = []
  const view = setup(event => events.push(event))
  try {
    view.start(); await view.complete()
    act(() => view.button('还原原稿').props.onClick()); view.refresh(); view.edit('')
    assert.deepEqual(events.map(event => [event.name, event.ok]), [['boost_applied', true], ['boost_undone', true]])
    assert.ok(events.every(event => event.request_id === view.pending[0].request.request_id))
    assert.ok(!JSON.stringify(events).includes('写一份周报'))
  } finally { act(() => view.renderer.unmount()) }
})
test('fallback and transport failures keep the draft and allow retry from the same icon', async () => {
  const view = setup()
  try {
    view.start(); await view.complete({ status: 'fallback', reason_code: 'timeout' })
    assert.equal(view.read().text, '写一份周报')
    view.start(); await view.fail()
    assert.ok(!JSON.stringify(view.renderer.toJSON()).includes('secret-provider-error'))
    assert.equal(view.read().text, '写一份周报')
    view.start(); await view.complete()
    assert.equal(view.read().text, '请写一份周报，按重点组织内容。')
  } finally { act(() => view.renderer.unmount()) }
})
test('structured references and locked input cannot be replaced after a request starts', async () => {
  for (const change of [{ hasReferences: true }, { locked: true }]) {
    const view = setup()
    try {
      view.start(); view.change(change); await view.complete()
      assert.equal(view.read().text, '写一份周报')
      assert.equal(view.button('优化提示词').props.disabled, true)
    } finally { act(() => view.renderer.unmount()) }
  }
})
test('mismatched result metadata cannot be automatically written', async () => {
  const view = setup()
  try {
    view.start(); await view.complete({ request_id: 'other-request' })
    assert.equal(view.read().text, '写一份周报')
    assert.match(view.renderer.root.findAll(node => node.props.role === 'status')[0].children.join(''), /返回结果异常/)
  } finally { act(() => view.renderer.unmount()) }
})

test('a protocol failure explains the restart action while preserving the draft', async () => {
  const view = setup()
  try {
    view.start(); await view.fail(new ClientFailure('host_update_required'))
    assert.equal(view.read().text, '写一份周报')
    const status = view.renderer.root.findAll(node => node.props.role === 'status')[0].children.join('')
    assert.match(status, /完全退出并重开 DSH/)
    assert.equal(view.button('优化提示词').props.disabled, false)
  } finally { act(() => view.renderer.unmount()) }
})

test('a compatible legacy result still writes directly and indicates the feature limitation', async () => {
  const view = setup()
  try {
    view.start(); await view.complete({ warnings: ['host_legacy_compat'] })
    assert.equal(view.read().text, '请写一份周报，按重点组织内容。')
    assert.match(view.renderer.root.findAll(node => node.props.role === 'status')[0].children.join(''), /兼容旧后台/)
    assert.equal(view.renderer.root.findAll(node => node.props.role === 'dialog').length, 0)
  } finally { act(() => view.renderer.unmount()) }
})
test('switching session aborts the old request and leaves the new draft untouched', async () => {
  const view = setup()
  try {
    view.start(); view.switchSession()
    assert.equal(view.pending[0].signal.aborted, true)
    await view.complete()
    assert.equal(view.read().text, '新会话任务')
  } finally { act(() => view.renderer.unmount()) }
})
test('request ids fall back to a local id when crypto.randomUUID is unavailable', async () => {
  const view = setup()
  const crypto = globalThis.crypto
  const descriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID')
  try {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => { throw new Error('uuid unavailable') } })
    view.start()
    const request = view.pending[0].request
    assert.match(request.request_id, /^pb-[a-z0-9]+-[a-z0-9]+$/)
    assert.ok(request.request_id.length < 100)
    await view.complete()
    assert.equal(view.read().text, '请写一份周报，按重点组织内容。')
  } finally {
    if (descriptor) Object.defineProperty(crypto, 'randomUUID', descriptor)
    else Reflect.deleteProperty(crypto, 'randomUUID')
    act(() => view.renderer.unmount())
  }
})
test('fallback notices use the specific reason instead of claiming nothing needed replacing', async () => {
  const view = setup()
  const statusText = () => view.renderer.root.findAll(node => node.props.role === 'status')[0].children.join('')
  try {
    view.start(); await view.complete({ status: 'fallback', reason_code: 'timeout' })
    assert.equal(statusText(), '优化超时，原稿已保留，请重试。')
    view.start(); await view.complete({ status: 'fallback', reason_code: 'future_reason' })
    assert.equal(statusText(), '本次优化未完成，原稿已保留。')
    assert.doesNotMatch(statusText(), /本次无需替换/)
    // Only a skipped result without a reason code maps to "nothing to replace".
    view.start(); await view.complete({ status: 'skipped', reason_code: null })
    assert.equal(statusText(), '本次无需替换，原稿已保留。')
  } finally { act(() => view.renderer.unmount()) }
})
test('an undo write failure is reported instead of escaping the toolbar', async () => {
  let draft: DraftSnapshot = { text: '写一份周报', revision: 0, locked: false, hasReferences: false }
  let pending!: { request: BoostRequest; resolve(value: BoostResult): void }
  let replaceCalls = 0, renderer!: ReactTestRenderer
  const props = (): BoosterProps => ({
    draft, readDraft: () => draft,
    replaceDraft(revision, text) {
      if (replaceCalls++ > 0) throw new Error('editor unavailable')
      if (revision !== draft.revision) return false
      draft = { ...draft, text, revision: revision + 1 }
      return true
    },
    generate(request) { return new Promise(resolve => { pending = { request, resolve } }) },
  })
  const refresh = () => act(() => renderer.update(<Booster {...props()} />))
  const button = (label: string) => renderer.root.findAllByType('button').find(node => node.props['aria-label'] === label)!
  act(() => { renderer = create(<Booster {...props()} />) })
  try {
    act(() => { button('优化提示词').props.onClick() })
    await act(async () => {
      pending.resolve({ ...baseResult(pending.request, 'fixture'), status: 'ok', optimized: '请写一份周报。' })
      await Promise.resolve()
    })
    refresh()
    assert.equal(draft.text, '请写一份周报。')
    act(() => { button('还原原稿').props.onClick() })
    refresh()
    assert.equal(draft.text, '请写一份周报。')
    assert.equal(renderer.root.findAll(node => node.props.role === 'status')[0].children.join(''), '草稿已被编辑或发送，无法直接还原。')
  } finally { act(() => renderer.unmount()) }
})

test('repeated optimization refines lightly and undo returns to the first draft', async () => {
  const view = setup()
  try {
    view.start(); await view.complete()
    view.start()
    assert.equal(view.pending.at(-1)!.request.mode, 'light')
    assert.equal(view.pending.at(-1)!.request.use_configured_mode, false)
    await view.complete({ optimized: '请写一份周报，清楚说明重点。' })
    act(() => view.button('还原原稿').props.onClick()); view.refresh()
    assert.equal(view.read().text, '写一份周报')
    view.edit('写一份周报，详细说明进展'); view.start()
    assert.equal(view.pending.at(-1)!.request.use_configured_mode, true)
    await view.fail()
  } finally { act(() => view.renderer.unmount()) }
})

test('an unchanged refinement does not write or invalidate the original undo', async () => {
  const view = setup()
  try {
    view.start(); await view.complete()
    const applied = view.read().text
    view.start(); await view.complete({ optimized: applied })
    assert.equal(view.writes(), 1)
    act(() => view.button('还原原稿').props.onClick()); view.refresh()
    assert.equal(view.read().text, '写一份周报')
  } finally { act(() => view.renderer.unmount()) }
})
