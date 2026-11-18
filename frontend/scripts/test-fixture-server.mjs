// Local QA only. Never included in dist or deployed to Vercel.
import { createServer } from 'node:https'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import sharp from 'sharp'

const root = resolve('.qa/fixtures')
mkdirSync(root, { recursive: true })
const key = join(root, 'localhost-key.pem')
const cert = join(root, 'localhost-cert.pem')
if (!existsSync(key) || !existsSync(cert)) {
  const windowsOpenSsl = 'C:/Program Files/Git/usr/bin/openssl.exe'
  const openssl = process.env.OPENSSL_BIN || (process.platform === 'win32' && existsSync(windowsOpenSsl) ? windowsOpenSsl : 'openssl')
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', key, '-out', cert, '-subj', '/CN=media.vibeload.test', '-addext', 'subjectAltName=DNS:media.vibeload.test,IP:127.0.0.1'], { stdio: 'ignore' })
}

const image = await sharp({ create: { width: 64, height: 48, channels: 4, background: '#2563eb' } }).png().toBuffer()
writeFileSync(join(root, 'image.png'), image)
function wav(seconds) {
  const samples = 16_000 * seconds
  const result = Buffer.alloc(44 + samples * 2)
  result.write('RIFF', 0); result.writeUInt32LE(result.length - 8, 4); result.write('WAVEfmt ', 8)
  result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22)
  result.writeUInt32LE(16_000, 24); result.writeUInt32LE(32_000, 28)
  result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34); result.write('data', 36); result.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) result.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 16_000) * 4000), 44 + i * 2)
  return result
}
const audio = wav(1)
const slowAudio = wav(20)
writeFileSync(join(root, 'tone.wav'), audio)
const counts = new Map()
const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
  const url = new URL(request.url, 'https://media.vibeload.test:8443')
  if (url.pathname === '/health') { response.writeHead(200); response.end('ready'); return }
  const blocked = url.pathname === '/blocked.png'
  if (!blocked) {
    response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4173')
    response.setHeader('Access-Control-Expose-Headers', `Content-Length, Content-Type, Content-Disposition${url.pathname === '/compressed.png' ? '' : ', Content-Encoding'}`)
    response.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
  response.setHeader('Cache-Control', 'no-store')
  if (url.pathname !== '/compressed.png') response.setHeader('Content-Encoding', 'identity')
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', request.headers['access-control-request-headers'] || '*')
    response.writeHead(blocked ? 403 : 204); response.end(); return
  }
  let data = image
  let mime = 'image/png'
  if (url.pathname.endsWith('.wav')) { data = ['/unknown.wav', '/known.wav'].includes(url.pathname) ? slowAudio : audio; mime = 'audio/wav' }
  if (url.pathname === '/compressed.png') { data = gzipSync(image); response.setHeader('Content-Encoding', 'gzip') }
  if (url.pathname === '/clip.webm') {
    if (!existsSync(join(root, 'clip.webm'))) { response.writeHead(503); response.end(); return }
    data = readFileSync(join(root, 'clip.webm')); mime = 'video/webm'
  }
  if (url.pathname === '/changed.png') {
    const key = url.href
    counts.set(key, (counts.get(key) || 0) + 1)
    if (counts.get(key) > 1) { data = Buffer.from('<!doctype html><title>Expired link</title>'); mime = 'text/html' }
  }
  if (url.pathname === '/wrong.png') data = Buffer.from('<!doctype html><title>Not an image</title>')
  response.setHeader('Content-Type', mime)
  if (url.pathname === '/big.wav') {
    response.setHeader('Content-Length', 26 * 1024 * 1024)
    response.writeHead(200); response.write(audio)
    response.on('close', () => response.destroy())
    return
  }
  if (url.pathname === '/waiting.wav') {
    const timer = setTimeout(() => { response.writeHead(200); response.end(data) }, 15_000)
    response.on('close', () => clearTimeout(timer))
    return
  }
  if (['/unknown.wav', '/known.wav'].includes(url.pathname)) {
    if (url.pathname === '/known.wav') response.setHeader('Content-Length', data.length)
    response.writeHead(200)
    response.write(data.subarray(0, 8192))
    let offset = 8192
    const timer = setInterval(() => {
      const end = Math.min(offset + 8192, data.length)
      response.write(data.subarray(offset, end)); offset = end
      if (offset >= data.length) { clearInterval(timer); response.end() }
    }, 100)
    response.on('close', () => clearInterval(timer))
    return
  }
  response.setHeader('Content-Length', data.length)
  response.writeHead(200); response.end(data)
})
server.listen(8443, '127.0.0.1', () => process.stdout.write('Local HTTPS QA fixtures ready on 8443\n'))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.closeAllConnections()
  server.close(() => process.exit(0))
})
