import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

test.use({ serviceWorkers: 'block' })
test.skip(!process.env.VIBELOAD_AUDIT_ARTIFACTS, 'Enable only after real production downloads were saved by audit_production.py.')

for (const [filename, kind] of [
  ['facebook.mp4', 'video'],
  ['soundcloud-recovered.mp3', 'audio'],
  ['tiktok.mp4', 'video'],
  ['tiktok-mp3.mp3', 'audio'],
] as const) {
  test(`actual Render artifact plays in browser: ${filename}`, async ({ page }, info) => {
    const path = resolve('.qa/postdeploy-audit', filename)
    test.skip(!existsSync(path), 'No genuine production artifact exists for this sample.')
    await page.goto('/')
    await page.getByLabel('Chọn media từ thiết bị', { exact: true }).setInputFiles(path)
    const media = page.locator(kind)
    await expect(media).toBeVisible()
    await expect.poll(() => media.evaluate((element: HTMLMediaElement) => element.readyState)).toBeGreaterThanOrEqual(2)
    await media.evaluate(async (element: HTMLMediaElement) => { element.muted = true; await element.play() })
    await expect.poll(() => media.evaluate((element: HTMLMediaElement) => element.currentTime)).toBeGreaterThan(0.1)
    const playback = await media.evaluate((element: HTMLMediaElement) => ({
      currentTime: element.currentTime, duration: element.duration,
      error: element.error?.message ?? null, paused: element.paused,
    }))
    expect(playback.error).toBeNull()
    expect(playback.paused).toBe(false)
    const bytes = readFileSync(path)
    await info.attach('real-file-playback', { contentType: 'application/json', body: JSON.stringify({
      filename, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      project: info.project.name, physicalDevice: false, playback,
    }) })
  })
}
