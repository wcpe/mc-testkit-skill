# mc-testkit — Claude Code Plugin

一个 **Claude Code 插件**，教并帮 Claude 给 **Minecraft（Bukkit / Paper / Folia）插件项目**对接 [mc-testkit](https://github.com/wcpe/mc-testkit)（`top.wcpe.mc-testkit`）：用 `mcTestkit { }` DSL 声明真实「代理 + 后端」拓扑、照抄模板脚手架（Kotlin 桩 harness + mineflayer 机器人）、用**真实机器人入服**驱动场景跑 E2E（冒烟 / 经代理 / 跨服集群 / N 服 × M bot 压测）以**结果文件**判 PASS/FAIL；或用 **serve 持久手测**起服挂住供真人客户端连入手动测试。

> **对接项目**：[wcpe/mc-testkit](https://github.com/wcpe/mc-testkit)（Gradle 编排插件 + 脚手架模板，发布到 [maven.wcpe.top](https://maven.wcpe.top)）。本插件随它演进，撰写时对齐 **v0.4.0**。本仓库是**插件本体**（给 Claude 的指令 / 命令 / 护栏 / 工具），不是 mc-testkit 工具本身，也不是被测插件。

## 这个插件装了什么（4 类组件）

| 组件 | 路径 | 作用 |
|---|---|---|
| **技能 Skill** | `skills/mc-testkit/` | 中枢知识：心智模型、三条铁律、阶段路由、DSL/任务/env 契约、写场景配方、排障表。命中触发场景时 Claude 自动读。 |
| **斜杠命令 Commands** | `commands/` | `/mc-testkit-init`（从零接入跑通 smoke）、`/mc-testkit-serve`（配 serve 持久手测）、`/mc-testkit-scenario <id>`（三处一致登记场景）。把技能里反复教的流程变成一键。 |
| **护栏 Hook** | `hooks/` | `PostToolUse` 在你编辑时拦截 `includeBuild("../mc-testkit")`（本插件强制走 maven 网络插件），并在改桩/bot 时提醒别改冻结契约名。 |
| **MCP Server** | `mcp/` + `.mcp.json` | 只读工具 `mc_testkit_read_result` / `mc_testkit_list_tasks`（零依赖 Node）。本地 gradle Claude 也能经 Bash 跑，这个是「把 mc-testkit 操作做成一等工具」的可选演示。 |

> 技能负责「怎么想」、命令负责「一键做对」、hook 负责「别踩红线」、MCP 负责「直接读结果 / 列任务」——装一个插件全有。

## 心智模型：三层协作 + 两条命

```
① Gradle 编排插件 top.wcpe.mc-testkit（消费方 plugins{} 经 maven 应用）
     └─ mcTestkit { } DSL 声明拓扑/场景/serve/依赖 → 数据驱动注册 e2e* / serve* 任务
     └─ 下载并拉起 Paper/Folia 后端 + Velocity/Waterfall/BungeeCord 代理、按 pid 收尾
② 服务端桩 harness（Kotlin，照抄 template/harness）：入服驱动场景、写结果文件（PASS/FAIL 唯一裁判）
③ mineflayer 机器人 bot（Node，照抄 template/bot）：模拟真实玩家「像玩家一样操作」（不判定）
```
- **自动化 E2E**：bot 驱动 → 桩判定 → 跑完拆台（给 CI）。
- **serve 持久手测**（v0.4.0）：起拓扑挂住供真人连入手测，不判定、手动停时干净收尾。

## 三条铁律（违反必出隐性 bug）

1. **一个 kebab-case id 必须在「DSL / 桩 / bot」三处完全一致**（serve 例外：桩空闲、不需登记场景）。
2. **判 PASS/FAIL 永远是「桩」的职责，verify 只认结果文件**；模板的无条件 PASS 占位**必须**替换成真实判定。
3. **冻结契约名一律不改**：`MC_TESTKIT_E2E_` 前缀、控制消息（`E2E_READY` 等）、结果键（`status`/`message`）、serve 哨兵 `__mc_testkit_serve__`。

## 安装（经市场）

本仓库既是插件、也是一个单插件市场。用户：

```
/plugin marketplace add wcpe/mc-testkit-skill      # 加这个 GitHub 仓库为市场
/plugin install mc-testkit@wcpe                     # 安装插件
```

**团队自动分发**：在你**消费方仓库**的 `.claude/settings.json` 里声明，clone 仓库的人自动获得本插件、无需各自安装：

```jsonc
{
  "extraKnownMarketplaces": {
    "wcpe": { "source": { "source": "github", "repo": "wcpe/mc-testkit-skill" } }
  },
  "enabledPlugins": { "mc-testkit@wcpe": true }
}
```

> 字段名以你当前 Claude Code 的 `/plugin` 文档为准（插件机制在演进）；本仓库结构（`skills/` + `commands/` + `hooks/hooks.json` + `.mcp.json` + `.claude-plugin/`）按约定被自动发现。

## 使用

装好后直接自然语言描述，或用命令：

- 「给我的 Paper 1.20.1 商店插件接上 e2e，跑通最小 smoke。」 或 `/mc-testkit-init 1.20.1`
- 「起个真实服务端挂着让我自己连进去手点 GUI，再来个 bot 陪测。」 或 `/mc-testkit-serve dev`
- 「加个跨服一致性场景 inv-sync。」 或 `/mc-testkit-scenario inv-sync`
- 「e2e 跑不过 / bot 连不上 / serve 几秒自停，帮我排障。」（技能 `troubleshooting.md` 直接路由）

## 依赖与前置

- 消费方是 **Bukkit/Paper/Folia 插件 Gradle 项目**（Kotlin DSL）。
- **JDK** 匹配后端 MC 版本（Paper 1.20.1 → JDK 17）、**Node ≥ 18**（mineflayer + 本插件 hook/MCP）。
- 被测插件要的 **MySQL/Redis 等**由消费方先起好。
- **mc-testkit 工具本身**：**只经网络从 maven 消费**（`maven.wcpe.top/.../maven-public` + `id("top.wcpe.mc-testkit") version "x.y.z"`）；⛔ **禁用 `includeBuild("../mc-testkit")`**（hook 会拦）。`template/` 不在 maven 构件里——`/mc-testkit-init` 替你从 GitHub 按版本取。契约真源 GitHub `docs/API.md`。

## 评测

[`skills/mc-testkit/evals/evals.json`](skills/mc-testkit/evals/evals.json) 含 6 个用例（从零接入 / 跨服集群 / 压测不超卖 / 经 Velocity 代理 / Folia 后端 / serve 持久手测），校验产出符合 mc-testkit 真实契约（DSL/任务名不臆造、三处 id 一致、判定不靠无条件 PASS、不用 includeBuild）。可配合 `skill-creator` 评测工具运行。

## 许可

[MIT](LICENSE) © 2026 WCPE
