# 排障

E2E 跑不过时按这套定位。先看结论真源，再按症状查表。表里多数坑是 mc-testkit 存在的理由——「每个项目重复踩」的已知雷，认得出就不用重踩。

## 先看哪：失败定位四步

1. **结果文件** `build/mc-testkit/results/<scenario>.properties`：`status` 是 `FAIL` 还是文件根本没生成？`message` 写了失败原因。这是判定真源。
2. **服务端日志**：单后端在 `build/mc-testkit/run/logs/`，集群下每个后端在 `build/mc-testkit/run-<后端名>/logs/`。桩有没有 `onEnable`？被测插件有没有报错？场景驱动到哪步？
3. **机器人日志**：在 `build/mc-testkit/results/` 下（bot 日志 / pid 与结果文件同目录）。连上了吗？被踢？等就绪信号超时？切服失败？
4. **代理日志** `build/mc-testkit/run-proxy/proxy.log`（经代理时）：有没有可用后端？协议版本对不对？

> 桩没写出结果文件 = 桩没判定（没就绪 / 等玩家超时 / 场景驱动卡住 / 桩崩了），看服务端日志。结果文件 `FAIL` = 桩判了失败，看 `message`。

## 症状 → 原因 → 处置

| 症状 | 多半是 | 处置 |
|---|---|---|
| 桩 `onEnable` 抛 `NoClassDefFoundError: kotlin/jvm/internal/Intrinsics` | 桩 jar 是瘦 jar、没内联 kotlin-stdlib | 用模板的 `jar` 任务（已把 `runtimeClasspath` 打成 fat jar）；别改成普通瘦 jar。paper-api 是 compileOnly 不会被打入 |
| 场景一直 `FAIL` 且 `message` 是「未知 E2E 场景: xxx」 | 三处 id 没对齐（DSL/桩/bot） | 核对 DSL `action`、桩 `ScenarioName.id`、bot `scenarioRunner` 的 `case`，必须同一 kebab id |
| bot 连上了但「等就绪信号超时」/ 桩日志没派发场景 | bot 落到 `default` no-op 分支，或桩 `dispatchScenario` 缺分支 | bot 侧 `connectAndWait.js` 加 `case`，桩 `dispatchScenario` 加分支 |
| 测试「永远 PASS」但其实没验证什么 | 留着模板的示例无条件 `passScenario`（延时后必 PASS） | 删掉占位，改成由被测插件事件 / 控制消息 / 查共享 DB 触发的真实判定（见 `authoring-scenarios.md`） |
| 机器人连不上 / 反复重试到超时 | 后端还没起好（真实后端含 MySQL/Redis 初始化常需数十秒）；或端口没通 | 默认连接重试窗口已是 300s（`BOT_CONNECT_TIMEOUT_MS`）；确认依赖服务已起、端口对；看后端日志是否卡在依赖初始化 |
| 集群/压测报「端口就绪门超时」（约 300s 后中文错） | 某后端 / 代理根本没起来（启动失败、端口没绑） | 这是 v0.3.0 的端口就绪门——它替你把「服务端没起来」与「场景逻辑卡住」分开了：去看那台后端 / 代理日志里的启动失败原因，不是 bot 或场景的问题 |
| Folia 后端：桩不 `onEnable`，日志有 `not marked as supporting Folia` | 桩 `plugin.yml` 缺 `folia-supported: true`，Folia 拒载 | 给桩 `plugin.yml` 补 `folia-supported: true`（模板已带，别删）；被测插件要跑 Folia 同理需自身支持 Folia |
| Folia 后端：桩判定时抛 `UnsupportedOperationException`（scheduler） | 桩里裸用了 `server.scheduler.runTask*`，Folia 不支持全局调度器 | 改用桩骨架的 `runSync { }` / `runLater(ticks) { }`（反射走 `GlobalRegionScheduler`，Paper 不变）；别改回裸 Bukkit 调度 |
| 配置期报错说压测不能用 Velocity | 写了 `stress` 又 `via = "velocity"` | Velocity 单端口不支持压测钉服；压测改用 Waterfall/BungeeCord（N-listener 钉服）或省略 `via` 直连后端端口 |
| 经代理时 bot 进不去 / 协议版本不符被踢 | 协议版本没对齐，或后端 BungeeCord 模式没生效 | 经代理一定用 `via`——编排会自动把 bot 协议版本固定为后端版本、并写好后端 BungeeCord 三件套。别自己设 `BOT_VERSION` |
| 代理下载 404 / 起不来（Waterfall） | 传了完整补丁号版本 | Waterfall 只认 major.minor：后端 `1.20.1` → `1.20`。编排默认已归一；自己覆盖 `WATERFALL_VERSION` 时也只给 major.minor |
| 集群场景 bot 不切服 / 起不了集群任务 | 集群没声明代理 | 集群**必须** `via`——bot 靠经代理 `/server <name>` 切。补上 `via` |
| 配置期报错说压测不能用 count / 多 bot | 压测场景里写了 `bot{count=N}` 或多个 `bot()` | 压测规模只走 `stress{botsPerServer}`；去掉 `count`/多 bot |
| 配置期中文报错「缺少注入插件 / jar 不存在」 | `dependencies{}` 的某项 env 没导出或路径不对 | 按报错列出的项补对应 env / 路径；桩 jar 记得先 `./gradlew -p <harness> jar` 构建 |
| 跑完端口被占 / 下一轮起不来 | 上一轮异常中断残留后台代理 / 后端 JVM / bot 进程 | 按运行目录 pid / 端口清掉残留再重跑；正常路径编排会 `finalizedBy` + try/finally 双保险收尾 |
| 后端迟迟不退出、空等到超时 | 真实后端依赖（连接池等非守护线程）使 JVM 在 `Bukkit.shutdown` 后不退 | 编排已改为「以结果文件为权威完成信号」，结果写出后给优雅自停窗口、仍不退则强杀。确认桩确实写了结果文件 |
| 跨服一致性「看着切过去了」但数据没跟过来 | 各后端没派生不同身份（同 `server-id` 互相覆盖归属） | 用 `MC_TESTKIT_E2E_BACKEND_NAME`（桩 `harnessConfig.backendName`）给每后端派生不同 `server-id` 等身份（FR-12） |
| 反复下载服务端 / 代理 jar，很慢 | 下载缓存被清 | 首次需联网，之后复用；无网 / CI 用 `*_JAR`（如 `PAPER_JAR`/`WATERFALL_JAR`）或 `*_VERSION` 提供本地 jar；`syncE2eRuntimeCache` 回写缓存 |
| 跑错任务、说没这个任务 | 任务名按 `<Key>` 折法生成，写错了 | `./gradlew :tasks` 看实际生成名；记住 `cross-server`→`e2eCrossServerCluster`、`continuous-stress`→`e2eContinuousStressStress` |
| 控制消息匹配不到（带颜色码 / 富文本） | 没归一文本就 `includes` | 用模板 `lib/messages.js` 的 `waitForMessage`（内部已 `normalizeText` 去 §颜色码、压空白），别手撸字符串比较 |

