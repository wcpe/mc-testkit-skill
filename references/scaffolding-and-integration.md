# 从零接入 mc-testkit

把一个还没有 E2E 的消费方插件项目接上 mc-testkit，跑通第一个 smoke，再加业务场景。本文是「初次接入」的完整步骤；DSL/任务/env 的细节查 `dsl-tasks-and-env.md`，写场景查 `authoring-scenarios.md`。

> **最佳真源**：mc-testkit 仓库的 `.github/workflows/e2e.yml` 是一份**能跑通的、最小的消费者接入实例**（自举：用 `template/` 的桩与 bot 真实下载后端 + 代理跑全矩阵）。v0.3.0 起它按 `-Pe2e.proxy`（waterfall/bungeecord/velocity）× `-Pe2e.backend`（paper/folia）+ `-Pe2e.backendVersion` **参数化平台**，同一套场景跑遍「代理 × 后端」——含单服(±bot) / 经代理 / 集群 / 压测 / 多 bot / 崩溃接管 / Folia。接入遇到拿不准的接线，去读它，比任何文档都准。

## 0. 前置条件

- **JDK**：匹配后端 MC 版本所需的 Java（Paper 1.20.1 → JDK 17）。
- **Node ≥ 18**：跑 mineflayer 机器人。
- **网络（首次）**：编排内置模块首次会下载 Paper/Folia/代理 jar 并缓存复用；无网 / 弱网时用 `MC_TESTKIT_E2E_*_JAR` / `*_VERSION` 环境变量提供本地 jar（见 `dsl-tasks-and-env.md`）。
- **依赖服务**：被测插件要的 MySQL/Redis 等，由你在跑之前起好（本地容器 / 实例），端口与凭据匹配其测试配置。真实后端含数据源初始化常需数十秒启动——机器人默认连接重试窗口已放到 300s（`BOT_CONNECT_TIMEOUT_MS`）；集群/压测另有端口就绪门确定性等后端 + 代理端口可连再放 bot。

## 1. 声明插件仓库（消费方 `settings.gradle.kts`）

```kotlin
pluginManagement {
    repositories {
        gradlePluginPortal()
        maven("https://maven.wcpe.top/repository/maven-public/")
    }
}
```

**本地联调更快的方式**：把 mc-testkit clone 到同机，用 `includeBuild("../mc-testkit")` 接入——改动即生效、无需发布。首个接入项目验证期就是这么做的。两者二选一。

## 2. 应用插件、声明拓扑与场景（消费方 `build.gradle.kts`）

```kotlin
plugins {
    id("top.wcpe.mc-testkit") version "0.3.0"   // 版本以 mc-testkit README/CHANGELOG 当前值为准
}

mcTestkit {
    backend("s1") { platform = paper; version = "1.20.1"; port = 25565 }

    scenario("smoke") { backend = "s1" }          // 无 bot：仅校验桩 + 被测插件就绪

    dependencies {
        pluginUnderTest = "MC_TESTKIT_E2E_PLUGIN_UNDER_TEST_JAR" // 你的被测插件（env 名或路径）
        plugin("HARNESS_JAR")                                     // ← 桩 jar（见第 4 步）
        // plugin("SomeDepLib")                                   // 被测插件运行要的其它依赖插件
    }
}
```

> 平台便捷量 `paper`/`folia`/`velocity`/`waterfall`/`bungeecord` 直接可用，无需 import。

## 3. 拷贝 `template/` 并改造（桩 + 机器人）

把 mc-testkit 的整个 `template/` 目录拷进你的仓库（建议改名 `e2e/`），得到 `e2e/harness/`（Kotlin 桩）与 `e2e/bot/`（mineflayer 机器人）。它是**拷贝物不是依赖**：拷走后完全归你，自由分叉；编排插件运行期不依赖它。

桩 `harness/` 要改的几处：
1. **包名**：`com.example.e2e` → 你的包名；同步改 `src/main/resources/plugin.yml` 的 `main` 与 `build.gradle.kts` 的 `group`。
2. **MC 版本**：`build.gradle.kts` 的 `paper-api:1.20.1-R0.1-SNAPSHOT` 与 `jvmToolchain(17)`、`plugin.yml` 的 `api-version: '1.20'` 改到你后端的 MC 版本。
3. **读被测插件 API（可选）**：桩要调被测插件的 API 时，在 `plugin.yml` 加 `depend: [YourPlugin]`（控制加载顺序），在 `harness/build.gradle.kts` 加 `compileOnly("你的插件坐标")`。`-Xskip-metadata-version-check` 已就位，可引用「更新版 Kotlin 编译」的被测插件类。
4. **Folia 后端（仅当你后端用 Folia）**：保留 `plugin.yml` 里的 `folia-supported: true`（否则 Folia 拒载桩）；桩骨架的调度已用反射做 Folia 兼容（`runSync`/`runLater` → `GlobalRegionScheduler`），**别删、别改回裸 `server.scheduler.runTask*`**。只跑 Paper 时这行无害（Paper 忽略它）。注意这只解决**桩**的 Folia 兼容；你的**被测插件**若要跑在 Folia 上，也得它自己支持 Folia。

