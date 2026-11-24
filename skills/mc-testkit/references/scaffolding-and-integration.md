# 从零接入 mc-testkit

把一个还没有 E2E 的消费方插件项目接上 mc-testkit，跑通第一个 smoke，再加业务场景。本文是「初次接入」的完整步骤；DSL/任务/env 的细节查 `dsl-tasks-and-env.md`，写场景查 `authoring-scenarios.md`。

> **最佳真源**：mc-testkit 仓库的 `.github/workflows/e2e.yml` 是一份**能跑通的、最小的消费者接入实例**（自举：用 `template/` 的桩与 bot 真实下载后端 + 代理跑全矩阵）。v0.3.0 起它按 `-Pe2e.proxy`（waterfall/bungeecord/velocity）× `-Pe2e.backend`（paper/folia）+ `-Pe2e.backendVersion` **参数化平台**，同一套场景跑遍「代理 × 后端」——含单服(±bot) / 经代理 / 集群 / 压测 / 多 bot / 崩溃接管 / Folia。接入遇到拿不准的接线，去读它，比任何文档都准。

## 0. 前置条件

- **JDK**：匹配后端 MC 版本所需的 Java。v0.6.0（FR-21）按版本段选运行时：1.7.10 → Java 8、1.12.2/1.16.5/1.17.1 → Java 17、1.19.4+ → Java 17/21（各段用 `MC_TESTKIT_JAVA_HOME_<版本段>` 覆盖 > `JAVA_HOME` 回退 > 当前 JVM；同机多版本 JDK 各设一个段 env 即可）。
- **Node ≥ 18**：跑 mineflayer 机器人（1.7.10 后端自动跳过 bot 并告警）。
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

> ⛔ **必须走网络插件，禁用 `includeBuild`。** 本技能假定 mc-testkit 已发布到 maven（`maven.wcpe.top`），消费方**只经网络插件**接入——即上面 `pluginManagement` 的 maven 仓库 + 下方 `plugins { id("top.wcpe.mc-testkit") version "x.y.z" }`。**不要用 `includeBuild("../mc-testkit")`**：它要求本机有一份 mc-testkit 源码副本，在没有本地 clone 的机器（CI / 队友 / 经插件分发的环境）上根本不成立，还把版本钉死在一份易漂移的本地源码上。需要某个尚未发布的改动 → 先把 mc-testkit **发版 / 发快照到 maven**，再升消费方的 `version`，**绝不** `includeBuild`。

## 2. 应用插件、声明拓扑与场景（消费方 `build.gradle.kts`）

```kotlin
plugins {
    id("top.wcpe.mc-testkit") version "0.18.0"   // 版本以 mc-testkit README/CHANGELOG 当前值为准
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

## 3. 先确认并取得 `template/`（桩 + 机器人）

`template/` 是**拷贝脚手架、不在 maven 构件里**（编排插件运行期不依赖它），所以走网络插件接入时它**不随 maven 自动来**。执行前必须先问用户模板来源，禁止默认选择：

- **内置模板快照**：用本技能 `assets/mc-testkit-template-v0.18.0.zip`。适合离线、可复现接入。
- **GitHub 实时拉取**：从 `wcpe/mc-testkit` 指定 tag/branch/commit 取 `template/`。适合需要精确对齐上游版本。

用户选择后，定位本技能目录并运行对应命令：

```bash
# 内置快照：不依赖网络
node scripts/resolve-template.mjs --source embedded --destination e2e

# GitHub 拉取：0.18.0 会归一到当前内置快照对应的发布提交
node scripts/resolve-template.mjs --source github --version 0.18.0 --destination e2e
```

目标 `e2e/` 已存在时必须停下来确认；确认可覆盖后才加 `--force`。

如不用本技能脚本，GitHub 取模板的等效手工步骤是：

```bash
# 只取 template/ 一个目录（sparse-checkout）；版本对齐你用的 mc-testkit
rm -rf .tmp/mctk
git clone --filter=blob:none --sparse https://github.com/wcpe/mc-testkit .tmp/mctk
git -C .tmp/mctk checkout 55c2aacb37d5dbb2a9e2089450163fad2ca70760
git -C .tmp/mctk sparse-checkout set template
cp -r .tmp/mctk/template e2e        # 拷进你仓库、改名 e2e/；之后完全归你
```

拷得 `e2e/harness/`（Kotlin 桩）与 `e2e/bot/`（mineflayer 机器人）。它是**拷贝物不是依赖**：拷走后完全归你、自由分叉；编排插件运行期不依赖它。

桩 `harness/` 要改的几处：
1. **包名**：`com.example.e2e` → 你的包名；同步改 `src/main/resources/plugin.yml` 的 `main` 与 `build.gradle.kts` 的 `group`。
2. **协议胶水**：v0.17.0 起桩依赖共享构件 `top.wcpe.mc:harness-core`（`build.gradle.kts` 已配 maven.wcpe.top 仓库；Java 8 字节码、`plugin.yml` 不写 `api-version`，Paper 1.7.10–1.21 通吃）——结果写出/配置读取随构件升级，你只写业务场景，不要把协议代码拷回桩里自写。
3. **MC 版本**：harness 目标已是 Java 8 + 不声明 api-version（0.9.3 起），**不用**再按后端版本改 `paper-api`/`api-version`——共享构件兼容段已覆盖。
3. **读被测插件 API（可选）**：桩要调被测插件的 API 时，在 `plugin.yml` 加 `depend: [YourPlugin]`（控制加载顺序），在 `harness/build.gradle.kts` 加 `compileOnly("你的插件坐标")`。`-Xskip-metadata-version-check` 已就位，可引用「更新版 Kotlin 编译」的被测插件类。
4. **Folia 后端（仅当你后端用 Folia）**：保留 `plugin.yml` 里的 `folia-supported: true`（否则 Folia 拒载桩）；桩骨架的调度已用反射做 Folia 兼容（`runSync`/`runLater` → `GlobalRegionScheduler`），**别删、别改回裸 `server.scheduler.runTask*`**。只跑 Paper 时这行无害（Paper 忽略它）。注意这只解决**桩**的 Folia 兼容；你的**被测插件**若要跑在 Folia 上，也得它自己支持 Folia。

机器人 `bot/`：v0.17.0 起 bot 内核来自共享 npm 构件 `@wcpe/mc-testkit-bot`（私有源 `maven.wcpe.top/repository/npm-release/`，匿名可读）——在消费方项目根或 `~/.npmrc` 加 `@wcpe:registry=https://maven.wcpe.top/repository/npm-release/`，否则 `npm install` 去公共 registry 报 404；`~/.npmrc` 里残留过期 `_authToken` 会报 401，删掉即可。bot 侧只需加场景文件（见 `authoring-scenarios.md`）。

