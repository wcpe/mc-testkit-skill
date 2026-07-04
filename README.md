# mc-testkit — Claude Code / Codex 插件

这个仓库把 [wcpe/mc-testkit](https://github.com/wcpe/mc-testkit) 的接入流程同时封装成 **Claude Code 插件**和 **Codex 插件**，帮助 Minecraft Bukkit/Paper/Folia 插件项目接入真实服务端 E2E、mineflayer 机器人场景、跨服集群、压测和 serve 持久手测。

> 本仓库是 AI 助手插件本体，不是 mc-testkit Gradle 插件源码，也不是被测插件。两种插件共享同一套 skill、reference、MCP 和模板来源约束，但加载入口不同。

## 插件入口

| 平台 | 入口 | 主要能力 |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json` | skill、斜杠命令、hook、MCP |
| Codex | `.codex-plugin/plugin.json` | skill、MCP、展示信息、内置模板资产 |

## Claude Code 能力

| 组件 | 路径 | 作用 |
|---|---|---|
| 技能 Skill | `skills/mc-testkit/` | 中枢知识：心智模型、三条铁律、阶段路由、DSL/任务/env 契约、写场景配方、排障表 |
| 斜杠命令 Commands | `commands/` | `/mc-testkit-init`、`/mc-testkit-serve`、`/mc-testkit-scenario <id>` |
| 护栏 Hook | `hooks/` | 拦截 `includeBuild("../mc-testkit")`，提醒冻结契约名不能改 |
| MCP Server | `.mcp.json` + `mcp/mc-testkit-mcp.mjs` | 只读工具：读结果文件、列 Gradle 生成任务 |

Claude Code 侧适合需要 slash command 和 hook 护栏的团队工作流；它仍然要求复制 `template/` 前先确认使用内置快照还是 GitHub 实时拉取。

## Codex 能力

| 能力 | 路径 | 作用 |
|---|---|---|
| 插件 manifest | `.codex-plugin/plugin.json` | 声明 Codex 插件元数据、技能、MCP、展示信息 |
| 技能 | `skills/mc-testkit/` | 触发 mc-testkit 接入、写场景、跑任务、排障流程 |
| 内置模板资产 | `skills/mc-testkit/assets/mc-testkit-template-v0.4.1.zip` | 离线、可复现复制 `template/` |
| 模板脚本 | `skills/mc-testkit/scripts/resolve-template.mjs` | 在内置模板和 GitHub 实时模板之间执行用户已确认的选择 |
| MCP server | `.mcp.json` + `mcp/mc-testkit-mcp.mjs` | 只读工具：读结果文件、列 Gradle 生成任务 |

Codex 侧适合通过自然语言触发 skill、通过 MCP 读取任务和结果文件。当前 Codex manifest 不声明 `commands/` 和 `hooks/`；这些目录是 Claude Code 插件能力，不是废弃目录。

## 模板来源必须确认

从零接入或重新同步 `template/` 前，技能必须先问用户选择：

- **内置模板快照**：来源为 `wcpe/mc-testkit` 版本 `0.4.1`、提交 `ce8822f628e82f4a7500479e1d8bf818c350d1ba`。离线、可复现，但可能落后上游。
- **GitHub 实时拉取**：从 `https://github.com/wcpe/mc-testkit` 指定 tag/branch/commit 取 `template/`。能对齐指定版本，但依赖网络和上游可用性。

用户未选择时不得复制模板；目标目录已存在时也必须再次确认覆盖。

## Claude Code 安装与使用

本插件可经 [wcpe/plugin-marketplaces](https://github.com/wcpe/plugin-marketplaces) 组织市场分发：

```text
/plugin marketplace add wcpe/plugin-marketplaces
/plugin install mc-testkit@wcpe
```

团队自动分发可在消费方仓库的 `.claude/settings.json` 声明，字段名以当前 Claude Code 插件文档为准。

常用入口：

- `/mc-testkit-init 1.20.1`：从零接入并跑通最小 smoke。
- `/mc-testkit-serve dev`：配置 serve 持久手测。
- `/mc-testkit-scenario inv-sync`：三处一致登记自动化 E2E 场景。
- 自然语言排障：例如“e2e 跑不过 / bot 连不上 / serve 几秒自停”。

## Codex 安装与使用

Codex 插件同样收录在 [wcpe/plugin-marketplaces](https://github.com/wcpe/plugin-marketplaces)。添加该市场后，在 Codex 插件界面安装 `mc-testkit-skill@wcpe`。

## 使用示例

- “用 mc-testkit 给这个 Paper 插件接入最小 E2E smoke。”
- “用 mc-testkit 添加跨服一致性场景 `inv-sync`。”
- “用 mc-testkit 配一个 serve 持久手测环境，让真人客户端能连进去。”
- “用 mc-testkit 排查 `build/mc-testkit/results/buy-success.properties` 失败原因。”

## MCP 工具

- `mc_testkit_read_result`：读取 `build/mc-testkit/results/<scenario>.properties`。
- `mc_testkit_list_tasks`：运行 `./gradlew :tasks --all --console=plain` 并筛出 mc-testkit 任务。

## 验证

```powershell
python <plugin-creator-skill>/scripts/validate_plugin.py .
$env:PYTHONUTF8='1'; python <skill-creator-skill>/scripts/quick_validate.py ./skills/mc-testkit
node <plugin-eval-plugin>/scripts/plugin-eval.js analyze . --format markdown
```

## Privacy

本插件只读取用户当前工作区和用户明确选择的 mc-testkit 模板来源；MCP 工具只读本地 Gradle 任务与结果文件。选择 GitHub 实时拉取模板时，会访问 `https://github.com/wcpe/mc-testkit`。插件本身不收集、存储或上传个人数据。

## Terms

本插件按 MIT 许可提供。使用者需要自行确认被测项目、Minecraft 服务端、mineflayer 依赖和 mc-testkit 上游许可与运行环境要求，并对在自己项目中生成或修改的测试代码负责。

## 许可

[MIT](LICENSE) © 2026 WCPE
