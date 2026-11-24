# mc-testkit-skill

[wcpe/mc-testkit](https://github.com/wcpe/mc-testkit) 的**使用技能**（AI 编码助手插件）：帮助手把 mc-testkit 的 E2E / serve 编排接进 Minecraft 插件项目（Bukkit / Paper / Folia / Spigot 后端，Velocity / Waterfall / BungeeCord 代理），并按纪律写场景、跑任务、读结果、排障。

上游 mc-testkit 本身是 Gradle 编排插件 `top.wcpe.mc-testkit`：负责下载并起真实后端/代理、驱动 mineflayer 机器人、读结果文件判 PASS/FAIL。本仓是它的「怎么用」知识包——技能正文 + 冻结契约护栏 + 模板快照 + 只读 MCP。当前对齐 **mc-testkit v0.18.0**。

## 能力清单

- **接入向导**：maven 网络插件接线（`pluginManagement` 仓库 + `id("top.wcpe.mc-testkit")`）、模板来源确认（内置快照 vs GitHub 实时拉取，必须先问用户）、桩/bot 接线、自测模式（不声明 `pluginUnderTest` 时自动取本模块 `jar` 产物）
- **场景编写**：DSL/桩/bot 三处同 id 登记；冒烟 / bot 驱动 / 集群 `/server` 切服 / 压测钉服 / 单场景多 bot（具名异质 + `count` 同质）/ bot OP 提权 / console `E2E_CMD` 通道与 `execCommand` / 服务端断言登记表 / 生命周期钩子（before/ready/after）
- **DSL 速查**：六个顶层块（`backend`/`proxy`/`scenario`/`dependencies`/`serve`/`versionMatrix`）、`mavenPlugin`/`mavenServer` Maven 坐标制品源、`pluginUnderTest(from=)`/`plugin(from=)` 产物来源、`resultTimeoutSeconds`、`runDirectory` 持久运行目录、spigot 平台、MC 1.7.10–1.21.1 与 26.x 新版号
- **serve 持久手测**：起真实服务端挂住供真人连入；控制台 stdin 命令（v0.13+）与 Windows ConPTY 附加控制台；人机混场自驱 bot
- **排障**：假绿（无条件 PASS 占位）、三处 id 不一致、冻结契约名误改、`output-run.state` 接手被拒与 `stopE2eProcesses`、bot 输出预算超限、Maven 坐标解析失败、私有 npm 源 404/401
- **冻结契约护栏 hook**：PostToolUse 拦截 `includeBuild(".../mc-testkit")`、编辑桩/bot 涉及冻结契约名时提醒只许用不许改

## 安装

### Claude Code 插件

仓库根带 `.claude-plugin/plugin.json`；`skills/`、`commands/`、`hooks/` 沿用 CC 插件布局：

```bash
claude plugin add /path/to/mc-testkit-skill   # 或按 marketplace 插件装入
```

斜杠命令：`/mc-testkit-init`（从零接入跑通 smoke）、`/mc-testkit-scenario`（三处登记新场景）、`/mc-testkit-serve`（持久手测）。

### Codex 插件

`.codex-plugin/plugin.json`（`skills` → `./skills/`、`mcpServers` → `./.mcp.json`），按 Codex 插件目录装入。

### Devin 插件

`.devin-plugin/plugin.json` manifest + `skills/mc-testkit/SKILL.md` + 根 `.mcp.json`（mc-testkit MCP：读结果文件 / 列生成任务，Node 直跑）。在 Devin 侧用仓库 URL 安装即可；护栏 hook 用 Claude 格式（`hooks/hooks.json`）。

### 任何只认技能目录的 agent

把 `skills/mc-testkit/` 整个目录拷进 agent 的技能目录即可。

## 目录结构

```
.claude-plugin/plugin.json   # Claude Code manifest
.codex-plugin/plugin.json    # Codex manifest
.devin-plugin/plugin.json    # Devin manifest
.mcp.json                    # mc-testkit MCP server（node mcp/mc-testkit-mcp.mjs）
hooks/                       # 冻结契约护栏（PostToolUse，Claude 格式 hooks.json）
commands/                    # 3 个斜杠命令
mcp/                         # 只读 MCP server 实现
skills/mc-testkit/
  SKILL.md                   # 触发/路由/铁律/完成判据
  assets/                    # 内置模板快照（v0.18.0 zip）
  references/                # scaffolding-and-integration / authoring-scenarios / dsl-tasks-and-env / troubleshooting
  scripts/resolve-template.mjs  # 内置/GitHub 模板统一复制（0.4.1–0.18.0 版本↔提交映射）
  tests/                     # resolve-template 自测（node --test）
```

## 边界

- 本仓不实现 mc-testkit 本体——编排插件、模板、共享构件（`harness-core` / `@wcpe/mc-testkit-bot`）都在上游 [wcpe/mc-testkit](https://github.com/wcpe/mc-testkit)，权威接口契约见其 `docs/API.md`。
- 只走 maven 网络插件消费（`maven.wcpe.top`），**禁用 `includeBuild`** 接 mc-testkit 源码。
