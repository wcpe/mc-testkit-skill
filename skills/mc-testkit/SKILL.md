---
name: mc-testkit
description: >-
  为 Minecraft(Bukkit/Paper/Folia) 插件项目对接 mc-testkit(top.wcpe.mc-testkit) 做端到端 / 集成测试时使用:
  用 mcTestkit { } DSL 声明真实「代理 + 后端」拓扑、照抄 template 脚手架(Kotlin 桩插件 harness + mineflayer 机器人),
  用真实机器人入服驱动场景,跑 简单冒烟 / 经代理 / 跨服集群 / N 服 × M bot 压测,以结果文件判 PASS/FAIL;
  或用 serve 持久手测模式把同套拓扑起起来挂住、供真人客户端连入手动测试(单后端 / 集群 /server 切 / 可并起 bot 人机混场)。
  当用户说"给插件加 e2e / 集成测试、接 mc-testkit、用真实机器人测插件、跨服一致性测试、压力 / 压测、写 e2e 场景、
  持久开启 / 起个服挂着给真人玩 / serve 手测模式 / 人机混场、e2e 跑不过要排障、mcTestkit DSL、桩 / harness、bot 连不上、
  结果文件 PASS/FAIL、serve<Key> / stop<Key>Serve / e2e<Key>Cluster / e2e<Key>Stress 任务"
  等时触发——即使没点名 mc-testkit。涉及 MC 插件端到端测试编排、机器人驱动入服、集群 / 压测、起服挂起供人手测时务必主动用本技能,
  不要手搓一套一次性的 E2E 或临时起服脚本。本技能不替你写业务断言,但保证接线对、契约不踩坑、任务跑得起来。
---

# mc-testkit E2E 对接

mc-testkit 是把「全平台 MC 插件 E2E 编排」沉淀成一处可复用工具的方案。本技能教 Claude 给一个**消费方插件项目**从零接入它、编写简单 / 集群 / 压测场景、跑起来并排障。

## 它由三层协作（先建立这个心智模型）

```
① Gradle 编排插件  top.wcpe.mc-testkit （maven.wcpe.top，消费方 plugins{} 应用）
     └─ mcTestkit { } DSL 声明「代理+后端」拓扑/场景/依赖 → 自动注册 e2e* 任务
     └─ 内置下载并后台/前台拉起 Paper/Folia 后端 + Velocity/Waterfall/BungeeCord 代理
     └─ 起后端时下发 env、跑完读「结果文件」判 PASS/FAIL、按 pid 收尾杀进程
② 服务端桩插件 harness（Kotlin，照抄 template/harness 改）
     └─ 入服装备玩家、按场景驱动、与 bot 收发控制消息、**写结果文件（PASS/FAIL 的唯一裁判）**
③ mineflayer 机器人 bot（Node，照抄 template/bot 改）
     └─ 模拟真实玩家入服，按 action 分发到场景驱动，"像玩家一样操作"（不判定）
```

数据流：`mcTestkit{}` 声明 → 编排起后端(下发 `MC_TESTKIT_E2E_*` env) → 桩按场景驱动、必要时经聊天给 bot 发 `E2E_READY` → bot 操作 → 桩判定写 `<scenario>.properties` → 编排 verify 任务读该文件 → Gradle 成功/失败（CI 退出码）。

> **两条命，别混**：上面是**自动化 E2E**（bot 驱动 → 桩判定 → 跑完拆台，给 CI）。**v0.4.0 起还有第二条：serve 持久手测**——`serve { }` 把同一套拓扑起起来**挂住**供真人客户端连入手动测试，**不判定、不自动收尾**，手动停（Ctrl+C / `stop<Key>Serve`）时干净收尾。它复用同样的下载 / 起服 / 环境契约 / pid 收尾，只是把「跑完就拆」换成「挂住等人」（可选并起 bot 做人机混场）。下面三条铁律主要管自动化 E2E：serve **不判定**，桩在 serve 下是**空闲**的（铁律 2 不适用；细节见环境坑「serve 桩空闲哨兵」与 `references/authoring-scenarios.md` §serve）。

