---
description: 在 DSL/桩/bot 三处一致地登记一个新自动化 E2E 场景（防「三处不一致」这个头号坑）
argument-hint: "<场景 kebab-id，如 buy-success>"
---

给当前已接入 mc-testkit 的项目加一个新的**自动化** E2E 场景，id = `$ARGUMENTS`（kebab-case；若用户没给就先问清）。

读 `${CLAUDE_PLUGIN_ROOT}/skills/mc-testkit/references/authoring-scenarios.md` 的「三处登记配方」与桩/bot 侧通用件。**最高频的 bug 是三处 id 不一致**，所以务必用同一个 id `$ARGUMENTS` 在三处登记：

1. **DSL**（`build.gradle.kts`）：`scenario("$ARGUMENTS") { backend = "s1"; bot { username = "..."; action = "$ARGUMENTS" } }`（经代理加 `via`、集群用 `backends(...)`、压测用 `stress{}`——按用户需求选）。
2. **桩**（`e2e/harness/.../ScenarioName.kt` + 主体）：加枚举 `XXX("$ARGUMENTS")` + `dispatchScenario` 分支——装备玩家 + 发 `E2E_READY` + **由被测插件真实事件 / 控制消息 / 查共享 DB 判定**（`passScenario`/`failScenario`），**删掉模板的无条件 PASS 占位**（留着就是假绿）。
3. **bot**（`e2e/bot/src/scenarios/<驼峰>.js` + `connectAndWait.js` 的 `scenarioRunner()` 加 `case '$ARGUMENTS'`）：进服等 `E2E_READY` → 像玩家一样操作 → 保持在线等桩判定。**bot 不判 PASS/FAIL**。

判定永远在桩、只进 `<scenario>.properties`；不改冻结契约名。最后给出三处代码 + 跑 `e2e<Key>WithBot`（`<Key>` = 场景名折 PascalCase）。
