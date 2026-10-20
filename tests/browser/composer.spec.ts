import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => { await page.goto('/') })

test('applies and restores through the actual composer slot without sending', async ({ page }) => {
  const editor = page.getByLabel('任务草稿')
  await page.getByRole('button', { name: '优化提示词', exact: true }).click()
  await page.getByRole('button', { name: '完成请求' }).click()
  await expect(editor).toHaveValue('请写一份周报，按重点组织内容。')
  await expect(editor).toBeFocused()
  await page.getByRole('button', { name: '还原原稿' }).click()
  await expect(editor).toHaveValue('写一份周报')
  await expect(page.getByTestId('sends')).toHaveText('0')
})

test('keyboard activation and the browser undo transaction remain usable', async ({ page }) => {
  const editor = page.getByLabel('任务草稿')
  await editor.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')
  await expect(page.getByTestId('requests')).toHaveText('1')
  await page.getByRole('button', { name: '完成请求' }).click()
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('请写一份周报，按重点组织内容。')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor).toHaveValue('写一份周报')
  await expect(page.getByTestId('sends')).toHaveText('0')
})

test('edits during a request are never overwritten', async ({ page }) => {
  await page.getByRole('button', { name: '优化提示词', exact: true }).click()
  await page.getByLabel('任务草稿').fill('写一份周报，重点由用户补充')
  await page.getByRole('button', { name: '完成请求' }).click()
  await expect(page.getByLabel('任务草稿')).toHaveValue('写一份周报，重点由用户补充')
  await expect(page.locator('.pb').getByRole('status')).toContainText('草稿已变化')
})

test('active composition blocks both new optimization and late replacement', async ({ page }) => {
  const editor = page.getByLabel('任务草稿')
  const optimize = page.getByRole('button', { name: '优化提示词', exact: true })
  await editor.dispatchEvent('compositionstart', { data: '周' })
  await expect(optimize).toBeDisabled()
  await expect(page.getByTestId('requests')).toHaveText('0')
  await editor.dispatchEvent('compositionend', { data: '周' })
  await expect(optimize).toBeEnabled(); await optimize.click()
  await editor.dispatchEvent('compositionstart', { data: '报' })
  await page.getByRole('button', { name: '完成请求' }).click()
  await expect(editor).toHaveValue('写一份周报')
  await expect(page.locator('.pb').getByRole('status')).toContainText('输入法正在输入')
  await editor.dispatchEvent('compositionend', { data: '报' })
  await expect(optimize).toBeEnabled()
})

test('cancellation and session changes ignore a late response', async ({ page }) => {
  for (const action of ['取消优化', '切换会话']) {
    await page.getByRole('button', { name: '优化提示词', exact: true }).click()
    await page.getByRole('button', { name: action, exact: true }).click()
    await page.getByRole('button', { name: '完成请求' }).click()
    await expect(page.getByLabel('任务草稿')).toHaveValue('写一份周报')
    await expect(page.getByRole('button', { name: '优化提示词', exact: true })).toBeEnabled()
  }
})

test('guard details are readable and structured references disable the action', async ({ page }) => {
  await page.getByLabel('模拟守卫失败').check()
  await page.getByRole('button', { name: '优化提示词', exact: true }).click()
  await page.getByRole('button', { name: '完成请求' }).click()
  const status = page.locator('.pb').getByRole('status')
  await expect(status).toContainText('改写遗漏了原稿限制')
  await expect(status).toHaveAttribute('title', /无依据的数字/)
  await page.getByRole('button', { name: '切换引用' }).click()
  await expect(page.getByRole('button', { name: '优化提示词', exact: true })).toBeDisabled()
})

test('DSH dark theme, reduced motion and narrow toolbars remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
  const button = page.getByRole('button', { name: '优化提示词', exact: true })
  await expect(button).toHaveCSS('color', 'rgb(165, 213, 191)')
  await button.click()
  await expect(page.locator('.pb-progress')).toHaveCSS('animation-name', 'none')
  const box = await page.locator('.pb').boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  await page.getByRole('button', { name: '取消优化', exact: true }).click()
})
