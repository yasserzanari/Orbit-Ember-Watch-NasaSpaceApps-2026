import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function getFreePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

const port = await getFreePort()
const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', CWFIS_EULA_CONFIRMED: 'false', FIRMS_MAP_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.setEncoding('utf8').on('data', (chunk) => { logs += chunk })
child.stderr.setEncoding('utf8').on('data', (chunk) => { logs += chunk })

async function waitForHealth() {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Server exited before becoming healthy.\n${logs}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) })
      if (response.ok) return response.json()
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error(`Server did not become healthy within eight seconds.\n${logs}`)
}

try {
  const health = await waitForHealth()
  assert.equal(health.service, 'orbit-ember-watch')
  assert.equal(health.publicNrtSupported, true)
  console.log('PASS health endpoint and public NRT configuration')

  const home = await fetch(`http://127.0.0.1:${port}/`)
  assert.equal(home.status, 200)
  assert.match(home.headers.get('content-type') ?? '', /text\/html/)
  assert.match(await home.text(), /<div id="root"><\/div>/)
  console.log('PASS built application is served')

  const catalogResponse = await fetch(`http://127.0.0.1:${port}/api/firms/archive-catalog`)
  assert.equal(catalogResponse.status, 200)
  const catalog = await catalogResponse.json()
  assert.ok(Array.isArray(catalog.archives))
  console.log(`PASS local archive catalog (${catalog.archives.length} imports)`)

  const secretResponse = await fetch(`http://127.0.0.1:${port}/api/firms?key=must-not-be-sent`)
  assert.equal(secretResponse.status, 400)
  assert.equal((await secretResponse.json()).code, 'secret_in_query')
  console.log('PASS browser query cannot pass a FIRMS key')

  const cwfisResponse = await fetch(`http://127.0.0.1:${port}/api/cwfis/hotspots?bbox=-116.2,52.9,-115.1,53.5&start=2023-05-04&end=2023-05-10`)
  assert.equal(cwfisResponse.status, 403)
  assert.equal((await cwfisResponse.json()).code, 'cwfis_terms_not_confirmed')
  console.log('PASS CWFIS endpoint is gated when agreement is not confirmed')
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve()
    child.once('exit', resolve)
    setTimeout(() => { child.kill('SIGKILL'); resolve() }, 2_000).unref()
  })
}