> **mc-testkit 怎么接、模板从哪来（只走网络）**：消费方**只经网络插件**接入——`pluginManagement` 加 maven 仓库 `https://maven.wcpe.top/repository/maven-public/` + `id("top.wcpe.mc-testkit") version "x.y.z"` 应用。⛔ **禁用 `includeBuild("../mc-testkit")`**——它依赖本机一份 mc-testkit 源码副本，CI / 队友 / 经插件分发的环境上不成立，还把版本钉死在易漂移的本地源码上；要未发布的改动就先把 mc-testkit 发版/发快照到 maven 再升 `version`。`template/`（桩 + bot 脚手架）**不在 maven 构件里**，从 mc-testkit 的 **GitHub `template/`** 取（sparse-checkout，见 `references/scaffolding-and-integration.md` §3）；经本插件接入时 `/mc-testkit-init` 替你从 GitHub 按版本取。契约真源是 GitHub 的 `docs/API.md`。**接入前读一眼 mc-testkit 当前 `CHANGELOG.md` 确认版本**（撰写时 v0.4.0），不要照搬本技能里的版本号。

## 三条铁律（先记住，违反必出隐性 bug）

这三条是 mc-testkit 契约的核心，也是消费方最常踩的坑。每写一个场景都按它们自检：

**1. 一个 kebab-case id，必须在「三处」完全一致。**
一个场景要在三处用**同一个** id 登记，否则桩匹配不上场景而判失败、或 bot 落到 no-op 默认分支静默什么都不做：
- DSL：`scenario("buy-success") { bot { action = "buy-success" } }`
- 桩：`ScenarioName.BUY_SUCCESS("buy-success")` + `dispatchScenario` 里的分支
- bot：`src/scenarios/buySuccess.js` + `connectAndWait.js` 的 `scenarioRunner()` 加 `case 'buy-success'`

id 用 kebab-case（`buy-success`），桩枚举名是 SCREAMING_SNAKE 但 `.id` 字段必须是那个 kebab id，bot 的 `case` 字符串、DSL 的 `action`/场景名都用它。详见 `references/authoring-scenarios.md`。

**2. 判 PASS/FAIL 永远是「桩」的职责，且 verify 只认结果文件。**
bot 只负责"像玩家一样操作"，**不做判定**；编排的 verify 任务**只读 `<scenario>.properties` 的 `status`**，不看日志、不信 bot。模板里 `prepareExampleBotScenario` / `exampleBot.js` 那种**无条件 PASS** 是演示占位——真实场景**必须替换**成由业务事件 / 控制消息 / 查共享 DB 触发的真实判定，并删掉占位，否则你得到的是"永远绿但什么都没验证"的假测试（违反 mc-testkit 的"正确性优先：不得让未真正完成的测试报成功"）。

**3. 冻结契约的名字，模板里一律不要改。**
环境变量前缀 `MC_TESTKIT_E2E_`、控制协议消息名（`E2E_READY` / `E2E_STRESS_RESULT` / `E2E_DISCONNECT_NOW` / `E2E_UI_TOKEN`）、结果文件键（`status` / `message`）——这些是编排↔桩↔bot 对接的冻结契约。改场景逻辑、加新场景、加场景特定结果键都自由；改这些名字 = 三方对不上。完整契约见 `references/dsl-tasks-and-env.md`。

## 我现在该做哪一步？（路由）

判断用户处在哪个阶段，读对应 reference，再动手：

