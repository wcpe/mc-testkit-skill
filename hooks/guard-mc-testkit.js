#!/usr/bin/env node
'use strict'
// mc-testkit plugin 护栏（PostToolUse: Edit|Write|MultiEdit）。纯 stdin 处理、无依赖（CJS/ESM 皆可）。
// 1) 硬规则：禁 includeBuild(".../mc-testkit")——本技能强制走 maven 网络插件（非零退出反馈给 Claude）。
// 2) 软提醒：编辑 e2e 桩/bot 且涉及冻结契约名时，提醒「只是用、别改名」。
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', function (c) { raw += c })
process.stdin.on('end', function () {
  let input
  try { input = JSON.parse(raw || '{}') } catch (e) { process.exit(0) }
  const ti = (input && input.tool_input) || {}
  const filePath = String(ti.file_path || '')
  // 本次写入/编辑后的文本：Write 用 content；Edit 用 new_string；MultiEdit 用 edits[].new_string
  let text = [ti.content, ti.new_string].filter(Boolean).join('\n')
  if (Array.isArray(ti.edits)) {
    text += '\n' + ti.edits.map(function (e) { return e && e.new_string }).filter(Boolean).join('\n')
  }
  if (!text) process.exit(0)

  // ① 硬规则：禁 includeBuild 接 mc-testkit
  if (/includeBuild\s*\(\s*["'][^"']*mc-testkit[^"']*["']\s*\)/.test(text)) {
    console.error(
      '[mc-testkit 护栏] 检测到 includeBuild(".../mc-testkit")。本技能禁用 includeBuild——' +
      '请改为 maven 网络插件：settings 的 pluginManagement 加 ' +
      'maven("https://maven.wcpe.top/repository/maven-public/")，build.gradle.kts 用 ' +
      'id("top.wcpe.mc-testkit") version "x.y.z"。需要未发布改动就先发版/发快照到 maven 再升 version。'
    )
    process.exit(2) // PostToolUse 非零 → 把这条反馈给 Claude，促其改正
  }

  // ② 软提醒：编辑桩/bot 且涉及冻结契约名（只用不改名）
  const inHarnessOrBot = /[\\/]e2e[\\/](harness|bot)[\\/]/.test(filePath) ||
    /(McTestkitE2eHarness|ScenarioName|connectAndWait)/.test(filePath)
  if (inHarnessOrBot && /(MC_TESTKIT_E2E_|E2E_READY|E2E_STRESS_RESULT|__mc_testkit_serve__)/.test(text)) {
    console.error(
      '[mc-testkit 护栏] 你在改桩/bot 且涉及冻结契约名（MC_TESTKIT_E2E_ / E2E_READY / __mc_testkit_serve__ 等）。' +
      '这些是编排↔桩↔bot 的冻结契约：用它们没问题，改名三方就对不上——确认你没在改名。'
    )
    // 软提醒不阻断
  }
  process.exit(0)
})
