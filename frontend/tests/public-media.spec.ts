import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

test.use({ ignoreHTTPSErrors: false })

// Optional live-network checks against small CC0 samples hosted by MDN.
// Local deterministic tests in app.spec.ts do not depend on these services.
test.skip(!process.env.VIBELOAD_LIVE_MEDIA, 'Set VIBELOAD_LIVE_MEDIA=1 to test public MDN media over the Internet.')

for (const [name, kind, url] of [
  ['t-rex-roar.mp3', 'audio', 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3'],
  ['flower.mp4', 'video', 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'],
] as const) {
  test(`public MDN ${name}: direct CORS download, playback and exact SHA256`, async ({ page, request }, testInfo) => {
    test.setTimeout(60_000)
    await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }))
    const response = await request.get(url, { timeout: 20_000 })
    expect(response.ok()).toBe(true)
    expect(response.headers()['access-control-allow-origin']).toBe('*')
    const original = await response.body()
    expect(original.length).toBeLessThan(2 * 1024 * 1024)
    await page.goto('/')
    await page.getByRole('textbox', { name: 'Liên kết media', exact: true }).fill(url)
    await page.getByRole('button', { name: 'Phân tích liên kết', exact: true }).click()
    await expect(page.getByText('Nguồn được hỗ trợ', { exact: true })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Tải tệp gốc', exact: true }).click()
    await expect(page.getByText('Hoàn thành truyền dữ liệu', { exact: true })).toBeVisible({ timeout: 20_000 })
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Lưu tệp', exact: true }).click()
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe(name)
    const destination = testInfo.outputPath(name)
    await download.saveAs(destination)
    expect(await download.failure()).toBeNull()
    const saved = await readFile(destination)
    const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')
    expect(hash(saved)).toBe(hash(original))
    await testInfo.attach(`public-${name}-verified`, { body: JSON.stringify({ url, bytes: saved.length, sha256: hash(saved), browserDownload: true }), contentType: 'application/json' })
    await page.getByRole('button', { name: 'Xem tệp', exact: true }).click()
    const media = page.locator(kind)
    await expect(media).toBeVisible()
    await expect.poll(() => media.evaluate((element: HTMLMediaElement) => element.readyState)).toBeGreaterThanOrEqual(1)
    expect(await media.evaluate(async (element: HTMLMediaElement) => { await element.play(); return element.error?.message })).toBeUndefined()
  })
}