| 用户意图 | 先读 | 关键产出 |
|---|---|---|
| **从零接入**（项目还没有 E2E / 没应用插件 / 没拷模板） | `references/scaffolding-and-integration.md` | settings 加仓库、`plugins{}` 应用、拷 `template/`→改包名、botDir、依赖注入、跑通 smoke |
| **加一个简单场景**（单后端，机器人驱动一段操作） | `references/authoring-scenarios.md` §简单场景 | 三处登记 + 桩驱动/判定 + bot 操作 |
| **加跨服集群场景**（多后端，bot 经代理 /server 切，判跨服一致性） | `references/authoring-scenarios.md` §集群 + `references/dsl-tasks-and-env.md` | `backends(...)` + `via` + per-backend 身份 + 到达确认 |
| **加压测场景**（N 服 × M bot 钉服持续施压，聚合判定） | `references/authoring-scenarios.md` §压测 | `stress { botsPerServer; durationSeconds }` + bot 循环 + 桩聚合 |
| **起服挂住供真人手测**（serve 持久模式，不判定、可并起 bot 人机混场，v0.4.0） | `references/authoring-scenarios.md` §serve 持久手测 + `references/dsl-tasks-and-env.md` §1/§2 | `serve { backend/backends; via; 可选 bot }` 声明 → `serve<Key>` 起服挂住 / `stop<Key>Serve` 收尾 + 桩 `ScenarioName.SERVE` 空闲分支（re-sync 模板） |
| **跑 / 选任务 / 读结果** | 下方「拓扑 → 任务」表 + `references/dsl-tasks-and-env.md` | 选对 `e2e<Key>*` 任务、看结果文件与日志 |
| **e2e 跑不过 / 排障** | `references/troubleshooting.md` | 按症状定位（协议版本 / 代理 / 收尾 / 依赖 / 三处不一致） |

接入与加场景都要落到「跑得起来」：能跑哪个任务、判定从哪来。

## 拓扑形态 → 跑哪个任务（声明决定任务，不是你挑任务）

任务名由声明**数据驱动生成**，`<Key>` = 场景名折成 PascalCase（`buy-success` → `BuySuccess`），`<Proxy>` = 代理名同折：

| 场景声明 | 它是什么 | 主要跑的任务 |
|---|---|---|
| `scenario("smoke")`（无 bot） | 冒烟：仅校验桩 / 被测插件就绪 | `e2eSmoke` |
| `scenario("buy"){ backend="s1"; bot{...} }` | 单后端直连，机器人驱动 | `e2eBuyWithBot`（起 bot + 验证）；`e2eBuy`（直连验证）；`launchBuyBot`（单起 bot） |
| 上面再加 `via = "wf"` | 经代理跑（协议版本被固定为后端版本） | 额外生成 `e2eBuyViaWf` + `stopProxyWf` |
| `scenario(...){ backends("s1","s2"); via="wf"; bot{...} }` | 集群：N 后端全后台 + bot 经代理 `/server` 切 | `e2e<Key>Cluster` + `stop<Key>Cluster` |
| `scenario(...){ backends(...); stress{ botsPerServer=N; durationSeconds=T }; bot{...} }` | 压测：N 服 × M bot 钉服持续施压 | `e2e<Key>Stress` + `stop<Key>Stress` |
| `serve("dev"){ backend="s1"; via? }`（**第 5 个顶层块**，v0.4.0） | 持久手测：起单后端(+可选经代理)挂住供真人连入，**不判定** | `serveDev`（起服挂住到手动停）+ `stopDevServe`（按 pid 收尾） |
| `serve("dev"){ backends("s1","s2"); via="wf" }` | 持久手测·集群：N 后端 + 代理整套挂住、真人经代理 `/server` 切 | `serveDev` + `stopDevServe` |
| 上面任一再加 `bot{...}` | 持久手测·人机混场：挂住期间并起 bot 把环境驱到某状态（不据结果文件收尾） | 同上（serve 起 bot，停时一并收尾） |
| 固定名（与场景无关） | 装 bot 依赖 / 缓存维护 | `npmInstallE2eBot`、`syncE2eRuntimeCache`、`purgeE2eRuntimeCache` |

