#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { constants as zlibConstants, inflateRawSync } from 'node:zlib'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const EMBEDDED_ARCHIVE = 'mc-testkit-template-v0.18.0.zip'
const DEFAULT_VERSION = '0.18.0'
const DEFAULT_REPO = 'https://github.com/wcpe/mc-testkit'
const COMMIT_RE = /^[0-9a-fA-F]{40}$/
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+].*)?$/
const KNOWN_VERSION_REFS = new Map([
  ['0.4.1', 'ce8822f628e82f4a7500479e1d8bf818c350d1ba'],
  ['v0.4.1', 'ce8822f628e82f4a7500479e1d8bf818c350d1ba'],
  ['0.4.2', 'b2de34cb16b36c5beeb252f497f4cc7b84b7cb9c'],
  ['v0.4.2', 'b2de34cb16b36c5beeb252f497f4cc7b84b7cb9c'],
  ['0.5.0', '8b29faba92ca20749dd367d31f411dec2f465caa'],
  ['v0.5.0', '8b29faba92ca20749dd367d31f411dec2f465caa'],
  ['0.5.1', '8aa84f03f364d04509e4178be3738eff4a857f80'],
  ['v0.5.1', '8aa84f03f364d04509e4178be3738eff4a857f80'],
  ['0.6.0', '43fae4cb420a1201510cc00bf3033b9160974175'],
  ['v0.6.0', '43fae4cb420a1201510cc00bf3033b9160974175'],
  ['0.7.0', '0b9dd023a9fec9588481c084fd8ebdc973c8daf2'],
  ['v0.7.0', '0b9dd023a9fec9588481c084fd8ebdc973c8daf2'],
  ['0.8.0', 'b3d2230b0d23cbb6604a6866f638251e7ee11821'],
  ['v0.8.0', 'b3d2230b0d23cbb6604a6866f638251e7ee11821'],
  ['0.8.1', 'e0f9f5da17020c115f6d9609a0a797c9a9fb3c01'],
  ['v0.8.1', 'e0f9f5da17020c115f6d9609a0a797c9a9fb3c01'],
  ['0.9.0', 'f9c539b4d1d69998f800b50b5863f99760ba7f24'],
  ['v0.9.0', 'f9c539b4d1d69998f800b50b5863f99760ba7f24'],
  ['0.9.1', 'da7d7f5468d09e7a6ac6eda711c33bc9a5a3b274'],
  ['v0.9.1', 'da7d7f5468d09e7a6ac6eda711c33bc9a5a3b274'],
  ['0.9.2', 'f56ec40a7c803ee5988aea7fbc98948f5fb44b70'],
  ['v0.9.2', 'f56ec40a7c803ee5988aea7fbc98948f5fb44b70'],
  ['0.9.3', '4df4ccb2fce5aa75200795f21f217180aa947876'],
  ['v0.9.3', '4df4ccb2fce5aa75200795f21f217180aa947876'],
  ['0.10.0', 'c698598fa04f438832f230681a4cb4a34239519d'],
  ['v0.10.0', 'c698598fa04f438832f230681a4cb4a34239519d'],
  ['0.11.0', '8cea27e85102f214e31cc741dee41e958e8d921b'],
  ['v0.11.0', '8cea27e85102f214e31cc741dee41e958e8d921b'],
  ['0.12.0', 'e0e4bf91005baa70e46bc04a673745f7156b3e3d'],
  ['v0.12.0', 'e0e4bf91005baa70e46bc04a673745f7156b3e3d'],
  ['0.13.0', '1c1242071aa34694c28587906a824346ba770c85'],
  ['v0.13.0', '1c1242071aa34694c28587906a824346ba770c85'],
  ['0.14.0', '28ff6965eb6367b18c3d0fd09d80ca78311905f1'],
  ['v0.14.0', '28ff6965eb6367b18c3d0fd09d80ca78311905f1'],
  ['0.15.0', '80fb0728e617c8e411e02e39f9be7c0ed2113426'],
  ['v0.15.0', '80fb0728e617c8e411e02e39f9be7c0ed2113426'],
  ['0.15.1', '9df59fdf61e66226263374ee765e75c103c4d030'],
  ['v0.15.1', '9df59fdf61e66226263374ee765e75c103c4d030'],
  ['0.16.0', '942cd043892b15708c0b7cbb050a3830a3169f57'],
  ['v0.16.0', '942cd043892b15708c0b7cbb050a3830a3169f57'],
  ['0.17.0', 'f29205c6e45c7196f0b92c085b156d04998cf22e'],
  ['v0.17.0', 'f29205c6e45c7196f0b92c085b156d04998cf22e'],
  ['0.17.1', '2ef3620e06b935701bd2ebba90b97adb7c3e34f7'],
  ['v0.17.1', '2ef3620e06b935701bd2ebba90b97adb7c3e34f7'],
  ['0.17.2', '73aabf0b7e694c3e1cb754c1e6b5e2bf25097052'],
  ['v0.17.2', '73aabf0b7e694c3e1cb754c1e6b5e2bf25097052'],
  ['0.18.0', '55c2aacb37d5dbb2a9e2089450163fad2ca70760'],
  ['v0.18.0', '55c2aacb37d5dbb2a9e2089450163fad2ca70760'],
])

