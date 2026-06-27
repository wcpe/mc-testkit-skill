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

四个顶层块：`backend` / `proxy` / `scenario` / `dependencies`。集群 / 压测 / 多 bot 都是在 `scenario` 块内**加法扩展**，不新增顶层块。

```kotlin
mcTestkit {
    // —— 后端节点（Paper/Folia）——
    backend("s1") {
        platform = paper        // paper | folia（仅此二者，不含 Spigot/Bukkit/Sponge）
        version = "1.20.1"       // 默认 1.20.1
        port = 25565             // Int?，省略则按端口基数 + 序号推导
    }

    // —— 代理节点与路由（Velocity/Waterfall/BungeeCord）——
    proxy("wf") {
        platform = waterfall     // velocity | waterfall | bungeecord
        port = 25577             // Int?，可省
        routesTo("s1")           // 转发到的后端名；集群可 routesTo("s1","s2")；目标存在性配置期校验
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

    // (e) 单场景多 bot —— 异质具名（各自 username/action/env）
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

    // —— 注入到测试服 plugins/ 的 jar（值 = 环境变量名或路径，运行期解析）——
    dependencies {
        pluginUnderTest = "MC_TESTKIT_E2E_PLUGIN_UNDER_TEST_JAR"  // 被测插件 → 注入后改名 plugin-under-test.jar
        plugin("HARNESS_JAR")                                     // 桩 jar（真实消费者作 plugin 注入）
        plugin("SomeDepLib")                                      // 被测插件依赖的其它插件
    }
}
```

**校验（配置期，中文报错）**：节点重名、后端/代理名相撞、路由目标不存在、端口冲突、场景引用缺失、`count < 1`、多 bot 须各有唯一角色名、压测禁 `count`/多 bot、`botsPerServer`/`durationSeconds` ≤ 0、**压测经 Velocity**（`stress + via=velocity`，Velocity 单端口不支持钉服——压测改用 Waterfall/BungeeCord 或直连）。

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
| `stopProxy<Proxy>` | 有代理 | 停某代理（按 pid）；亦可单独调 |
| `npmInstallE2eBot` | 固定名 | 安装机器人 mineflayer 依赖 |
| `syncE2eRuntimeCache` | 固定名 | 运行库 / 下载缓存回写持久缓存 |
| `purgeE2eRuntimeCache` | 固定名 | 清空持久缓存 |

**折法实例**（记牢，跑错任务名是常见失误）：
- `scenario("smoke")` → `e2eSmoke`
- `scenario("buy-success"){ bot{} }` → `e2eBuySuccess` / `e2eBuySuccessWithBot` / `launchBuySuccessBot`
- 上面加 `via="wf"` → 额外 `e2eBuySuccessViaWf` + `stopProxyWf`
- `scenario("cross-server"){ backends(...) }` → `e2eCrossServerCluster` + `stopCrossServerCluster`
- `scenario("continuous-stress"){ stress{} }` → `e2eContinuousStressStress` + `stopContinuousStressStress`（`Stress` 后缀照加，看着叠字是对的）

`<Key>` 缺省后端：场景没写 `backend=` 时取首个声明的后端。**单场景多 bot 不新增任务名**——既有任务起多个 bot 进程并随场景结束按 pid 全部收尾。

---

## 3. 环境变量目录

前缀**冻结** `MC_TESTKIT_E2E_`。用于覆盖默认、提供 jar / 模板路径、调规模与超时（须可移植，不写死本机绝对路径）。下表略去前缀。

**服务端 / 模板 / 注入**
| 名 | 含义 |
|---|---|
| `MINECRAFT_VERSION` | 覆盖后端 MC 版本 |
| `SERVER_TEMPLATE_DIR` | 服务端模板目录，prepare 铺进运行目录（排除世界/日志）——放依赖插件配置、被测插件 test 业务配置 |
| `PLUGIN_UNDER_TEST_JAR` | 被测插件 jar（`dependencies.pluginUnderTest` 常指它） |
| `PAPER_JAR` / `FOLIA_JAR` | 后端 jar 覆盖（离线 / CI 逃生口，跳过下载） |

**桩↔编排交接**（编排起后端时下发，桩优先读、覆盖 config.yml）
| 名 | 含义 |
|---|---|
| `SCENARIO` | 本次场景 id = DSL 场景名原样下发；桩据此选场景（故三处 id 必须一致） |
| `RESULT_FILE` | 结果文件**绝对路径** = verify 读取处；桩写到这里二者对齐 |
| `BACKEND_NAME` | 本后端声明名；起每个后端都下发，集群/压测下各服不同；消费方据此 per-backend 派生身份（如 `server-id` 后缀，FR-12） |

**代理**
`WATERFALL_JAR`/`WATERFALL_VERSION`、`VELOCITY_JAR`/`VELOCITY_VERSION`、`BUNGEECORD_JAR`/`BUNGEECORD_VERSION`、`PROXY_PORT`、`PROXY_BASE_PORT`。
> Waterfall 版本只认 **major.minor**（后端 `1.20.1` → `1.20`）；传完整补丁号会 404。Waterfall/BungeeCord 下载版本缺省取**后端版本**；**Velocity 用自有版本**（`VELOCITY_VERSION` 缺省 `3.3.0-SNAPSHOT`，与后端 MC 版本无关）。
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

**场景特定标记**（template/消费方约定，**不进**冻结协议，可自定 / 替换）：如跨服示例里 bot 切到目标服后发的到达确认 `E2E_CLUSTER_ARRIVED`；崩溃接管示例（FR-15）里 bot 令默认后端模拟宕机的 `E2E_TRIGGER_CRASH`（桩收到即 `Runtime.halt`）。真实跨服一致性 / 接管判定由消费方桩按业务替换。

---

## 5. 结果文件（测试结论唯一真源）

桩写出 `<scenario>.properties`，编排 verify 任务**只认此文件**判定（不靠日志猜）：
- `status`：`PASS` / `FAIL`（缺失或非 PASS → verify 抛中文错使构建失败）。
- `message`：结论说明（失败原因写这里）。
- 其余键：场景特定字段（如 `rewardCount` / `costLeft` / `txId` / `backendName` / `arrivedServer`），由消费方桩与场景自定。

桩怎么知道写哪：编排经 `SCENARIO` / `RESULT_FILE` 下发场景与结果文件绝对路径，桩优先读这两个 env 覆盖自身配置默认，把结果写到 `RESULT_FILE` = verify 读取处。`template/harness` 的 `ScenarioResultWriter` + `HarnessConfig` 已按此实现。