要点：
- **`backends(...)` 触发集群**、**`stress{}` 触发压测**（二者都与单后端 `backend=` 互斥）；集群**必须经代理**（bot 靠 `/server` 切服）。
- 一个声明了 `via` 的场景**同时**生成直连 `e2e<Key>` 与经代理 `e2e<Key>Via<Proxy>` 两个任务。
- **代理选型看场景**（v0.3.0 起 Velocity 已实装 modern forwarding）：单后端经代理 / 集群 `/server` 切 / 崩溃接管，三种代理都行；但**压测钉服只能用 Waterfall/BungeeCord**（N-listener「一端口对一后端」），**Velocity 单端口不支持压测**，`stress + via=velocity` 配置期中文报错。
- 单场景声明多个 bot（`bot{count=N}` 同质 / 多个 `bot("角色")` 异质）**不新增任务名**，既有任务起多个 bot 进程；**压测场景禁用 `count` / 多 bot**（规模走 `botsPerServer`）。
- **`serve { }`（v0.4.0 第 5 个顶层块，与四块并列、加法非破坏）触发持久手测**：声明 `backend`（或集群 `backends(...)`+`via`）即生成 `serve<Key>` + `stop<Key>Serve`。serve **不判定、不自动收尾**——复用拓扑 / 桩 / 收尾，但把「跑完就拆」换成「**前台挂住**等真人连」（Ctrl+C 或 `stop<Key>Serve` 停）；可选 `bot{}` 做人机混场。serve 起后端时下发**保留哨兵场景** `__mc_testkit_serve__` 让桩空闲——**桩须 re-sync 新模板**才认它（老桩遇未知 id 会被禁用、服务端照常挂起，仅多一行报错日志）。
- 跑完结论看 `build/mc-testkit/results/<scenario>.properties`；失败原因在它的 `message` + 各后端 `run*/logs/` + `results/` 下的 bot 日志 + `run-proxy/proxy.log`（确切布局见 `references/troubleshooting.md`）。

## 最容易踩的环境坑（mc-testkit 存在的全部理由）

下面这些是"每个项目都重复踩、mc-testkit 已替你固化"的坑。写 / 调场景时主动核对，别再各自踩一遍。详见 `references/troubleshooting.md`：

- **经代理时机器人协议版本**：编排已自动固定为后端 MC 版本——所以经代理跑要用 `via`，别自己乱设 `BOT_VERSION`。直连可留空让 mineflayer 自协商。
- **Waterfall 版本只认 major.minor**：后端 `1.20.1` → Waterfall 解析为 `1.20`；传完整补丁号会 404。Velocity 反过来——用**自有版本号**（`MC_TESTKIT_E2E_VELOCITY_VERSION` 缺省 `3.3.0-SNAPSHOT`，不是后端 MC 版本），离线机器人放行/forced-hosts/forwarding secret 编排已自动写好，消费方只管声明 `platform = velocity`。
- **Folia 后端要桩自己「报备」**：桩 `plugin.yml` 必须有 `folia-supported: true`，否则 Folia 直接拒载（`not marked as supporting Folia`）、桩根本不 `onEnable`、永远等不到结果文件。且桩里**别直接 `server.scheduler.runTask*`**（Folia 会抛 `UnsupportedOperationException`）——用模板桩的 Folia 兼容调度助手 `runSync { }` / `runLater(ticks) { }`（反射探测 Folia 走 `GlobalRegionScheduler`，Paper 走原调度器）。模板已就位，照抄即可、别删。
- **集群崩溃接管 fallback**（FR-15）：集群代理 listener `priorities` 含全部后端（首个为默认服 + `force_default_server`，其余作 fallback），默认后端宕机时 bot 重连回退到存活后端——这是"崩溃接管"类 E2E 的支撑。模板已带薄示例 `crash-takeover`（bot 发 `E2E_TRIGGER_CRASH` 令默认后端 `halt`，存活桩判到达）。
- **集群/压测起 bot 前有端口就绪门**（v0.3.0）：编排会先轮询等全部后端 + 代理端口可 TCP 连接，再放 bot——慢 CI 不再间歇「等待玩家超时」。端口迟迟不开（启动失败）则到就绪门上限（300s）报清晰中文错，据此区分「服务端没起来」与「场景逻辑卡住」。
- **依赖服务要自己先就绪**：被测插件要的 MySQL/Redis 等由消费方提供并启动；`dependencies{ pluginUnderTest=...; plugin("X") }` 注入待测 / 依赖 jar，缺失时编排报中文错。
- **收尾**：后台代理 / 集群后端 / bot 都按 pid 收尾。上一轮异常中断可能残留进程占端口——重跑前先清掉。
- **per-backend 身份**（FR-12）：集群 / 压测下每个后端经 `MC_TESTKIT_E2E_BACKEND_NAME` 收到各自声明名，桩据此派生不同 `server-id`（跨服归属 / 转服交接所需）。
- **serve 桩空闲哨兵**（v0.4.0）：serve 起后端时下发保留场景 id `__mc_testkit_serve__`，模板桩据此进入**空闲**（不驱动 / 不判定 / 不关服）。**前提是桩 re-sync 了带 `ScenarioName.SERVE` 空闲分支的新模板**——没同步的老桩遇这个未知 id 会在 `onEnable` 抛错被禁用，服务端仍**照常挂起**（只少了「干净空闲」、多一行报错）。接 serve 前确认桩模板更到 v0.4.0；若服务端起来几秒就自己关了，多半是老桩把 serve 当默认 `smoke` 跑了 → 同步模板。
- **serve 的 bot 要「自驱」**（v0.4.0）：serve 桩空闲、**不发 `E2E_READY`**，所以 serve 里并起的 bot **别复用「等桩 ready 再动」的场景 action**（会干等到超时）——给它一个连上即自行动作的自驱 action（自走 / 自聊 / 随机操作）。serve 的 bot 只是陪真人把环境驱到某状态，不判定。
- **运行期产物别入库**：`node_modules/`、`run/`、`*.log`、结果文件目录加进 `.gitignore`。