机器人 `bot/`：通常不用改内核，直接加场景文件（见 `authoring-scenarios.md`）。

> **不要动冻结契约名**：桩里的 `E2E_READY` / `status` / `message` 等、机器人里的 `MC_TESTKIT_E2E_BOT_*` 读取名，都是编排对接的冻结契约（见三条铁律之三），改了就三方对不上。

## 4. 构建桩 jar，接好依赖注入与机器人目录

**桩是独立 Gradle 子工程**（自带 `settings.gradle.kts`，**不**加进你 root 的 `settings.gradle.kts`）。先把它构建成 jar：

```bash
./gradlew -p e2e/harness jar
# 产物：e2e/harness/build/libs/mc-testkit-e2e-harness-1.0.0-SNAPSHOT.jar（fat jar，已内联 kotlin-stdlib）
```

然后让编排把它和被测插件一起注入测试服 `plugins/`——`dependencies{}` 的每个值是**环境变量名或路径**（运行期解析，保证可移植）：

```bash
export MC_TESTKIT_E2E_PLUGIN_UNDER_TEST_JAR=/abs/path/to/your-plugin.jar
export HARNESS_JAR=$PWD/e2e/harness/build/libs/mc-testkit-e2e-harness-1.0.0-SNAPSHOT.jar
```

- **被测插件**（`pluginUnderTest`）注入后改名 `plugin-under-test.jar`；其余 `plugin(...)` 按原名注入。
- 缺任一注入项，编排在配置/prepare 期抛**中文**错误，列出缺什么、可经哪个 env 补。
- **机器人目录**经 Gradle 属性 `mcTestkit.botDir` 定位，缺省是相对**根工程**的 `e2e-bot`，入口固定 `<botDir>/src/connectAndWait.js`。你拷成了 `e2e/bot` 就跑时传 `-PmcTestkit.botDir=e2e/bot`（相对根工程；绝对路径直接采用）。
- 被测插件 / 依赖插件的**测试配置**（含 DB/Redis 连接、业务 test 配置）经 `MC_TESTKIT_E2E_SERVER_TEMPLATE_DIR` 指一个服务端模板目录，prepare 会铺进运行目录（排除世界 / 日志）。

> **自举 vs 真实消费者**：mc-testkit 自己的 `e2e.yml` 里桩**本身**就是被测对象，故写 `pluginUnderTest = "HARNESS_JAR"`。真实消费者的被测对象是**你自己的插件**，所以 `pluginUnderTest` 指你的插件、桩 jar 作为额外 `plugin("HARNESS_JAR")` 注入。别照抄成把桩当被测插件。

## 5. 跑通

```bash
./gradlew :tasks                       # 确认生成了 e2eSmoke 等任务、配置期无错
./gradlew e2eSmoke -PmcTestkit.botDir=e2e/bot
```

smoke 通过 = 真实后端被下载并启动、桩 `onEnable` 就绪、写出 `status=PASS`、服务端自停、verify 判 PASS。之后再加机器人驱动场景，跑 `e2e<Key>WithBot`（见 `authoring-scenarios.md`）。机器人 npm 依赖由编排的 `npmInstallE2eBot` 自动安装。

## 运行目录与产物（排障时看这里）

编排在 `build/mc-testkit/`（E2E 工作根，`clean` 即清）下建（路径源自 `RunLayout`）：
- `run/`：单后端运行目录（cwd）；**服务端日志在 `run/logs/`**。集群下每个后端各自 `run-<后端名>/`（日志在其 `logs/`）。
- `run-proxy/`：代理运行目录；**代理日志 `proxy.log` 在这**。
- `results/`：**结果文件 `<scenario>.properties`（判定真源）**、机器人日志、各 pid（`proxy-<名>.pid` / `backend-<名>.pid`）。
- 下载的 jar 缓存在 `<Gradle 用户主目录>/caches/mc-testkit-jars`、持久运行库在根工程 `.gradle/mc-testkit/server-base`（`syncE2eRuntimeCache` 回写、`purgeE2eRuntimeCache` 清空，跨 `clean` 复用免反复下载）。

## 加进 `.gitignore`

运行期产物不要入库：

```gitignore
# mc-testkit E2E 运行期产物
e2e/bot/node_modules/
e2e/harness/build/
build/mc-testkit/
*.log
```

## 初次接入自检清单

- [ ] settings 声明了插件仓库（或 `includeBuild`）。
- [ ] `build.gradle.kts` 应用插件、声明了 backend 与至少一个 scenario、`dependencies{}` 含被测插件 + 桩 jar。
- [ ] 拷了 `template/`，改了桩包名 / `plugin.yml main` / `group` / MC 版本（paper-api + api-version 一致）。
- [ ] 桩 jar 已 `./gradlew -p <harness> jar` 构建成功；`HARNESS_JAR` / 被测插件 jar 的 env 已导出。
- [ ] `mcTestkit.botDir` 指向你的 bot 目录。
- [ ] DB/Redis 等依赖服务已起（若被测插件需要）。
- [ ] `./gradlew :tasks` 看得到 `e2e*` 任务、配置期无环、缺依赖报中文错。
- [ ] `e2eSmoke` 实机 PASS、服务端干净自停、端口释放。
