# mc-testkit-e2e — Claude Code Agent Skill

一个 **Claude Code 技能（Agent Skill）**，教 Claude 给 **Minecraft（Bukkit / Paper / Folia）插件项目**对接 [mc-testkit](https://maven.wcpe.top)（`top.wcpe.mc-testkit`）做端到端 / 集成测试：用 `mcTestkit { }` DSL 声明真实「代理 + 后端」拓扑，照抄模板脚手架（Kotlin 桩插件 harness + mineflayer 机器人），用**真实机器人入服**驱动场景，跑简单冒烟 / 经代理 / 跨服集群 / N 服 × M bot 压测，以**结果文件**判 PASS/FAIL。

> 本仓库是**技能本体**（给 Claude 读的指令与参考文档），不是 mc-testkit 工具本身，也不是某个被测插件。技能不替你写业务断言，但保证接线对、契约不踩坑、任务跑得起来。

## 这个技能解决什么

每个 MC 插件项目想做真机 E2E 时都会重复踩同一批坑：机器人协议版本要跟后端对齐、代理版本号解析、集群必须经代理、运行期进程按 pid 收尾、依赖服务（MySQL/Redis）先就绪……mc-testkit 把这些固化进一个 Gradle 编排插件，本技能则教 Claude **正确消费**它——而不是每个项目手搓一套一次性的、容易「永远绿但什么都没验证」的假测试。

## 心智模型：三层协作

```
① Gradle 编排插件  top.wcpe.mc-testkit （消费方 plugins{} 应用）
     └─ mcTestkit { } DSL 声明拓扑/场景/依赖 → 自动注册 e2e* 任务
     └─ 下载并拉起 Paper/Folia 后端 + Velocity/Waterfall/BungeeCord 代理
     └─ 下发 env、跑完读「结果文件」判 PASS/FAIL、按 pid 收尾
② 服务端桩插件 harness（Kotlin，照抄 template/harness 改）
     └─ 入服装备玩家、按场景驱动、与 bot 收发控制消息、写结果文件（唯一裁判）
③ mineflayer 机器人 bot（Node，照抄 template/bot 改）
     └─ 模拟真实玩家入服、按 action 驱动场景，「像玩家一样操作」（不判定）
```

## 三条铁律（违反必出隐性 bug）

1. **一个 kebab-case id，必须在「DSL / 桩 / bot」三处完全一致**，否则桩匹配不上场景、或 bot 落到默认分支静默 no-op。
2. **判 PASS/FAIL 永远是「桩」的职责，verify 只认结果文件**；模板里的无条件 PASS 占位**必须**替换成真实判定，否则得到假测试。
3. **冻结契约的名字一律不改**：env 前缀 `MC_TESTKIT_E2E_`、控制消息（`E2E_READY` 等）、结果文件键（`status` / `message`）——改了三方就对不上。

## 仓库结构

| 路径 | 作用 |
|---|---|
| [`SKILL.md`](SKILL.md) | 技能中枢：心智模型、三条铁律、阶段路由、拓扑→任务表、环境坑速查、完成判据。Claude 触发技能时首先读它。 |
| [`references/scaffolding-and-integration.md`](references/scaffolding-and-integration.md) | **从零接入**：声明仓库、应用插件、拷 `template/` 改包名、harness/bot 构建接线、依赖注入、跑通第一个 smoke。 |
| [`references/dsl-tasks-and-env.md`](references/dsl-tasks-and-env.md) | **契约速查**：`mcTestkit { }` DSL 完整文法、生成任务名全集与 `<Key>` 折法、`MC_TESTKIT_E2E_*` 环境变量目录、控制协议、结果文件键。 |
| [`references/authoring-scenarios.md`](references/authoring-scenarios.md) | **写场景**：三处登记配方 + 桩侧 + bot 侧，简单 → 集群 → 压测 → 多 bot 全覆盖。 |
| [`references/troubleshooting.md`](references/troubleshooting.md) | **排障**：按症状的失败定位表与核对清单。 |
| [`evals/evals.json`](evals/evals.json) | 触发与质量评测用例（从零接入 / 跨服集群 / 压测不超卖三例）。 |

参考文档按需读，不必一次全读——SKILL.md 会按用户所处阶段路由到对应文件。

## 安装

这是标准的 Claude Code Agent Skill，把整个目录放到技能搜索路径下即可（结构：`<skill>/SKILL.md` + `references/`）：

```
~/.claude/skills/mc-testkit-e2e/        # 用户级，对所有项目可见
# 或
<你的项目>/.claude/skills/mc-testkit-e2e/   # 项目级，随仓库分发
```

放好后无需手动加载——当用户的请求命中 `SKILL.md` 头部 `description` 里的触发场景（给插件加 e2e、接 mc-testkit、用真实机器人测插件、跨服一致性、压测、e2e 跑不过排障等），Claude 会自动调用本技能。

## 使用

在装有本技能的会话里，直接用自然语言描述需求即可，例如：

- 「给我的 Paper 1.20.1 商店插件接上 e2e，先跑通一个最小 smoke。」
- 「背包同步插件要做跨服一致性测试：玩家在 s1 改背包，切到 s2 不能回档。」
- 「给商店插件加压测：2 个后端、每服 100 bot、持续 5 分钟，验证不超卖。」
- 「e2e 跑不过 / bot 连不上 / 结果一直 FAIL，帮我排障。」

Claude 会判断你处在哪个阶段、读对应参考文档，再产出可跑起来的接线与场景代码。

## 依赖与前置

- 消费方是一个 **Bukkit/Paper/Folia 插件 Gradle 项目**（Kotlin DSL）。
- **JDK** 匹配后端 MC 版本（如 Paper 1.20.1 → JDK 17）、**Node ≥ 18**（跑 mineflayer）。
- 被测插件所需的 **MySQL/Redis 等依赖服务**由消费方在跑测前自行起好。
- **mc-testkit 工具本身**：本技能场景下通常是同机 sibling 项目 `D:\Projects\mc-testkit`（模板在其 `template/`、契约真源在 `docs/API.md`），或从 `https://maven.wcpe.top/repository/maven-public/` 消费。接入前请读一眼 mc-testkit 当前 `README.md` / `CHANGELOG.md` 确认版本与能力（本技能撰写时为 v0.2.2），不要照搬文档里的版本号。

## 评测

[`evals/evals.json`](evals/evals.json) 含 3 个用例，覆盖技能的核心契约：从零接入的最小 smoke、跨服集群一致性、压测不超卖。每例都校验产出是否符合 mc-testkit 真实契约（DSL 字段 / 任务名不臆造、三处 id 一致、判定不靠无条件 PASS）。可配合 `skill-creator` 技能的评测工具运行。

## 许可

首版尚未指定许可。
