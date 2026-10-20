import { test } from 'node:test'
import assert from 'node:assert/strict'
import { styles } from '../src/client/styles.ts'

const lightPalette = [
  '--pb-accent:#346f5b', '--pb-ink:#20332d', '--pb-muted:#68766f',
  '--pb-tint:rgba(52,111,91,.065)', '--pb-hover:rgba(52,111,91,.13)', '--pb-edge:rgba(52,111,91,.17)',
]
const darkPalette = [
  '--pb-accent:#a5d5bf', '--pb-ink:#e1ebe4', '--pb-muted:#9baa9f',
  '--pb-tint:rgba(142,200,173,.075)', '--pb-hover:rgba(142,200,173,.15)', '--pb-edge:rgba(142,200,173,.2)',
]
const darkRule = styles.match(/\[data-ds-dark-theme\]\s*\.pb\{([^}]*)\}/)?.[1] ?? ''

test('light palette stays the default for plain and explicitly-light hosts', () => {
  assert.equal(typeof styles, 'string')
  const base = styles.match(/(?:^|\n)\.pb\{([^}]*)\}/)?.[1] ?? ''
  for (const declaration of lightPalette) assert.ok(base.includes(declaration), `base rule misses ${declaration}`)
  for (const declaration of darkPalette) assert.ok(!base.includes(declaration), `base rule must not contain dark value ${declaration}`)
})

test('DSH-resolved dark theme wins via data-ds-dark-theme on the host root or body', () => {
  assert.ok(darkRule, 'missing a [data-ds-dark-theme] .pb rule')
  for (const declaration of darkPalette) assert.ok(darkRule.includes(declaration), `dark rule misses ${declaration}`)
  // A descendant selector covers the attribute on <html> and on <body> alike.
  assert.match(styles, /\[data-ds-dark-theme\]\s+\.pb\{/)
  // The palette is declared exactly once for DSH and once for the legacy fallback.
  for (const declaration of darkPalette) {
    assert.equal(styles.split(declaration).length - 1, 2, `${declaration} must appear exactly twice`)
  }
})

test('the prefers-color-scheme dark fallback is guarded so an explicit DSH light theme stays light', () => {
  const start = styles.indexOf('@media(prefers-color-scheme:dark)')
  const end = styles.indexOf('@media(prefers-reduced-motion:reduce)')
  assert.ok(start >= 0, 'missing prefers-color-scheme dark fallback')
  assert.ok(end > start, 'fallback must stay before the reduced-motion rules')
  const fallback = styles.slice(start, end)
  assert.match(fallback, /:root:not\(\[data-ds-theme-source\]\):not\(\[data-ds-dark-theme\]\) body:not\(\[data-ds-theme-source\]\):not\(\[data-ds-dark-theme\]\) \.pb\{/)
  assert.equal(fallback.split(':not([data-ds-theme-source])').length - 1, 2)
  assert.equal(fallback.split(':not([data-ds-dark-theme])').length - 1, 2)
  // A bare `.pb{` rule would override an explicit DSH light theme when the OS is dark.
  assert.ok(!/\)\{\.pb\{/.test(fallback), 'fallback must not apply an unguarded .pb rule')
  for (const declaration of darkPalette) assert.ok(fallback.includes(declaration), `fallback misses ${declaration}`)
})

test('reduced motion, forced colors and undo-button accessibility rules are preserved', () => {
  const reduced = styles.slice(styles.indexOf('@media(prefers-reduced-motion:reduce)'), styles.indexOf('@media(forced-colors:active)'))
  assert.match(reduced, /\.pb-progress\{animation:none\}/)
  assert.match(reduced, /\.pb-main\{transition:none\}/)
  assert.match(reduced, /\.pb-main:not\(:disabled\):hover\{transform:none\}/)

  const forced = styles.slice(styles.indexOf('@media(forced-colors:active)'))
  assert.match(forced, /\.pb-main\{color:ButtonText;border-color:ButtonText\}/)
  assert.match(forced, /\.pb-main:focus-visible\{outline-color:Highlight\}/)
  // The undo button is a .pb-icon without .pb-main and needs a visible forced-colors boundary.
  assert.match(forced, /\.pb-icon:not\(\.pb-main\)\{[^}]*border:1px solid ButtonText/)
  assert.match(forced, /\.pb-icon:not\(\.pb-main\)\{[^}]*color:ButtonText/)
  assert.match(forced, /\.pb-icon:not\(\.pb-main\):focus-visible\{outline-color:Highlight\}/)
})
