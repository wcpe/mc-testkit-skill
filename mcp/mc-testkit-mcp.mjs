#!/usr/bin/env node
// 最小零依赖 MCP stdio server（JSON-RPC 2.0，换行分隔）：把 mc-testkit 的只读操作做成一等工具。
// 说明：本地 gradle 任务 Claude 也能直接经 Bash 跑；本 server 只是「最高级用法」里 MCP 组件的演示，
//       提供安全的只读工具（读结果文件 / 列生成任务），不跑会阻塞的 serve、不做破坏性操作。要不要装看需要。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const SERVER = { name: 'mc-testkit', version: '0.4.0' }

const TOOLS = [
  {
    name: 'mc_testkit_read_result',
    description:
      '读 mc-testkit 某场景的结果文件 build/mc-testkit/results/<scenario>.properties（status/message/场景键——PASS/FAIL 的唯一真源）。',
    inputSchema: {
      type: 'object',
      properties: {
        scenario: { type: 'string', description: '场景 kebab id，如 buy-success' },
        projectDir: { type: 'string', description: '消费方项目根目录（默认当前工作目录）' }
      },
      required: ['scenario']
    }
  },
  {
    name: 'mc_testkit_list_tasks',
    description:
      '列出 mc-testkit 数据驱动生成的 Gradle 任务（e2e*/serve*/stop* 等），经 ./gradlew :tasks。帮你挑对任务名。',
    inputSchema: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: '消费方项目根目录（默认当前工作目录）' }
      }
    }
  }
]

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }
function ok(id, res) { send({ jsonrpc: '2.0', id, result: res }) }
function err(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }) }
function text(t, isError = false) { return { content: [{ type: 'text', text: t }], isError } }

function readResult(args) {
  const dir = args.projectDir || process.cwd()
  const file = join(dir, 'build', 'mc-testkit', 'results', `${args.scenario}.properties`)
  try {
    return text(`结果文件 ${file}:\n\n${readFileSync(file, 'utf8')}`)
  } catch (e) {
    return text(`读不到结果文件 ${file}（场景没跑过 / 桩没写出 / scenario 名不对）：${e.message}`, true)
  }
}

function listTasks(args) {
  const dir = args.projectDir || process.cwd()
  const win = process.platform === 'win32'
  const gw = win ? 'gradlew.bat' : './gradlew'
  const r = spawnSync(gw, [':tasks', '--all', '--console=plain'], { cwd: dir, encoding: 'utf8', shell: win })
  if (r.error) return text(`跑 gradlew 失败：${r.error.message}`, true)
  const lines = (r.stdout || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(e2e|serve|stop|prepareE2e|npmInstallE2eBot|syncE2eRuntimeCache|purgeE2eRuntimeCache)/.test(l))
  return text(lines.length ? 'mc-testkit 生成的任务：\n' + lines.join('\n') : '没找到 mc-testkit 任务（确认已应用插件、声明了 scenario/serve）。')
}

function handle(msg) {
  const { id, method, params } = msg
  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: (params && params.protocolVersion) || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: SERVER
    })
  }
  if (method === 'notifications/initialized') return // 通知，无需回复
  if (method === 'tools/list') return ok(id, { tools: TOOLS })
  if (method === 'tools/call') {
    const name = params && params.name
    const args = (params && params.arguments) || {}
    try {
      if (name === 'mc_testkit_read_result') return ok(id, readResult(args))
      if (name === 'mc_testkit_list_tasks') return ok(id, listTasks(args))
      return err(id, -32601, `unknown tool: ${name}`)
    } catch (e) {
      return ok(id, text(`工具执行异常：${e.message}`, true))
    }
  }
  if (id !== undefined) err(id, -32601, `method not found: ${method}`)
}

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let idx
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim()
    buf = buf.slice(idx + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch (e) { continue }
    handle(msg)
  }
})
