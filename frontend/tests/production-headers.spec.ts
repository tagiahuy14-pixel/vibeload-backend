import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test.use({ serviceWorkers: 'block', ignoreHTTPSErrors: false })
test.skip(!process.env.VIBELOAD_LIVE_MEDIA, 'This CSP integration check fetches a small public CC0 MP3 from MDN.')

test('Vercel security headers reproduced locally allow app, HTTPS media and blob preview', async ({ page }) => {
  const configuration = JSON.parse(await readFile(resolve('vercel.json'), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
  const headers = Object.fromEntries(configuration.headers.find(rule => rule.source === '/(.*)')!.headers.map(header => [header.key, header.value]))
  const errors: string[] = []
  const violations: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    ;(window as Window & { cspViolations?: string[] }).cspViolations = []
    document.addEventListener('securitypolicyviolation', event => (window as Window & { cspViolations: string[] }).cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`))
  })
  // Apply the exact configured HTTP headers to real preview responses. This
  // validates browser CSP behavior locally; it is not a deployed-Vercel check.
  await page.route('http://127.0.0.1:4173/**', async route => {
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), ...headers } })
  })
  const navigation = await page.goto('/')
  expect(await navigation!.headerValue('Content-Security-Policy')).toBe(headers['Content-Security-Policy'])
  await expect(page.getByRole('heading', { name: 'Tải Media', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Liên kết media', exact: true }).fill('https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3')
  await page.getByRole('button', { name: 'Phân tích liên kết', exact: true }).click()
  await expect(page.getByText('Nguồn được hỗ trợ', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tải tệp gốc', exact: true }).click()
  await expect(page.getByText('Hoàn thành truyền dữ liệu', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Xem tệp', exact: true }).click()
  await expect(page.locator('audio')).toBeVisible()
  await expect.poll(() => page.locator('audio').evaluate((media: HTMLAudioElement) => media.readyState)).toBeGreaterThanOrEqual(1)
  expect(await page.locator('audio').evaluate(async (media: HTMLAudioElement) => { await media.play(); return media.error?.message })).toBeUndefined()
  await page.getByLabel('Chọn media từ thiết bị', { exact: true }).setInputFiles(resolve('.qa/fixtures/image.png'))
  const image = page.getByRole('img', { name: 'image.png', exact: true })
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(64)
  violations.push(...await page.evaluate(() => (window as Window & { cspViolations: string[] }).cspViolations))
  expect(errors).toEqual([])
  expect(violations).toEqual([])
})
