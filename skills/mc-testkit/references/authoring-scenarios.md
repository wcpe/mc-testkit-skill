# 写 E2E 场景

怎么在桩（harness，Kotlin）与机器人（bot，JS）里写一个场景。先掌握「三处登记」这个不变量，再按 简单 → 集群 → 压测 → 多 bot 套对应配方。所有 id 用 **kebab-case**，三处一字不差。

## 目录
- [三处登记配方](#三处登记配方)
- [桩侧通用件](#桩侧通用件你会反复用到的)
- [简单场景（单后端 + 机器人驱动）](#简单场景单后端--机器人驱动)
- [集群场景（跨服切换 + 一致性）](#集群场景跨服切换--一致性)
- [压测场景（N 服 × M bot 钉服）](#压测场景n-服--m-bot-钉服)
- [单场景多 bot](#单场景多-bot)
- [自检](#写完一个场景的自检)

---

## 三处登记配方

加一个场景（示例 id `buy-success`）固定改三处，用同一个 id：

**① DSL（消费方 `build.gradle.kts`）**
```kotlin
scenario("buy-success") {
    backend = "s1"
    bot { username = "BuyBot"; action = "buy-success" }
}
```

**② 桩（`harness/.../ScenarioName.kt` + 主体 `dispatchScenario`）**
```kotlin
// ScenarioName.kt：枚举名随意，但 .id 必须是那个 kebab id
BUY_SUCCESS("buy-success"),

// McTestkitE2eHarnessPlugin.dispatchScenario：加一个分支
ScenarioName.BUY_SUCCESS -> prepareBuySuccess(player)
```

**③ 机器人（`bot/src/scenarios/buySuccess.js` + `connectAndWait.js` 分发表）**
```js
// connectAndWait.js 顶部 require + scenarioRunner() 里加 case
const runBuySuccess = require('./scenarios/buySuccess')
// ...
case 'buy-success':
  return runBuySuccess
```

漏任一处的后果：桩 `ScenarioName.from(id)` 抛「未知场景」直接判失败；或 bot 落到 `default` no-op 分支「保持在线啥也不干」直到超时 FAIL。**这是最高频的接线 bug，写完先核三处。**

---

## 桩侧通用件（你会反复用到的）

桩骨架（`McTestkitE2eHarnessPlugin`）已备好这些，写场景直接调：

- `prepareTestPlayer(player)`：清背包 + 挂示例授权位（按被测插件真实权限节点替换 `EXAMPLE_PERMISSION`）。
- `sendReadySignal(player)`：发 `E2E_READY:<scenario>`（幂等），通知 bot 可开始驱动。
- `armScenarioTimeout()`：挂场景整体超时，到时未判定则 FAIL。
- `passScenario(message, details)` / `failScenario(message)`：写结果文件 + 延迟关服（都幂等，靠 `completed` CAS 门防重复）。`details` 是 `Map<String,String>`，写场景特定结果键。
- 异步事件里判定要切回主线程，用桩骨架的 **Folia 兼容调度助手** `runSync { passScenario(...) }`（立即）/ `runLater(ticks) { ... }`（延迟）——**不要**直接 `server.scheduler.runTask*`。聊天事件 `AsyncPlayerChatEvent` 是异步的，且 Folia 后端上裸用 Bukkit 全局调度器会抛 `UnsupportedOperationException`；`runSync`/`runLater` 反射探测 Folia 走 `GlobalRegionScheduler`、Paper 走原调度器，一份桩两边都跑。

**判定信号从哪来**（替换掉示例的无条件 PASS）：
1. **被测插件的 Bukkit 事件**：桩 `implements Listener`，监听被测插件触发的事件（购买成功事件、库存变更等），在回调里 `passScenario`。
2. **bot 经控制消息回报**：bot 完成关键步后发一条约定聊天，桩收到即判（参照跨服的到达确认）。
3. **查共享 DB / 缓存**：桩直接查被测插件写入的库 / 缓存断言业务不变量（压测「不超卖」等典型用这种）。

```kotlin
/** 真实购买场景：装备玩家 → 发就绪 → 监听被测插件的购买结果事件判定。 */
private fun prepareBuySuccess(player: Player) {
    prepareTestPlayer(player)
    sendReadySignal(player)        // bot 收到后去开 GUI、点购买
    armScenarioTimeout()
    // 判定不在这里"无条件延时 PASS"，而是由下面的事件监听 / DB 查询触发。
}

// 监听被测插件的业务事件（示例；换成你插件真实的事件类型）
@EventHandler
fun onPurchaseComplete(event: YourPluginPurchaseEvent) {
    if (completed.get()) return
    if (event.isSuccess) {
        passScenario(
            message = "购买成功，扣费与发奖一致",
            details = mapOf("txId" to event.txId, "rewardCount" to "1", "costLeft" to "0"),
        )
    } else {
        failScenario("购买失败：${event.reason}")
    }
}
```

> 删掉模板里 `prepareExampleBotScenario` 那段「延时后无条件 `passScenario`」——它只是演示「PASS 写在哪」，留着就是假绿。

---

## 简单场景（单后端 + 机器人驱动）

bot 侧：进服等就绪信号 → 做玩家操作 → 保持在线等桩判定。**bot 不判 PASS/FAIL**。

```js
// bot/src/scenarios/buySuccess.js
'use strict'
const { waitForMessage } = require('../lib/messages')

module.exports = async function runBuySuccess(context) {
  const { bot, config, log } = context

  // 1) 等桩的就绪信号（冻结协议 E2E_READY）
  await waitForMessage(
    bot,
    (text) => text.includes(`E2E_READY:${config.action}`),
    config.readyTimeoutMs,
    `E2E_READY:${config.action}`,
  )

  // 2) 像玩家一样操作：发命令开店、开 GUI、点购买槽位……（业务特定）
  //    mineflayer 提供窗口/物品 API：bot.openChest / window.click / bot.clickWindow 等；
  //    模板刻意不预置 GUI 点击助手，按你的真实交互自补。
  bot.chat('/shop open')
  // const window = await waitForWindow(bot)         // 自写：等 windowOpen
  // await bot.clickWindow(slot, 0, 0)               // 点购买槽

  // 3) 操作完保持在线，等桩按业务事件/DB 判定并关服。
  log('购买操作已发出，等待桩判定 / 关服')
}
```

跑：`./gradlew e2eBuySuccessWithBot -PmcTestkit.botDir=<你的 bot 目录>`。透传业务参数用 DSL 的 `bot { env("MYPLUGIN_SHOP_SLOT", "11") }`，bot 侧 `process.env.MYPLUGIN_SHOP_SLOT` 读。

---

## 集群场景（跨服切换 + 一致性）

形态：`backends("s1","s2")` + `via="wf"`。N 后端全后台起，代理单 listener + N 具名 server，bot 经代理 `/server <name>` 切。**桩是对称的**——每个后端的桩都装备入服玩家 + 发就绪。

bot 侧（参照 `crossServerBot.js`）：按 `CLUSTER_BACKENDS` 顺序切服，切后等再次 spawn，最后发到达标记：

```js
const backends = String(process.env.MC_TESTKIT_E2E_CLUSTER_BACKENDS || '')
  .split(',').map((s) => s.trim()).filter(Boolean)
await waitForMessage(bot, (t) => t.includes(`E2E_READY:${config.action}`), config.readyTimeoutMs, 'ready')
for (const target of backends.slice(1)) {   // 首个是落地服，从第 2 个起切
  const spawnedAgain = waitForNextSpawn(bot) // 自写：bot.once('spawn', ...)
  bot.chat(`/server ${target}`)
  await spawnedAgain
  // 切服前后做业务操作 + 校验：如在 s1 写入数据，切到 s2 读回断言一致
}
bot.chat('E2E_CLUSTER_ARRIVED')   // 场景特定标记（非冻结协议），触发桩判定
```

桩侧：收到到达标记即判 PASS（示例）。**真实跨服一致性**把到达标记换成业务断言：bot 在 s1 改了背包/经济，切到 s2，桩查共享库确认数据跟着过来了、没回档。用 `MC_TESTKIT_E2E_BACKEND_NAME`（经 `harnessConfig.backendName`）区分「现在判的是哪台」，结果 `details` 里写 `arrivedServer` / `backendName` 便于定位。

**崩溃接管类**（FR-15）：集群代理 listener `priorities` 含全部后端，默认后端宕机时 bot 重连回退到存活后端——可据此测「某后端崩 → bot 落到存活后端 → 由它在归属租约 TTL 过期后接管上线」。模板已带薄示例可照抄：桩 `ScenarioName.CRASH_TAKEOVER` + bot `scenarios/crashTakeover.js`——bot 发场景特定标记 `E2E_TRIGGER_CRASH` 令默认后端 `Runtime.halt` 模拟宕机，断线后经代理 fallback 重连到存活后端发 `E2E_CLUSTER_ARRIVED`，存活桩判到达。框架层 fallback 路由到此为止；**业务层**租约 TTL 接管仍由你的桩在存活后端查共享 DB 改判。

---

## 压测场景（N 服 × M bot 钉服）

形态：`backends(...)` + `stress { botsPerServer = N; durationSeconds = T }`（+ 可选 `via`）。每服 N 个 bot 进程钉本服持续随机施压，各服桩收集本服各 bot 的 `E2E_STRESS_RESULT` 聚合写**本服**结果，框架读全部 per-server 结果聚合判定。**禁用 `count`/多 bot**（规模走 `botsPerServer`）。

bot 侧（参照 `continuousStress.js`）：用 `seed xor botIndex` 播种确定性 RNG，循环里跑**真实业务动作**（替换掉示例的假动作），按返回码分桶，到时上报：

```js
const { mulberry32, jitter, sleep } = require('../lib/random')
await waitForMessage(bot, (t) => t.includes(`E2E_READY:${config.action}`), config.readyTimeoutMs, 'ready')
const rng = mulberry32((config.botIndex ^ config.randomSeed) >>> 0)
const stats = { ok: 0, err: 0, buckets: {} }
const deadline = Date.now() + config.durationMs   // 比桩计时早约 10s 停，留上报窗口
while (Date.now() < deadline) {
  // ← 这里换成真实业务操作（经 GUI/命令随机购买等），按真实返回码记 ok/err 与 buckets
  await sleep(jitter(rng, 50, 50))
}
bot.chat(`E2E_STRESS_RESULT:ok=${stats.ok},err=${stats.err},buckets=${JSON.stringify(stats.buckets)}`)
await sleep(2000)
```

桩侧（参照 `finalizeContinuousStress`）：每个 bot 入服都装备 + 发就绪（不走单次门），收集 `E2E_STRESS_RESULT`，到 duration 末聚合。**业务不变量在这里查共享 DB 断言**：

```kotlin
private fun finalizeContinuousStress() {
    if (!stressFinalized.compareAndSet(false, true)) return
    // 框架只收集 + 聚合；真实「不超卖」「账实一致」请在此查共享 DB / 缓存改判：
    val soldFromDb = queryYourSharedDb()           // 你的查询
    val claimedFromBots = stressResults.values.sumOf { parseOk(it) }
    if (soldFromDb <= STOCK && soldFromDb == claimedFromBots) {
        passScenario("压测不变量成立：售出=$soldFromDb 未超卖", buildDetails())
    } else {
        failScenario("压测不变量被破坏：DB 售出=$soldFromDb 上限=$STOCK 各 bot 声称=$claimedFromBots")
    }
}
```

跑：`./gradlew e2eContinuousStressStress -PmcTestkit.botDir=<bot 目录>`（注意 `Stress` 后缀叠字是对的）。规模在 DSL 调（`botsPerServer` / 后端数），`STRESS_RANDOM_SEED` 可复现一次失败的压测。

---

## 单场景多 bot

一个 scenario 驱动多个 bot，复用既有任务名（起多个 bot 进程，随场景结束全部按 pid 收尾）。模板带薄示例可照抄起手：桩 `ScenarioName.MULTI_BOT` + bot `scenarios/multiBot.js`（多个唯一 username 的 bot 直连入服，桩按入服玩家名收集、settle 窗口末聚合写 PASS——不含业务玩法，换成你的判定即可）。两形态：

**异质具名**（各自角色，如管理 GUI 的 admin/target）：每个 `bot("角色")` 各有 `username`/`action`/`env`，**每个 action 在 bot 侧各写一个场景文件 + 各登记三处**。桩按 username 区分角色驱动。
```kotlin
scenario("gui-edit") {
    backend = "s1"
    bot("admin")  { username = "Admin";  action = "gui-admin" }
    bot("target") { username = "Target"; action = "gui-target" }
}
```

**同质批量**（N 个相同行为的 bot，如集群 N 个并发切服玩家）：一个 `bot{count=N}` 复制 N 份，**共用一个 action**，各 bot 经 `BOT_INDEX`(1..N) 与唯一 username 区分；桩按 index 聚合。
```kotlin
scenario("g16") {
    backends("s1", "s2"); via = "wf"
    bot { username = "P"; action = "cross-server"; count = 8 }   // P1..P8
}
```
bot 侧用 `config.botIndex`（`MC_TESTKIT_E2E_BOT_INDEX`）做每实例差异化（如各切不同目标服 / 各操作不同数据）。

> 多 bot 与压测划清边界：要「N 个 bot 钉服压」用 `stress{botsPerServer}`，不要用 `count`；`count`/多 bot 用于功能性多角色 / 多并发，压测场景里被禁用。

---

## 持久手测 serve（起服挂住给人玩）

serve 和上面四类**不一样**：它**不判定、不需要写场景驱动 / 判定逻辑**。`serve { }` 只是把声明的拓扑起起来挂住，桩在 serve 下**空闲**。所以「serve 怎么写」基本是 **声明 + 确认桩模板带 SERVE 空闲分支**，外加可选的自驱 bot——几乎是「零场景代码」。

**① DSL（消费方）**——单后端 / 集群 / 可选 bot：
```kotlin
serve("dev")     { backend = "s1"; via = "wf" }           // 单后端经代理挂住，真人连代理端口
serve("cluster") { backends("s1", "s2"); via = "wf" }     // 集群整套挂住，真人经代理 /server 切
serve("mixed")   { backend = "s1"; bot { username = "Filler"; action = "idle-walk" } } // 人机混场
```
跑 `./gradlew serveDev`（起服后打印连接信息并**挂住**；Ctrl+C 或另跑 `./gradlew stopDevServe` 停）。

**② 桩（harness）——只需「认得哨兵、进入空闲」，不写场景逻辑。**
模板 v0.4.0 已带 `ScenarioName.SERVE("__mc_testkit_serve__")` + `bootstrapScenario` 的空闲分支（不驱动 / 不挂超时 / 不写结果 / 不关服）+ `onPlayerJoin` 对 SERVE 直接 `return`（不动真人玩家背包）。**你要做的就是确保桩 re-sync 到带这个分支的新模板。** 没有它：serve 下桩会把未知哨兵当默认 `smoke` 跑、写结果、几秒后 `Bukkit.shutdown()` 把服务端关掉（症状＝「serve 起来几秒就自己停了」）；或更老的桩抛「未知场景」被禁用、服务端仍挂着但少了「干净空闲」。serve **不需要**你在桩里加任何 `dispatchScenario` 分支或判定。

**③ bot（可选，人机混场）——必须「自驱」，别等桩 ready。**
serve 桩空闲、**不发 `E2E_READY`**，所以 serve 并起的 bot 不能复用「`await waitForMessage(E2E_READY…)` 再动」的场景 action（会干等到超时）。给它一个连上就自行动作的 action：
```js
// bot/src/scenarios/idleWalk.js —— serve 自驱 bot 示例（不等就绪信号）
'use strict'
module.exports = async function runIdleWalk(context) {
  const { bot, log } = context
  await new Promise((r) => bot.once('spawn', r))   // 等自己进世界，不等桩
  log('自驱 bot 已进服，开始随机走动陪真人')
  for (;;) {                                        // serve 挂着多久就陪多久；停 serve 时被按 pid 收尾
    bot.setControlState('forward', true)
    await new Promise((r) => setTimeout(r, 1500))
    bot.setControlState('forward', false)
    bot.look(Math.random() * Math.PI * 2, 0, true)
    await new Promise((r) => setTimeout(r, 800))
  }
}
```
和别的 action 一样在 `connectAndWait.js` 的 `scenarioRunner()` 登记 `case 'idle-walk'`。serve 的 bot **只陪真人把环境驱到某状态，不判定**——别在里面写 PASS/FAIL。

> 一句话：serve ≈ 「声明 `serve{}` + 桩模板带 SERVE 空闲分支」即可跑；要人机混场再加个自驱 bot。「插件功能对不对」由真人连进去手点验证（serve 不替你判）。

---

## 写完一个场景的自检

- [ ] id 三处一致（DSL `action`/场景名、桩 `ScenarioName.id` + dispatch 分支、bot 文件 + `scenarioRunner` case），全 kebab-case。
- [ ] 桩里那段示例「无条件 PASS」已删，判定来自真实事件 / 控制消息 / DB 查询。
- [ ] bot 只操作不判定；判定全在桩、结果只进 `<scenario>.properties`。
- [ ] 异步事件里的判定切回主线程再 `passScenario`。
- [ ] 集群场景写了 `via`（必经代理）；压测场景没用 `count`/多 bot。
- [ ] 跑对任务名（按 `<Key>` 折法）；透传业务参数走 `bot{ env() }` 而非改契约 env。