function parseArgs(argv) {
  const args = {
    version: DEFAULT_VERSION,
    repo: DEFAULT_REPO,
    force: false,
    workDir: '.tmp/mc-testkit-template-work',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--force') {
      args.force = true
      continue
    }

    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`参数缺少值：${key}`)
    }
    index += 1

    if (key === '--source') args.source = value
    else if (key === '--destination') args.destination = value
    else if (key === '--version') args.version = value
    else if (key === '--repo') args.repo = value
    else if (key === '--work-dir') args.workDir = value
    else throw new Error(`未知参数：${key}`)
  }

  if (!['embedded', 'github'].includes(args.source)) {
    throw new Error('必须通过 --source 指定 embedded 或 github')
  }
  if (!args.destination) {
    throw new Error('必须通过 --destination 指定目标目录')
  }
  return args
}

function displayPath(target) {
  const resolved = resolve(target)
  const rel = relative(process.cwd(), resolved)
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
    return rel.split(sep).join('/')
  }
  return resolved.split(sep).pop() || '.'
}

function ensureDestination(destination, force) {
  if (!existsSync(destination)) return
  if (!force) throw new Error(`目标目录已存在：${displayPath(destination)}。确认可覆盖后再加 --force。`)
  rmSync(destination, { recursive: true, force: true, maxRetries: 3 })
}

function normalizeRef(version) {
  const value = version.trim()
  const known = KNOWN_VERSION_REFS.get(value)
  if (known) return known
  return SEMVER_RE.test(value) ? `v${value}` : value
}

function prepareEmbeddedTemplate(skillRoot, workDir) {
  const archive = join(skillRoot, 'assets', EMBEDDED_ARCHIVE)
  if (!existsSync(archive)) throw new Error(`找不到内置模板快照：assets/${EMBEDDED_ARCHIVE}`)

  const extractDir = join(workDir, 'embedded')
  mkdirSync(extractDir, { recursive: true })
  extractZip(archive, extractDir)

  const source = join(extractDir, 'template')
  if (!existsSync(source)) throw new Error('内置模板快照缺少 template/ 根目录。')
  console.log(`使用内置模板快照：${EMBEDDED_ARCHIVE}`)
  return source
}

