---
name: mc-testkit
description: >-
  Use when working on Minecraft 插件（Bukkit/Paper/Folia/Spigot 后端，Velocity/Waterfall/BungeeCord 代理）项目的端到端测试：接入或编写 mc-testkit（top.wcpe.mc-testkit）E2E / serve / 集群 / 压测工作流，写 GameTest 式真实起服场景、配 mineflayer bot、看 PASS/FAIL 结果文件、排障假绿或起服失败。「做 mc 测试 / 写 E2E / 跑 testkit / 起真实服务端验收 / serve 手测」类请求都应命中。
agent_created: true
---

# mc-testkit E2E 对接

mc-testkit 的形态是：Gradle 编排插件 `top.wcpe.mc-testkit` 负责起真实后端/代理并读结果文件；Kotlin harness 桩（协议胶水在共享构件 `top.wcpe.mc:harness-core`）负责驱动和判 PASS/FAIL；mineflayer bot（共享构件 `@wcpe/mc-testkit-bot`）只模拟玩家操作。

## 先确认模板来源

从零接入、初始化或重新同步 `template/` 前，必须先停下来问用户选择模板来源，禁止默认选择：

- **内置模板快照**：使用本技能 `assets/mc-testkit-template-v0.18.0.zip`，来源为 `wcpe/mc-testkit` 版本 `0.18.0`、提交 `55c2aacb37d5dbb2a9e2089450163fad2ca70760`。优点是离线、可复现；缺点是可能落后上游。
- **GitHub 实时拉取**：从 `https://github.com/wcpe/mc-testkit` 的指定 tag/branch/commit sparse-checkout `template/`。优点是能对齐用户指定版本；缺点是依赖网络和上游可用性。

用户未明确选择时，只提问，不执行复制。用户选择后，定位本技能目录（包含本 `SKILL.md`），再运行：

```bash
node scripts/resolve-template.mjs --source embedded --destination e2e
node scripts/resolve-template.mjs --source github --version 0.18.0 --destination e2e
```

目标目录已存在时必须再次确认；确认可覆盖后才加 `--force`。

## 三条铁律

1. 一个场景 id 必须在 DSL、harness、bot 三处完全一致，例如 `buy-success`。
2. PASS/FAIL 永远由 harness 写结果文件决定；bot 不判定，verify 不看日志猜结果。
3. 冻结契约名不改：`MC_TESTKIT_E2E_`、`E2E_READY`、`E2E_STRESS_RESULT`、`E2E_DISCONNECT_NOW`、`E2E_UI_TOKEN`、`E2E_CMD`、`status`、`message`、`__mc_testkit_serve__`。

## 路由

按用户意图只读需要的 reference：

| 用户意图 | 先读 | 关键产出 |
|---|---|---|
| 从零接入 | `references/scaffolding-and-integration.md` | maven 插件仓库、`mcTestkit {}`、模板来源确认、harness/bot 接线、自测模式、`e2eSmoke` |
| 写普通场景 | `references/authoring-scenarios.md` | 三处登记、真实业务判定、`e2e<Key>WithBot` |
| 集群或压测 | `references/authoring-scenarios.md` + `references/dsl-tasks-and-env.md` | `backends(...)`、`via`、`stress {}`、任务名 |
| serve 持久手测 | `references/authoring-scenarios.md` §serve + `references/dsl-tasks-and-env.md` | `serve<Key>`、`stop<Key>Serve`、空闲桩、自驱 bot、控制台 stdin 命令 |
| 节点运行时注入 | `references/dsl-tasks-and-env.md` §1 | backend/proxy 的 `env(...)` / `templateDirectory(...)`、proxy `plugin(...)`/`jvmArg`/`javaAgent`、`MC_TESTKIT_E2E_` 保留前缀限制 |
| 多版本后端 | `references/scaffolding-and-integration.md` §2/§0 + `references/dsl-tasks-and-env.md` §3 | `version = "1.7.10"…"1.21.1" / "26.2"`、`MC_TESTKIT_JAVA_HOME_<版本段>`、`versionMatrix`、版本感知配置 |
| Maven 坐标 / 产物来源 | `references/dsl-tasks-and-env.md` §1 | `mavenPlugin` / `mavenServer` / `pluginUnderTest(from=)` / `plugin(from=)`、仓库与镜像缓存规则 |
| 生命周期钩子 / 长场景 | `references/authoring-scenarios.md` | `hooks { before/ready/after }`、`resultTimeoutSeconds` |
| bot 命令通道 / 断言 | `references/authoring-scenarios.md` | `op` 提权、`E2E_CMD` console 通道、`execCommand`、断言登记表 |
| 跑任务/读结果 | `references/dsl-tasks-and-env.md` | 任务名、`stopE2eProcesses`、env、结果文件位置 |
| 排障 | `references/troubleshooting.md` | 按症状定位协议、代理、依赖、收尾、输出预算、假绿 |

## 插件能力（Claude Code / Codex / Devin）

- 技能：本 `mc-testkit` 技能负责触发、路由、约束和模板来源确认。
- 资产：内置 `0.18.0` 模板快照，供离线/可复现接入使用。
- 脚本：`scripts/resolve-template.mjs` 统一复制内置模板或 GitHub 模板（版本↔提交映射含 0.4.1–0.18.0 全部发布版）。
- MCP：`mc_testkit_read_result` 读结果文件；`mc_testkit_list_tasks` 列 Gradle 生成任务。
- 护栏 hook：PostToolUse 禁 `includeBuild(".../mc-testkit")`、提醒冻结契约名不改名。

## 完成判据

- `./gradlew :tasks` 能看到声明生成的 `e2e*` / `serve*` 任务，配置期无环、缺依赖报中文错。
- 三处 id 一致，冻结契约名未被改名，无条件 PASS 占位已替换为真实判定。
- 目标任务实机 PASS，结果来自 `build/mc-testkit/results/<scenario>.properties`。
- 自动化任务结束后端口释放、无残留进程；serve 可挂住，`stop<Key>Serve` 或 Ctrl+C 后干净收尾。