## 参考文档地图

SKILL.md 是中枢，细节在 `references/`（按需读，别一次全读）：

- `references/scaffolding-and-integration.md` —— **从零接入**：settings 仓库、应用插件、拷 `template/` 改包名、harness/bot 构建接线、`mcTestkit.botDir`、依赖注入与 MySQL/Redis、跑通第一个 smoke。
- `references/dsl-tasks-and-env.md` —— **契约速查**：`mcTestkit { }` DSL 完整文法（backend/proxy/scenario/dependencies **+ serve** + cluster + stress + multi-bot）、生成任务名全集（含 `serve<Key>` / `stop<Key>Serve`）与 `<Key>` 折法、`MC_TESTKIT_E2E_*` 环境变量目录、控制协议、结果文件键。
- `references/authoring-scenarios.md` —— **写场景**：三处登记配方 + 桩侧（ScenarioName/dispatch/判定/控制消息/压测聚合）+ bot 侧（scenarioRunner/waitForMessage/跨服切换/压测循环），简单 → 集群 → 压测 → 多 bot → **serve 持久手测** 全覆盖。
- `references/troubleshooting.md` —— **排障**：按症状的失败定位表（连不上 / 进服被踢 / 一直 FAIL / 端口残留 / 协议版本 / 依赖缺失 / 三处不一致 / 假绿），以及核对清单。

## 接入完成的判据

给消费方接好后，确认这几条（前几条 Claude 可自查，实机 PASS 需用户在备齐依赖 / 服务端 / DB / Redis 的环境确认）：
- `./gradlew :tasks` 能看到生成的 `e2e*` 任务，配置期无环、缺依赖报中文错。
- 三处 id 一致；冻结契约名未被改名；占位无条件 PASS 已替换为真实判定。
- `e2eSmoke` 起真实后端能 PASS（桩就绪）。
- 目标场景（如 `e2e<Key>WithBot` / `e2e<Key>Cluster` / `e2e<Key>Stress`）实机 PASS，且结束后端口释放、无残留进程。
- （若用 serve 持久手测）桩模板已含 `ScenarioName.SERVE` 空闲分支；`serve<Key>` 能起服**挂住不自停**、真人 / 模拟客户端连得进，`stop<Key>Serve`（或 Ctrl+C）后端口释放、无残留进程。
