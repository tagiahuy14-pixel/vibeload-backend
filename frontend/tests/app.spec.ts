import { test, expect, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const fixtureRoot = resolve('.qa/fixtures')
const mediaOrigin = 'https://media.vibeload.test:8443'
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
async function analyze(page: Page, path: string) {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Liên kết media', exact: true }).fill(`${mediaOrigin}${path}`)
  await page.getByRole('button', { name: 'Phân tích liên kết', exact: true }).click()
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test.beforeAll(async ({ browser }) => {
  // A real VP8 WebM is encoded by Chromium; no fabricated video header.
  const recorderPage = await browser.newPage()
  await recorderPage.goto('http://127.0.0.1:4173')
  const bytes = await recorderPage.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48
    const context = canvas.getContext('2d')!
    const stream = canvas.captureStream(10)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 30_000 })
    const chunks: BlobPart[] = []
    const done = new Promise<Blob>(resolve => { recorder.ondataavailable = event => chunks.push(event.data); recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start()
    for (let frame = 0; frame < 6; frame++) {
      context.fillStyle = frame % 2 ? '#7c3aed' : '#2563eb'; context.fillRect(0, 0, 64, 48)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    recorder.stop()
    const blob = await done; stream.getTracks().forEach(track => track.stop())
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  await mkdir(fixtureRoot, { recursive: true })
  await writeFile(resolve(fixtureRoot, 'clip.webm'), Buffer.from(bytes))
  await recorderPage.close()
})

test.beforeEach(async ({ page }) => {
  // Exercise the browser download fallback. Native OS save dialogs are a separate manual check.
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }) })
})

test('responsive pages, refresh, theme persistence and keyboard dialog', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  for (const [path, title] of [['/', 'Tải Media'], ['/downloads', 'Tải xuống'], ['/library', 'Thư viện'], ['/settings', 'Cài đặt']]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await noOverflow(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await page.screenshot({ path: resolve(`.qa/screenshots/${testInfo.project.name}-${path.slice(1) || 'home'}.png`), fullPage: true })
  }
  await page.getByRole('button', { name: 'Tối', exact: true }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: resolve(`.qa/screenshots/${testInfo.project.name}-settings-dark.png`), fullPage: true })
  await page.getByRole('button', { name: 'Sáng', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Hướng dẫn sử dụng', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/')
  await noOverflow(page)
  expect(errors).toEqual([])
})

