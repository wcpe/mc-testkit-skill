# 契约速查：DSL / 任务 / 环境变量 / 协议

mc-testkit 对外接口有四类，均**已冻结**（破坏性变更升 major）：① `mcTestkit { }` DSL；② 自动生成的任务；③ `MC_TESTKIT_E2E_` 环境变量；④ 机器人↔桩控制协议 + 结果文件。这是单一真源的镜像，权威以 mc-testkit `docs/API.md` 为准。

## 目录
- [1. `mcTestkit { }` DSL 文法](#1-mctestkit---dsl-文法)
- [2. 生成的任务与 `<Key>` 折法](#2-生成的任务与-key-折法)
- [3. 环境变量目录](#3-环境变量目录)
- [4. 控制协议](#4-控制协议)
- [5. 结果文件](#5-结果文件)

---

## 1. `mcTestkit { }` DSL 文法

六个顶层块：`backend` / `proxy` / `scenario` / `dependencies` / `serve`（v0.4.0）/ `versionMatrix`（v0.10.0，多版本矩阵）。集群 / 压测 / 多 bot 是在 `scenario` 块内**加法扩展**；**持久手测**则用新增的 `serve` 块（见下方 (f)）——它起拓扑挂住供真人手测、**不判定**，与 `scenario`（bot 驱动 + 判定）是两条不同的命。

```kotlin
mcTestkit {
    // —— 后端节点（Paper/Folia）——
    backend("s1") {
        platform = paper        // paper | folia | spigot（v0.7+ ADR-0013；不含 Bukkit/Sponge）
        version = "1.20.1"       // 默认 1.20.1；支持 1.7.10 / 1.8.8 / 1.12.2 / 1.16.5 / 1.17.1 / 1.19.4 / 1.20.1 / 1.21.1 及 26.2 等新版号（无 1. 前缀）
        port = 25565             // Int?，省略则按端口基数 + 序号推导
        javaVersion = 8          // v0.10.0 可省；声明则必须 MC_TESTKIT_JAVA_HOME_<该版本> 精确提供 JRE
        env("MYPLUGIN_NODE", "s1")                                  // 节点运行时注入：只进本后端子进程（禁止 MC_TESTKIT_E2E_ 前缀）
        templateDirectory("MC_TESTKIT_E2E_S1_TEMPLATE_DIR")         // 节点模板目录（env 名或路径，覆盖旧全局 SERVER_TEMPLATE_DIR）
        mavenServer("io.papermc.paper:paper:1.12.2")                // v0.11.0 可省；服务端 jar 按 Maven 坐标（优先级：*_JAR > 坐标 > 内置下载）
        runDirectory = "run/s1"  // v0.18.0 可省；持久运行目录（相对工程目录），不再每轮清空（FR-33）
    }

    // —— 代理节点与路由（Velocity/Waterfall/BungeeCord）——
    proxy("wf") {
        platform = waterfall     // velocity | waterfall | bungeecord
        port = 25577             // Int?，可省
        javaVersion = 17         // 可省；按 MC_TESTKIT_JAVA_HOME_17 选择运行时
        routesTo("s1")           // 转发到的后端名；集群可 routesTo("s1","s2")；目标存在性配置期校验
        plugin("MC_TESTKIT_E2E_PROXY_PLUGIN_JAR")                   // 代理专属插件（只进该代理；dependencies{} 仍只注后端）
        jvmArg("-Dexample.flag=true")                               // 追加 JVM 参数
        javaAgent("SERVERPROBE_AGENT_JAR")                          // -javaagent 注入（env 名或路径）
        mavenServer("my.group:waterfall:1.20")                      // v0.11.0 可省；代理 jar 按 Maven 坐标
        env("MYPLUGIN_PROXY_NODE", "wf")                            // 节点 env：只进本代理子进程
        templateDirectory("MC_TESTKIT_E2E_PROXY_TEMPLATE_DIR")      // 代理模板目录
    }

    // —— 场景：五种形态 ——

    // (a) 冒烟：无 bot，仅 prepare + 校验桩就绪
    scenario("smoke") { backend = "s1" }

    // (b) 单后端 + 机器人驱动
    scenario("buy-success") {
        backend = "s1"                 // 运行于哪个后端（省略=首个声明的后端）
        via = "wf"                     // 经哪个代理（省略=直连）；写了它会同时生成直连与经代理两个任务
        bot {
            username = "BuyBot"
            action = "buy-success"     // 场景 id：必须与桩 ScenarioName.id、bot 分发 case 完全一致（kebab-case）
            env("MYPLUGIN_SHOP_TITLE", "E2E Shop")  // 业务 env 原样透传给机器人（消费方自定名，不进框架契约）
        }
    }

    // (c) 集群：backends(...) 即集群（与单后端 backend= 互斥）；必经代理，bot 经 /server 切服
    scenario("cross-server") {
        backends("s1", "s2")           // 有序后端列表；首个为落地服 + fallback
        via = "wf"                     // 集群必须经代理
        bot { username = "Switcher"; action = "cross-server" }
    }

    // (d) 压测：stress{} 即压测；N 服 × botsPerServer 个 bot 钉服持续施压
    scenario("continuous-stress") {
        backends("s1", "s2")
        via = "wf"                     // 可选：经代理 N-listener 钉服；省略则 bot 直连后端端口
        stress { botsPerServer = 100; durationSeconds = 300 }  // 二者必填 > 0
        bot { username = "Stress"; action = "continuous-stress" }
        // 注意：压测场景禁用 bot 的 count / 多 bot（规模只走 botsPerServer）
    }

    // (e) 长场景（v0.18.0 FR-32）：按场景放宽等桩写结果的上限（秒，默认 600，须 >0）
    scenario("long-load") {
        backend = "s1"
        resultTimeoutSeconds = 1500       // 要给足「起服 + 场景全程 + 收尾」
        bot { username = "Load"; action = "long-load" }
    }

    // (e2) bot 原版 OP 提权（v0.17.0 FR-29）：默认关闭的显式开关，bot 以玩家身份获得 OP
    scenario("op-edit") {
        backend = "s1"
        bot { username = "Op"; action = "op-edit"; op = true }   // ops.json 合并进运行目录，运行期手工改会被下一轮 prepare 覆盖
    }

    // (e3) 单场景多 bot —— 异质具名（各自 username/action/env）
    scenario("gui-edit") {
        backend = "s1"
        bot("admin")  { username = "Admin";  action = "gui-admin" }   // OP 经 GUI 编辑 target
        bot("target") { username = "Target"; action = "gui-target" }  // 被编辑对象
    }
    // 单场景多 bot —— 同质批量：count 复制 N 份，各唯一 username、经 BOT_INDEX(1..N) 区分
    scenario("g16") {
        backends("s1", "s2"); via = "wf"
        bot { username = "P"; action = "cross-server"; count = 8 }     // P1..P8，各自经代理 /server 切
    }

    // (f) 持久手测 serve（v0.4.0，第 5 个顶层块）：起拓扑挂住供真人客户端连入手动测试，不判定、不自动收尾
    serve("dev") {
        backend = "s1"                 // 单后端（省略=首个声明的后端）；或集群 backends("s1","s2")（与 backend 互斥、须配 via）
        via = "wf"                     // 可选经代理（省略=直连）；集群 serve 必经代理（真人经代理 /server 切服）
        // 可选并起 bot 做人机混场（bot 须「自驱」、不等桩 ready；多 bot 规则同 scenario）：
        // bot { username = "Filler"; action = "idle-walk" }
    }

    // —— 注入到测试服 plugins/ 的 jar ——
    dependencies {
        pluginUnderTest = "MC_TESTKIT_E2E_PLUGIN_UNDER_TEST_JAR"  // 被测插件（env 名或路径）→ 注入后改名 plugin-under-test.jar
        // pluginUnderTest(from = tasks.named<ShadowJar>("shadowJar"))  // v0.15.0 产物来源形式：与本行互斥；框架自动建任务依赖
        plugin("HARNESS_JAR")                                     // 桩 jar（路径或 env 名）
        // plugin(from = tasks.named("e2eHarnessJar"))              // v0.16.0 产物来源形式：可与路径/坐标混用
        plugin("SomeDepLib")                                      // 被测插件依赖的其它插件
        mavenPlugin("com.example:foo-plugin:1.2.0")               // v0.11.0 按 Maven 坐标拉依赖插件（Gradle 原生解析，isTransitive=false）
    }

    // —— 多版本矩阵（v0.10.0，第 6 个顶层块）——
    // versionMatrix("v") { version("1.8.8"); version("1.20.1") } → 自动展开 backend("v<key>") +
    // scenario("full-<key>"|"smoke-<key>")，注册串行聚合任务 e2eMatrixV / e2eMatrixVSmokeOnly
}
```

**校验（配置期，中文报错）**：节点重名、后端/代理名相撞、路由目标不存在、端口冲突、场景引用缺失、`count < 1`、多 bot 须各有唯一角色名、压测禁 `count`/多 bot、`botsPerServer`/`durationSeconds` ≤ 0、**压测经 Velocity**（`stress + via=velocity`，Velocity 单端口不支持钉服——压测改用 Waterfall/BungeeCord 或直连）。**serve 同理校验**：引用的 backend/via 存在、serve 名唯一、集群 serve（`backends(...)`）须配 `via` 且路由覆盖全部后端、`backend` 与 `backends(...)` 互斥、serve 的可选 bot 同 scenario 多 bot 规则。**v0.5.0 节点注入校验**：节点 `env(...)` 名不得为空 / 含等号或空字符 / 以 `MC_TESTKIT_E2E_` 开头（大小写不敏感）；`plugin(...)` / `templateDirectory(...)` 指向的资源须存在（插件须是 `.jar`、模板须是目录），否则启动任务涉及任一节点前中文失败。

**v0.9.0+ 自测模式**：`mcTestkit {}` 未声明 `pluginUnderTest` 且本工程有 `jar` 任务时，框架自动取本模块 `jar` 产物为被测插件并把 `prepareE2e*`/`e2e*`/`serve*` 自动依赖到 `jar`——无需手写 env+dependsOn 样板；显式声明（含 `pluginUnderTest(from=…)`）即不再是自测模式。运行期 `MC_TESTKIT_E2E_PLUGIN_UNDER_TEST_JAR` 仍最高优先。

**v0.18.0 持久运行目录**：默认运行目录 `<buildDir>/mc-testkit/run-<后端名>` 每轮重铺（留 `libraries`/`cache`/`assets`/`versions`）；声明 `runDirectory` 后不每轮清空，世界与插件数据留到下一轮。校验：不能是工程目录或其上级、不能与 `<buildDir>/mc-testkit` 重叠、两个后端不能同目录或嵌套。运行目录注入用 `mcTestkit.backendRunDirectory("<后端名>")`（Provider<Directory>），别自己拼路径。

**v0.16.0 共享后端串行**：多场景共用同一后端时框架自动挂 `mustRunAfter` 链串行执行（无开关）。

**多版本拉起（FR-21）**：8 个代表版本（1.7.10 / 1.8.8 / 1.12.2 / 1.16.5 / 1.17.1 / 1.19.4 / 1.20.1 / 1.21.1）Paper 下载、拉起与版本感知配置适配；`version` 也可写 `26.2` 等新版号（major≥26 走现代启动参数）。按版本自动：过滤 `server.properties` 不支持键、生成 `paper.yml` / `paper-global.yml`、选择 Java 运行时（`MC_TESTKIT_JAVA_HOME_<版本段>` 覆盖 > `JAVA_HOME` 回退 > 当前 JVM；1.7.10 自动跳过 bot 并告警）。

**多 bot 唯一性**：同质 `bot{count=N}` 展开成 `username-1..N` 唯一名；展开后的 key/username 与其它 bot 不能撞（如 `bot("w"){count=2}` 派生 `w-1`/`w-2` 与显式 `bot("w-1")` 会撞），撞了配置期报错。

---

## 2. 生成的任务与 `<Key>` 折法

任务由声明**数据驱动**生成，名字即契约。`<Key>` = 场景名折 PascalCase（`buy-success` → `BuySuccess`），`<Proxy>` = 代理名同折。

| 任务 | 何时生成 | 用途 |
|---|---|---|
| `prepareE2e<Key>` | 每场景 | 准备运行目录：清目录留缓存、写 eula + 最小 server.properties、注入插件 jar |
| `e2e<Key>` | 每场景 | 直连后端跑，读结果文件判 PASS/FAIL |
| `e2e<Key>Via<Proxy>` | 场景声明了 `via` | 经对应代理跑（协议版本固定为后端版本）；`finalizedBy` 停代理 |
| `launch<Key>Bot` | 场景有 bot | 单独启动该场景机器人（声明多 bot 时起多个进程） |
| `e2e<Key>WithBot` | 场景有 bot | 一键「起机器人 + 验证」 |
| `e2e<Key>Cluster` | 场景声明了 `backends(...)` | 集群跑：N 后端全后台 + 代理单 listener + bot 经 `/server` 切 |
| `stop<Key>Cluster` | 同上 | 停该集群全部后端与代理（按 pid）；由 `e2e<Key>Cluster` `finalizedBy` 触发 |
| `e2e<Key>Stress` | 场景声明了 `stress{}` | 压测跑：N 服 × M bot 钉服施压 + 各服结果聚合判定 |
| `stop<Key>Stress` | 同上 | 停该压测全部后端 + 代理 + bot |
| `serve<Key>` | 声明了 `serve(...)` 块（v0.4.0） | 持久手测：起后端（集群 `backends` 则 N 后端、`via` 则加代理）挂住供真人连入，**不判定**；前台阻塞到手动停 |
| `stop<Key>Serve` | 同上 | 停该 serve 的全部后端 + 代理 + bot（按 pid）；供另一终端停 / Ctrl+C 没清干净时兜底 |
| `stopProxy<Proxy>` | 有代理 | 停某代理（按 pid）；亦可单独调 |
| `npmInstallE2eBot` | 固定名 | 安装机器人 mineflayer 依赖 |
| `stopE2eProcesses` | 固定名（v0.18.0） | 收掉之前构建留下的后端/代理/bot/钩子残留进程（按进程台账核对身份）；`./gradlew stopE2eProcesses e2e<Key>` 即先收尾再跑 |
| `e2eMatrix<Key>` / `e2eMatrix<Key>SmokeOnly` | 声明了 `versionMatrix(...)`（v0.10.0） | 多版本矩阵串行聚合跑 |
| `syncE2eRuntimeCache` | 固定名 | 运行库 / 下载缓存回写持久缓存 |
| `purgeE2eRuntimeCache` | 固定名 | 清空持久缓存 |

**折法实例**（记牢，跑错任务名是常见失误）：
- `scenario("smoke")` → `e2eSmoke`
- `scenario("buy-success"){ bot{} }` → `e2eBuySuccess` / `e2eBuySuccessWithBot` / `launchBuySuccessBot`
- 上面加 `via="wf"` → 额外 `e2eBuySuccessViaWf` + `stopProxyWf`
- `scenario("cross-server"){ backends(...) }` → `e2eCrossServerCluster` + `stopCrossServerCluster`
- `scenario("continuous-stress"){ stress{} }` → `e2eContinuousStressStress` + `stopContinuousStressStress`（`Stress` 后缀照加，看着叠字是对的）
- `serve("dev"){ backend="s1" }` → `serveDev` + `stopDevServe`（serve 名折 PascalCase；集群 serve `serve("dev"){ backends(...) }` 任务名不变，仍是 `serveDev`）

`<Key>` 缺省后端：场景没写 `backend=` 时取首个声明的后端。**单场景多 bot 不新增任务名**——既有任务起多个 bot 进程并随场景结束按 pid 全部收尾。

---

## 3. 环境变量目录

前缀**冻结** `MC_TESTKIT_E2E_`。用于覆盖默认、提供 jar / 模板路径、调规模与超时（须可移植，不写死本机绝对路径）。下表略去前缀。

**服务端 / 模板 / 注入**
| 名 | 含义 |
|---|---|
| `MINECRAFT_VERSION` | 覆盖后端 MC 版本 |
| `SERVER_TEMPLATE_DIR` | 服务端模板目录，prepare 铺进运行目录（排除世界/日志）——放依赖插件配置、被测插件 test 业务配置；v0.5.0 起被节点 `templateDirectory(...)` 声明时优先用节点模板 |
| `PLUGIN_UNDER_TEST_JAR` | 被测插件 jar（`dependencies.pluginUnderTest` 常指它） |
| `PAPER_JAR` / `FOLIA_JAR` / `SPIGOT_JAR` | 后端 jar 覆盖（离线 / CI 逃生口，跳过下载；优先级高于 `mavenServer` 坐标） |
| `JAVA_HOME_<版本段>` | **v0.6.0（FR-21）**：按 MC 版本段选 Java 运行时，覆盖 `JAVA_HOME` 回退。段 = 版本前两段、点转下划线：`MC_TESTKIT_JAVA_HOME_1_7` → 1.7.10、`MC_TESTKIT_JAVA_HOME_1_20` → 1.20.x。1.7.10 需 Java 8、1.20+ 需 Java 17+（默认 `JAVA_HOME` / 当前 JVM 不满足时报错提示补对应 env） |

**桩↔编排交接**（编排起后端时下发，桩优先读、覆盖 config.yml）
| 名 | 含义 |
|---|---|
| `SCENARIO` | 本次场景 id = DSL 场景名原样下发；桩据此选场景（故三处 id 必须一致） |
| `RESULT_FILE` | 结果文件**绝对路径** = verify 读取处；桩写到这里二者对齐 |
| `BACKEND_NAME` | 本后端声明名；起每个后端都下发，集群/压测下各服不同；消费方据此 per-backend 派生身份（如 `server-id` 后缀，FR-12） |

> **serve 持久手测的保留哨兵**（v0.4.0）：serve 起后端时经 `SCENARIO` 下发**保留场景 id** `__mc_testkit_serve__`（契约常量 `McTestkitContract.SERVE_SCENARIO_ID`），且**不下发 `RESULT_FILE`**（serve 不判定）。模板桩 `ScenarioName.SERVE` 认这个字面量即进入空闲（不驱动 / 不挂超时 / 不关服）——桩侧按字面量对齐（同其它冻结名，别改）。老桩不认它会在 `onEnable` 抛错被禁用，服务端照常挂起。

**代理**
`WATERFALL_JAR`/`WATERFALL_VERSION`、`VELOCITY_JAR`/`VELOCITY_VERSION`、`BUNGEECORD_JAR`/`BUNGEECORD_VERSION`、`PROXY_PORT`、`PROXY_BASE_PORT`、`BOT_LOG_LIMIT_BYTES`（单日志上限，默认 64MiB，v0.18.0）、`BOT_LOG_RUN_LIMIT_BYTES`（全构建 bot/钩子输出合计上限，默认 1GiB，超限判失败）。
> Waterfall 版本只认 **major.minor**（后端 `1.20.1` → `1.20`）；传完整补丁号会 404。Waterfall/BungeeCord 下载版本缺省取**后端版本**；**Velocity 用自有版本**（`VELOCITY_VERSION` 缺省 `3.5.1`，与后端 MC 版本无关）。
> **Velocity（v0.3.0 实装 modern forwarding）**：支持单后端经代理 / 集群 `/server` 切 / 崩溃接管 fallback；**不支持压测钉服**（单端口无法「一端口对一后端」），`stress + via=velocity` 配置期中文报错。`velocity.toml` + 后端 `paper-global proxies.velocity` + `forwarding.secret` + 放行离线机器人，编排全自动写，消费方只声明 `platform = velocity` + `routesTo(...)`。

**机器人**
`BOT_ACTION`（场景 action，内核据此分发）、`BOT_HOST`/`BOT_PORT`/`BOT_USERNAME`/`BOT_AUTH`/`BOT_VERSION`、`BOT_CONNECT_TIMEOUT_MS`(默认 300000)/`BOT_RETRY_DELAY_MS`(3000)/`BOT_READY_TIMEOUT_MS`(60000)。
> 经代理时 `BOT_VERSION` 由编排**自动固定为后端版本**（环境契约），别自己设。

**集群 / 压测**
| 名 | 含义 |
|---|---|
| `CLUSTER_BACKENDS` | 集群场景有序后端名（逗号分隔）；bot 据此经代理 `/server <name>` 逐个切到后续后端 |
| `STRESS_DURATION_SECONDS` | 施压秒数（编排→bot 与桩） |
| `BOT_INDEX` | 每 bot 进程序号；压测 + 同质 `count=N` 复制都用 |
| `STRESS_RANDOM_SEED` | 共享随机种子；bot 用 `seed xor botIndex` 播种 RNG，使各 bot 可复现且互异 |

> 规模（服数 / 每服 bot 数 / 多 bot 份数 / 角色）由 DSL（`backends(...)` / `stress{botsPerServer}` / `bot{count}` / 多个 `bot("角色")`）表达，**不走 env**。

**发布凭据**（mc-testkit 维护者用，非消费方）：`WCPE_MAVEN_USERNAME` / `WCPE_MAVEN_PASSWORD` 或同名 Gradle 属性，不入库。

---

## 4. 控制协议（机器人↔桩，聊天 / 插件消息通道，载荷走 `:` 后缀）

**冻结的框架核心协议（4 条，不要改名）：**
| 消息 | 方向 | 含义 |
|---|---|---|
| `E2E_READY:<scenario>` | 桩→bot | 桩已装备就绪，bot 可开始驱动 |
| `E2E_STRESS_RESULT:ok=<n>,err=<n>,…` | bot→桩 | 压测 bot 到时上报累计摘要，桩聚合 |
| `E2E_DISCONNECT_NOW:<…>` | 桩→bot | 触发 bot 在购买中主动断线（中断恢复场景） |
| `E2E_UI_TOKEN:<uuid>` | 桩→bot | 经插件消息 UI 通道驱动时下发会话 token |
| `E2E_CMD:<…>` | 桩→bot（v0.17.0，FR-30） | console 命令通道：桩指示 bot 以 console 身份执行服务端命令（与 bot `op` 玩家提权互补）；配套 bot 侧 `execCommand`/`execCommands` API（FR-31） |

**场景特定标记**（template/消费方约定，**不进**冻结协议，可自定 / 替换）：如跨服示例里 bot 切到目标服后发的到达确认 `E2E_CLUSTER_ARRIVED`；崩溃接管示例（FR-15）里 bot 令默认后端模拟宕机的 `E2E_TRIGGER_CRASH`（桩收到即 `Runtime.halt`）。真实跨服一致性 / 接管判定由消费方桩按业务替换。

---

## 5. 结果文件（测试结论唯一真源）

桩写出 `<scenario>.properties`，编排 verify 任务**只认此文件**判定（不靠日志猜）：
- `status`：`PASS` / `FAIL`（缺失或非 PASS → verify 抛中文错使构建失败）。
- `message`：结论说明（失败原因写这里）。
- 其余键：场景特定字段（如 `rewardCount` / `costLeft` / `txId` / `backendName` / `arrivedServer`），由消费方桩与场景自定。

桩怎么知道写哪：编排经 `SCENARIO` / `RESULT_FILE` 下发场景与结果文件绝对路径，桩优先读这两个 env 覆盖自身配置默认，把结果写到 `RESULT_FILE` = verify 读取处。模板桩经共享构件 `top.wcpe.mc:harness-core`（v0.17.0 起发布到 maven.wcpe.top，Java 8 字节码，Paper 1.7.10–1.21 通吃）实现结果写出与配置读取；harness 侧另有**断言登记表**区分「取证」与「断言」（v0.17.0）。