function prepareGithubTemplate(repo, ref, workDir) {
  const cloneDir = join(workDir, 'mc-testkit')
  if (COMMIT_RE.test(ref)) {
    run(['git', 'clone', '--filter=blob:none', '--sparse', repo, cloneDir])
    run(['git', '-C', cloneDir, 'checkout', ref])
  } else {
    run(['git', 'clone', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', ref, repo, cloneDir])
  }
  run(['git', '-C', cloneDir, 'sparse-checkout', 'set', 'template'])

  const source = join(cloneDir, 'template')
  if (!existsSync(source)) throw new Error(`GitHub 模板缺少 template/ 目录：${repo}@${ref}`)
  console.log(`使用 GitHub 模板：${repo}@${ref}`)
  return source
}

function run(command) {
  const result = spawnSync(command[0], command.slice(1), { encoding: 'utf8' })
  if (result.status === 0) return
  throw new Error((result.stderr + result.stdout).trim() || `命令执行失败：${command.join(' ')}`)
}

function extractZip(archive, targetDir) {
  const data = readFileSync(archive)
  const centralDirectory = readCentralDirectory(data)
  let offset = centralDirectory.offset

  for (let index = 0; index < centralDirectory.entries; index += 1) {
    if (data.readUInt32LE(offset) !== 0x02014b50) throw new Error('ZIP 中央目录格式错误。')

    const method = data.readUInt16LE(offset + 10)
    const compressedSize = data.readUInt32LE(offset + 20)
    const fileNameLength = data.readUInt16LE(offset + 28)
    const extraLength = data.readUInt16LE(offset + 30)
    const commentLength = data.readUInt16LE(offset + 32)
    const localHeaderOffset = data.readUInt32LE(offset + 42)
    const fileName = data.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8')

    extractZipEntry(data, targetDir, fileName, method, compressedSize, localHeaderOffset)
    offset += 46 + fileNameLength + extraLength + commentLength
  }
}

function readCentralDirectory(data) {
  const minOffset = Math.max(0, data.length - 65557)
  for (let offset = data.length - 22; offset >= minOffset; offset -= 1) {
    if (data.readUInt32LE(offset) === 0x06054b50) {
      return {
        entries: data.readUInt16LE(offset + 10),
        offset: data.readUInt32LE(offset + 16),
      }
    }
  }
  throw new Error('找不到 ZIP 中央目录。')
}

function extractZipEntry(data, targetDir, fileName, method, compressedSize, localHeaderOffset) {
  const destination = safeDestination(targetDir, fileName)
  if (fileName.endsWith('/')) {
    mkdirSync(destination, { recursive: true })
    return
  }

  if (data.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error('ZIP 本地文件头格式错误。')
  const localNameLength = data.readUInt16LE(localHeaderOffset + 26)
  const localExtraLength = data.readUInt16LE(localHeaderOffset + 28)
  const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
  const payload = data.subarray(dataStart, dataStart + compressedSize)

  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, inflatePayload(method, payload))
}

function inflatePayload(method, payload) {
  if (method === 0) return payload
  if (method === 8) {
    return inflateRawSync(payload, { finishFlush: zlibConstants.Z_SYNC_FLUSH })
  }
  throw new Error(`不支持的 ZIP 压缩方法：${method}`)
}

function safeDestination(root, fileName) {
  const destination = resolve(root, fileName)
  const rootWithSep = resolve(root) + sep
  if (!destination.startsWith(rootWithSep)) throw new Error(`ZIP 条目路径越界：${fileName}`)
  return destination
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const skillRoot = fileURLToPath(new URL('..', import.meta.url))
  const destination = resolve(args.destination)
  const workDir = resolve(args.workDir)

  ensureDestination(destination, args.force)
  rmSync(workDir, { recursive: true, force: true, maxRetries: 3 })
  mkdirSync(workDir, { recursive: true })

  try {
    const source = args.source === 'embedded'
      ? prepareEmbeddedTemplate(skillRoot, workDir)
      : prepareGithubTemplate(args.repo, normalizeRef(args.version), workDir)

    cpSync(source, destination, { recursive: true })
    console.log(`已复制 mc-testkit 模板到：${displayPath(destination)}`)
  } finally {
    rmSync(workDir, { recursive: true, force: true, maxRetries: 3 })
  }
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