test('invalid URLs and unsupported platforms are rejected without media requests', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173')) requests.push(request.url()) })
  await page.goto('/')
  for (const input of ['not a url', 'http://example.com/file.mp4', 'https://127.0.0.1/file.mp4', 'https://user:pass@example.com/file.mp4']) {
    await page.getByRole('textbox', { name: 'Liên kết media', exact: true }).fill(input)
    await page.getByRole('button', { name: 'Phân tích liên kết', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Không thể phân tích liên kết')
  }
  for (const input of ['https://x.com/test/status/123', 'https://www.pinterest.com/pin/123/']) {
    await page.getByRole('textbox', { name: 'Liên kết media', exact: true }).fill(input)
    await page.getByRole('button', { name: 'Phân tích liên kết', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Nguồn này chưa có bộ trích xuất được tích hợp trong VibeLoad Web.')
    await expect(page.getByRole('link', { name: 'Mở nội dung gốc' })).toHaveAttribute('href', input)
  }
  expect(requests).toEqual([])
})

// Contract checks for UI routing only. Live media evidence is recorded separately
// by backend/tests/verify_repair.py; these fixtures do not prove extraction works.
test('short TikTok URLs reach the backend after wakeup', async ({ page }) => {
  let checks = 0
  let analyzed = ''
  await page.route('**/api/health', route => route.fulfill({
    status: ++checks === 1 ? 503 : 200,
    contentType: 'application/json', body: JSON.stringify({ status: 'ok' }),
  }))
  await page.route('**/api/analyze', route => {
    analyzed = route.request().postDataJSON().url
    return route.fulfill({ json: {
      success: true, url: analyzed, title: 'Bài TikTok kiểm thử', thumbnail: '', uploader: 'Fixture',
      duration: 0, platform: 'tiktok', is_photo_album: true, is_audio_only: false,
      video_options: [], audio_options: [], photos: [{ id: '1', index: 1, url: 'https://cdn.example/photo.jpg' }],
    } })
  })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Liên kết media', exact: true }).fill('https://vt.tiktok.com/fixture/')
  await page.getByRole('button', { name: 'Phân tích liên kết', exact: true }).click()
  await expect(page.getByText('Bài TikTok kiểm thử', { exact: true })).toBeVisible()
  expect(checks).toBe(2)
  expect(analyzed).toBe('https://vt.tiktok.com/fixture/')
  await noOverflow(page)
})

test('backend errors retain their specific message and request ID', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok' } }))
  await page.route('**/api/analyze', route => route.fulfill({ status: 500, json: {
    success: false, error: { message: 'Máy chủ gặp lỗi nội bộ.', requestId: 'ui-request-1' },
  } }))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Liên kết media', exact: true }).fill('https://vt.tiktok.com/fixture/')
  await page.getByRole('button', { name: 'Phân tích liên kết', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Máy chủ gặp lỗi nội bộ. (Mã: ui-request-1)')
  await expect(page.getByRole('alert')).not.toContainText('Nguồn chưa được hỗ trợ')
})

test('lost job after restart asks the user to analyze again', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok' } }))
  await page.route('**/api/analyze', route => route.fulfill({ json: {
    success: true, url: 'https://vt.tiktok.com/fixture/', title: 'Video kiểm thử', uploader: 'Fixture',
    duration: 2, thumbnail: '', platform: 'tiktok', is_photo_album: false, is_audio_only: false,
    video_options: [{ format_id: 'best', resolution: '360p', height: 360, width: 640, ext: 'mp4', filesize: 0, needs_merge: false }],
    audio_options: [], photos: [],
  } }))
  await page.route('**/api/downloads', route => route.fulfill({ status: 202, json: {
    id: '6a9d0a0d-b73f-4d7a-9f1c-ef362a849d49', status: 'queued', progress_percent: 0,
    downloaded_bytes: 0, total_bytes: 0, speed_bytes_sec: 0, eta_seconds: 0, created_at: 1, updated_at: 1,
  } }))
  await page.route('**/api/downloads/*', route => route.fulfill({ status: 404, json: {
    success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy tác vụ.', retryable: false, requestId: 'restart-ui' },
  } }))
  await page.route('**/api/downloads/*/cancel', route => route.fulfill({ json: { success: false } }))
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Liên kết media', exact: true }).fill('https://vt.tiktok.com/fixture/')
  await page.getByRole('button', { name: 'Phân tích liên kết', exact: true }).click()
  await expect(page.getByText('Video kiểm thử', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tải xuống', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Hãy phân tích và tải lại')
})

for (const [name, kind] of [['image.png', 'image'], ['clip.webm', 'video'], ['tone.wav', 'audio'], ['compressed.png', 'image']] as const) {
  test(`direct ${kind} ${name}: real CORS fetch, playable preview and exact saved bytes`, async ({ page }, testInfo) => {
    await analyze(page, `/${name}`)
    await expect(page.getByText('Nguồn được hỗ trợ', { exact: true })).toBeVisible()
    if (name === 'compressed.png') await expect(page.locator('.source-result')).toContainText('Chưa biết dung lượng')
    await page.getByRole('button', { name: 'Tải tệp gốc', exact: true }).click()
    await expect(page.getByText('Hoàn thành truyền dữ liệu', { exact: true })).toBeVisible()
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Lưu tệp', exact: true }).click()
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe(name)
    const savedPath = testInfo.outputPath(`saved-${name}`)
    await download.saveAs(savedPath)
    expect(await download.failure()).toBeNull()
    const [saved, original] = await Promise.all([readFile(savedPath), readFile(resolve(fixtureRoot, name === 'compressed.png' ? 'image.png' : name))])
    expect(saved.length).toBeGreaterThan(0)
    expect(hash(saved)).toBe(hash(original))
    await testInfo.attach(`verified-${kind}-sha256`, { body: JSON.stringify({ fileName: name, bytes: saved.length, sha256: hash(saved) }), contentType: 'application/json' })
    await page.getByRole('button', { name: 'Xem tệp', exact: true }).click()
    if (kind === 'image') {
      const image = page.getByRole('img', { name, exact: true })
      await expect(image).toBeVisible()
      expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 64)).toBe(true)
    } else {
      const element = page.locator(kind)
      await expect(element).toBeVisible()
      await expect.poll(() => element.evaluate((media: HTMLMediaElement) => media.readyState)).toBeGreaterThanOrEqual(1)
      const result = await element.evaluate(async (media: HTMLMediaElement) => { await media.play(); return { error: media.error?.message, width: media instanceof HTMLVideoElement ? media.videoWidth : 0, duration: media.duration } })
      expect(result.error).toBeUndefined()
      if (kind === 'video') expect(result.width).toBe(64)
      else expect(result.duration).toBeCloseTo(1, 1)
    }
    await noOverflow(page)
    await page.reload()
    await expect(page.getByText('Chọn lại tệp để mở', { exact: false })).toBeVisible()
    await expect(page.locator('.preview-card')).toHaveCount(0)
    expect((await page.evaluate(() => JSON.stringify(localStorage))).includes(mediaOrigin)).toBe(false)
  })
}

test('real browser CORS denial, HTML masquerade and changed source never save a file', async ({ page }) => {
  const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()))
  await analyze(page, '/blocked.png')
  await expect(page.getByRole('alert')).toContainText('CORS')
  await expect(page.getByRole('button', { name: 'Tải tệp gốc', exact: true })).toHaveCount(0)
  await analyze(page, '/wrong.png')
  await expect(page.getByRole('alert')).toContainText('không phải tệp ảnh')
  await analyze(page, `/changed.png?case=${Date.now()}`)
  await expect(page.getByText('Nguồn được hỗ trợ', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tải tệp gốc', exact: true }).click()
  await expect(page.getByText('Thất bại', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu tệp', exact: true })).toHaveCount(0)
  expect(downloads).toEqual([])
})

test('unknown-length streaming shows real byte count, no percent, and cancels cleanly', async ({ page }) => {
  const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()))
  await analyze(page, '/unknown.wav')
  await expect(page.getByText('Nguồn được hỗ trợ', { exact: true })).toBeVisible()
  await expect(page.getByText('Chưa biết dung lượng', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Tải tệp gốc', exact: true }).click()
  await expect(page.getByText('Đang nhận dữ liệu · Chưa biết tổng dung lượng', { exact: true })).toBeVisible()
  await expect(page.locator('.progress-meta')).not.toContainText('0 B đã nhận')
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('value')
  await expect(page.locator('.progress-heading')).not.toContainText('%')
  await page.getByRole('button', { name: 'Hủy tải', exact: true }).click()
  await expect(page.getByText('Đã hủy', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu tệp', exact: true })).toHaveCount(0)
  expect(downloads).toEqual([])
})

test('known-length progress is measured and URL analysis can be cancelled', async ({ page }) => {
  await analyze(page, '/known.wav')
  await expect(page.getByText('Nguồn được hỗ trợ', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tải tệp gốc', exact: true }).click()
  await expect(page.locator('.progress-heading strong')).toHaveText(/^\d+%$/)
  await expect.poll(() => page.getByRole('progressbar').evaluate((progress: HTMLProgressElement) => progress.value)).toBeGreaterThan(0)
  const measured = await page.locator('.task-card').evaluate(element => {
    const progress = element.querySelector('progress')!
    return { received: progress.value, total: progress.max, label: element.querySelector('.progress-heading strong')!.textContent }
  })
  expect(measured.total).toBe(640_044)
  expect(measured.received).toBeGreaterThan(0)
  expect(measured.received).toBeLessThan(measured.total)
  expect(measured.label).toBe(`${Math.floor(measured.received / measured.total * 100)}%`)
  await page.getByRole('button', { name: 'Hủy tải', exact: true }).click()
  await expect(page.getByText('Đã hủy', { exact: true })).toBeVisible()
  await analyze(page, '/waiting.wav')
  await expect(page.getByText('Đang kiểm tra URL, loại tệp và quyền đọc từ nguồn…', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hủy', exact: true }).click()
  await expect(page.getByText('Đã hủy kiểm tra URL.', { exact: true })).toBeVisible()
})

test('size cap and local file picker protect memory and validate real media', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('combobox', { name: 'Giới hạn dung lượng mỗi tệp', exact: true }).selectOption('25')
  await analyze(page, '/big.wav')
  await expect(page.getByText('Nguồn được hỗ trợ', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tải tệp gốc', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('vượt giới hạn')
  await page.goto('/library')
  const picker = page.getByLabel('Chọn media từ thiết bị', { exact: true })
  await picker.setInputFiles(resolve(fixtureRoot, 'image.png'))
  await expect(page.getByRole('img', { name: 'image.png', exact: true })).toBeVisible()
  await expect(page.getByText('Đã chọn từ thiết bị', { exact: true })).toBeVisible()
  await picker.setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('<html>bad file</html>') })
  await expect(page.getByRole('status')).toContainText('không phải tệp ảnh')
  await picker.setInputFiles({ name: 'oversized.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(25 * 1024 * 1024 + 1) })
  await expect(page.getByRole('status')).toContainText('vượt giới hạn 25 MiB')
})

test('PWA manifest, shell cache, offline deep routes and no cached media', async ({ page, context }) => {
  await page.goto('/')
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active)).toBe(true)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!
    return (await fetch(link.href)).json()
  })
  expect(manifest.name).toContain('VibeLoad')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.some((icon: { sizes: string }) => icon.sizes === '192x192')).toBe(true)
  expect(manifest.icons.some((icon: { sizes: string }) => icon.sizes === '512x512')).toBe(true)
  await analyze(page, '/image.png')
  await expect(page.getByText('Nguồn được hỗ trợ', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tải tệp gốc', exact: true }).click()
  await expect(page.getByText('Hoàn thành truyền dữ liệu', { exact: true })).toBeVisible()
  const cacheUrls = await page.evaluate(async () => {
    const keys = await caches.keys()
    return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat()
  })
  expect(cacheUrls.some(url => url.endsWith('/index.html'))).toBe(true)
  expect(cacheUrls.every(url => url.startsWith('http://127.0.0.1:4173/'))).toBe(true)
  expect(cacheUrls.some(url => url.includes('media.vibeload.test') || url.startsWith('blob:'))).toBe(false)
  await context.setOffline(true)
  for (const [path, title] of [['/library', 'Thư viện'], ['/settings', 'Cài đặt'], ['/', 'Tải Media']]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByText('Bạn đang ngoại tuyến.', { exact: false })).toBeVisible()
  }
  await context.setOffline(false)
})

test('record simulated device performance and production transfer sizes', async ({ page, context }, testInfo) => {
  const mobile = testInfo.project.name.startsWith('mobile')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: mobile ? 4 : 1 })
  if (mobile) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 200_000, uploadThroughput: 96_000, connectionType: 'cellular4g' })
  const metrics = []
  for (let sample = 0; sample < 3; sample++) {
    const started = performance.now()
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Tải Media', exact: true })).toBeVisible()
    const interactiveMs = performance.now() - started
    metrics.push(await page.evaluate(interactiveMs => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      return { interactiveMs: Math.round(interactiveMs), domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd), transferredBytes: resources.reduce((total, resource) => total + resource.transferSize, 0), javascriptBytes: resources.filter(resource => resource.name.endsWith('.js')).reduce((total, resource) => total + resource.encodedBodySize, 0) }
    }, interactiveMs))
    await noOverflow(page)
  }
  await testInfo.attach('simulated-performance', { body: JSON.stringify({ simulation: true, cpuRate: mobile ? 4 : 1, latencyMs: mobile ? 80 : 0, samples: metrics }), contentType: 'application/json' })
  await writeFile(resolve(`.qa/performance-${testInfo.project.name}.json`), JSON.stringify({ simulation: true, cpuRate: mobile ? 4 : 1, samples: metrics }, null, 2))
  await cdp.detach()
})
