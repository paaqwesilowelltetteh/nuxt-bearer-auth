import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const [nuxtVersion, nodeVersion, packageArchive] = process.argv.slice(2)
const npmVersion = '10.0.0'
const csurfVersion = '1.6.6'

if (!/^\d+\.\d+\.\d+$/.test(nuxtVersion ?? '') || !nodeVersion || !packageArchive) {
  throw new Error('Usage: node scripts/test-nuxt-compatibility.mjs <exact-nuxt-version> <exact-node-version> <package.tgz>')
}

const fixture = await mkdtemp(join(tmpdir(), 'nuxt-bearer-auth-compat-'))
const archive = resolve(packageArchive)
let succeeded = false

function run(command, args) {
  console.log(`> ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { cwd: fixture, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const outcome = result.signal ? `signal ${result.signal}` : `exit code ${result.status}`
    throw new Error(`${command} ${args.join(' ')} failed with ${outcome}`)
  }
}

function verifyToolchain() {
  const nodeResult = spawnSync('node', ['--version'], { encoding: 'utf8' })
  if (nodeResult.error) throw nodeResult.error
  if (nodeResult.status !== 0) throw new Error(`node --version failed with exit code ${nodeResult.status}`)
  const actualNode = nodeResult.stdout.trim()
  console.log(`Node.js ${actualNode}`)
  if (actualNode !== `v${nodeVersion}`) throw new Error(`Expected Node.js ${nodeVersion}, received ${actualNode}`)

  const result = spawnSync('npm', ['--version'], { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`npm --version failed with exit code ${result.status}`)
  const actual = result.stdout.trim()
  console.log(`npm ${actual}`)
  if (actual !== npmVersion) throw new Error(`Expected npm ${npmVersion}, received ${actual}`)
}

async function installedVersion(name) {
  const manifest = JSON.parse(await readFile(join(fixture, 'node_modules', name, 'package.json'), 'utf8'))
  return manifest.version
}

try {
  verifyToolchain()
  await writeFile(join(fixture, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      nuxt: nuxtVersion,
      'nuxt-csurf': csurfVersion,
      'nuxt-bearer-auth': `file:${archive}`,
    },
  }, null, 2))
  await writeFile(join(fixture, 'nuxt.config.ts'), `export default defineNuxtConfig({ modules: ['nuxt-bearer-auth'] })\n`)

  console.log(`Fixture: ${fixture}`)
  console.log(`Requested versions: Nuxt ${nuxtVersion}, Node.js ${nodeVersion}, npm ${npmVersion}, nuxt-csurf ${csurfVersion}`)
  run('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund'])

  const actualNuxt = await installedVersion('nuxt')
  const actualCsurf = await installedVersion('nuxt-csurf')
  if (actualNuxt !== nuxtVersion) throw new Error(`Expected Nuxt ${nuxtVersion}, installed ${actualNuxt}`)
  if (actualCsurf !== csurfVersion) throw new Error(`Expected nuxt-csurf ${csurfVersion}, installed ${actualCsurf}`)
  console.log(`Installed versions verified: Nuxt ${actualNuxt}, nuxt-csurf ${actualCsurf}`)

  run(join(fixture, 'node_modules', '.bin', 'nuxi'), ['prepare'])
  run(join(fixture, 'node_modules', '.bin', 'nuxi'), ['build'])
  succeeded = true
} catch (error) {
  console.error(`Compatibility fixture failed; files retained at ${fixture}`)
  throw error
} finally {
  if (succeeded) await rm(fixture, { recursive: true, force: true })
}
