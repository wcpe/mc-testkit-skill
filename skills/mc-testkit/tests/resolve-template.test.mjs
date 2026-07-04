import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const skillRoot = fileURLToPath(new URL('..', import.meta.url))
const script = join(skillRoot, 'scripts', 'resolve-template.mjs')

test('copies embedded template without leaking absolute destination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mctk-template-'))
  const destination = join(root, 'e2e')
  const workDir = join(root, 'work')

  try {
    const result = spawnSync(
      process.execPath,
      [
        script,
        '--source',
        'embedded',
        '--destination',
        destination,
        '--work-dir',
        workDir,
      ],
      { encoding: 'utf8' },
    )

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /mc-testkit-template-v0\.4\.2\.zip/)
    assert.equal(result.stdout.includes(root), false)
    assert.equal(result.stderr.includes(root), false)
    assert.equal(existsSync(join(destination, 'harness', 'build.gradle.kts')), true)
    assert.equal(existsSync(join(destination, 'bot', 'src', 'connectAndWait.js')), true)
    assert.equal(existsSync(workDir), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