## 核对清单（跑之前过一遍能省很多来回）

- **三处 id 一致**、全 kebab-case。
- **冻结契约名没被改**：`MC_TESTKIT_E2E_` 前缀、`E2E_READY`/`E2E_STRESS_RESULT`/`E2E_DISCONNECT_NOW`/`E2E_UI_TOKEN`、结果键 `status`/`message`。
- **桩 jar 已构建**且作 `plugin(...)` 注入（真实消费者）；被测插件 jar 的 env 已导出。
- **MC 版本一致**：后端 version、桩 `paper-api` 与 `api-version`、`jvmToolchain`。
- **Folia 后端**：桩 `plugin.yml` 有 `folia-supported: true`；桩调度走 `runSync`/`runLater` 而非裸 `server.scheduler`。
- **依赖服务已起**：被测插件要的 DB/Redis 等。
- **经代理用 `via`**；**集群必经代理**；**压测不用 `count`**、**压测不经 Velocity**（用 Waterfall/BungeeCord 或直连）。
- **判定是真的**：示例无条件 PASS 已替换。
- **botDir 指对**：`-PmcTestkit.botDir=<你的 bot 目录>`。

## 实在定位不了

去读 mc-testkit 仓库的 `.github/workflows/e2e.yml`（一份能跑通的最小消费者实例）和 `docs/specs/fr-08-first-consumer.md`（记录了首个接入项目实机暴露并修掉的全部「集成缝」——你遇到的多半在里面）。契约疑问以 `docs/API.md` 为准。
