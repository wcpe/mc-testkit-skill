---
description: 给已接 mc-testkit 的项目配置 serve 持久手测（起真实服务端挂住供真人/模拟客户端连入）
argument-hint: "[serve 名，默认 dev]"
---

给当前已接入 mc-testkit 的项目配置 **serve 持久手测**（v0.4.0+）：起真实服务端、装上被测插件、**挂住**供真人客户端连进去手点（可选并起 bot 人机混场）。serve **不判定、不自动收尾**，是和自动化 E2E 并存的「第二条命」。

先读 `${CLAUDE_PLUGIN_ROOT}/skills/mc-testkit/references/authoring-scenarios.md` 的 §serve 与 `dsl-tasks-and-env.md` §1/§2。要点：

1. **DSL** 加 `serve("${ARGUMENTS:-dev}") { backend = "s1" }`——单后端直连；或集群 `backends("s1","s2"); via = "wf"`（真人经代理 `/server` 切）；或加 `bot { username=...; action="<自驱 action>" }` 人机混场。
2. **桩**：确认已带 `ScenarioName.SERVE("__mc_testkit_serve__")` 空闲分支（v0.4.0 模板自带；老桩 re-sync，**否则 serve 会几秒自停**）。serve **不需要**写 `dispatchScenario` 分支或判定。
3. **人机混场 bot 必须「自驱」**：serve 桩空闲、不发 `E2E_READY`，所以陪玩 bot 连上即自行动作（自走/自聊），**别复用等 ready 的自动场景 action**（会干等超时）。
4. 跑 `./gradlew serve<Key> --no-daemon -PmcTestkit.botDir=e2e/bot`（`<Key>` = serve 名折 PascalCase）。停：本终端 **Ctrl+C**，或另跑 `./gradlew stop<Key>Serve`。

把 DSL 改动、桩确认点、（如需）自驱 bot 文件都给出来，并给「连哪个端口手测」与停止命令。
