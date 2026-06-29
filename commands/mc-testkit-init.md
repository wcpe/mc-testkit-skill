---
description: 从零给当前 MC 插件项目接入 mc-testkit（maven 网络插件、禁 includeBuild），跑通最小 smoke
argument-hint: "[后端 MC 版本，默认 1.20.1]"
---

给当前仓库（一个 Bukkit/Paper/Folia 插件 Gradle 项目）从零接入 mc-testkit E2E 编排，先跑通一个最小 smoke。

先读技能 `${CLAUDE_PLUGIN_ROOT}/skills/mc-testkit/SKILL.md` 的「从零接入」路由与 `references/scaffolding-and-integration.md`，严格按它做。**硬约束（务必遵守）**：

1. **只走网络插件、禁用 `includeBuild`**：`settings.gradle.kts` 的 `pluginManagement.repositories` 加 `maven("https://maven.wcpe.top/repository/maven-public/")`；`build.gradle.kts` 用 `id("top.wcpe.mc-testkit") version "<当前版本>"`（版本以 mc-testkit 当前 CHANGELOG 为准）。**绝不** `includeBuild("../mc-testkit")`。
2. **从 GitHub 取 `template/`**（不依赖本机 mc-testkit 副本）：
   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/wcpe/mc-testkit /tmp/mctk
   git -C /tmp/mctk sparse-checkout set template
   # 知道目标版本就 git -C /tmp/mctk checkout v<版本> 对齐
   cp -r /tmp/mctk/template e2e
   ```
3. 改桩：包名（`com.example.e2e`→你的）、`plugin.yml` 的 `main`、`build.gradle.kts` 的 `group`、`paper-api` + `api-version` 到后端 MC 版本（本次用 **$ARGUMENTS**，缺省 1.20.1）。
4. `dependencies{}`：`pluginUnderTest` 指**本项目插件 jar**（env 名），桩 jar 作单独 `plugin("HARNESS_JAR")` 注入——**别把桩当 pluginUnderTest**。
5. 构建桩 fat jar：`./gradlew -p e2e/harness jar`，导出 `HARNESS_JAR` / `MC_TESTKIT_E2E_PLUGIN_UNDER_TEST_JAR`。
6. 声明 `scenario("smoke") { backend = "s1" }`，跑 `./gradlew e2eSmoke -PmcTestkit.botDir=e2e/bot`。

把要新增/改的文件与片段全写出来，最后给跑通命令。遵守技能「三条铁律」与「环境坑」（经代理用 via、集群必经代理、压测不用 count、判定只在桩等）。