> **不要动冻结契约名**：桩里的 `E2E_READY` / `status` / `message` 等、机器人里的 `MC_TESTKIT_E2E_BOT_*` 读取名，都是编排对接的冻结契约（见三条铁律之三），改了就三方对不上。

## 4. 构建桩 jar，接好依赖注入与机器人目录

**桩是独立 Gradle 子工程**（自带 `settings.gradle.kts`，**不**加进你 root 的 `settings.gradle.kts`）。先把它构建成 jar（桩 jar 也可改用 `plugin(from = tasks.named(...))` 产物来源声明、免手工构建+导 env，见 dsl-tasks-and-env.md §1）：

```bash
./gradlew -p e2e/harness jar
# 产物：e2e/harness/build/libs/mc-testkit-e2e-harness-1.0.0-SNAPSHOT.jar（fat jar，已内联 kotlin-stdlib）
```

然后让编排把它和被测插件一起注入测试服 `plugins/`——`dependencies{}` 的每个值是**环境变量名或路径**（运行期解析，保证可移植）：

```bash
export MC_TESTKIT_E2E_PLUGIN_UNDER_TEST_JAR=build/libs/your-plugin.jar   # 指向你的插件产物；用相对路径，别写死本机绝对路径
export HARNESS_JAR=e2e/harness/build/libs/mc-testkit-e2e-harness-1.0.0-SNAPSHOT.jar
```

- **被测插件**（`pluginUnderTest`）注入后改名 `plugin-under-test.jar`；其余 `plugin(...)` 按原名注入。**自测模式**（v0.9.0+）：不声明 `pluginUnderTest` 时框架自动取本模块 `jar` 产物并接好任务依赖，可跳过这一段 env 导出；shadow fat jar 项目用 `pluginUnderTest(from = tasks.named("shadowJar"))`（v0.15.0）。
- **依赖插件的其它来源**：`mavenPlugin("g:a:v")`（v0.11.0 按 Maven 坐标）与 `plugin(from = tasks...)`（v0.16.0 产物来源，与路径形式可混用）。
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
- `run-<后端名>/`：各后端运行目录（cwd，v0.10.0 起按后端隔离）；**服务端日志在其 `logs/`**。后端声明 `runDirectory`（v0.18.0）则改用该持久目录、不每轮清空。
- `run-proxy/`：代理运行目录；**代理日志 `proxy.log` 在这**。
- `results/`：**结果文件 `<scenario>.properties`（判定真源）**、机器人日志、各 pid、`process-ledger.properties` 进程台账与 `output-run.state` 输出所有权记录（v0.18.0）。上一轮残留进程挡住接手时跑 `stopE2eProcesses`。
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

- [ ] settings 的 `pluginManagement` 声明了 maven 插件仓库（`maven.wcpe.top/.../maven-public`）、`build.gradle.kts` 经 `id("top.wcpe.mc-testkit") version "x.y.z"` 应用——**没有用 `includeBuild`**。
- [ ] `build.gradle.kts` 应用插件、声明了 backend 与至少一个 scenario、`dependencies{}` 含被测插件（或靠自测模式/`from=` 产物来源）+ 桩 jar。
- [ ] bot 依赖已声明私有 npm 源 `@wcpe:registry=https://maven.wcpe.top/repository/npm-release/`（v0.17.0+）。
- [ ] 拷了 `template/`，改了桩包名 / `plugin.yml main` / `group` / MC 版本（paper-api + api-version 一致）。
- [ ] 桩 jar 已 `./gradlew -p <harness> jar` 构建成功；`HARNESS_JAR` / 被测插件 jar 的 env 已导出。
- [ ] `mcTestkit.botDir` 指向你的 bot 目录。
- [ ] DB/Redis 等依赖服务已起（若被测插件需要）。
- [ ] `./gradlew :tasks` 看得到 `e2e*` 任务、配置期无环、缺依赖报中文错。
- [ ] `e2eSmoke` 实机 PASS、服务端干净自停、端口释放。
