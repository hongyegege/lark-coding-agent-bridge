# lark-cursor-bridge

把飞书 / Lark 消息和本机 **Cursor Agent**（`@cursor/sdk` 本地 runtime）打通的轻量 bot。也仍支持 Claude Code / Codex CLI。用一条命令启动，绑定飞书 Bot 应用，然后在飞书里遥控本机 Agent 读图、处理文件、改代码。

[English README](./README.md)

## 项目来源

本项目基于开源项目 [**lark-coding-agent-bridge**](https://github.com/zarazhangrui/lark-coding-agent-bridge) 进行优化与扩展，**原作者**：[zarazhangrui](https://github.com/zarazhangrui)。

| | 上游项目 | 本仓库（fork） |
|---|----------|----------------|
| **默认 Agent** | Claude Code / Codex | **Cursor Agent** |
| **CLI 名称** | `lark-channel-bridge` | `lark-cursor-bridge`（保留旧名兼容） |
| **额外能力** | — | Cursor SDK 集成、Windows 24/7 计划任务与看门狗 |

感谢原作者的 bridge 架构、飞书流式卡片、会话模型与多 profile 设计。与本 fork（Cursor 渠道）相关的问题请在本仓库反馈；通用 bridge 行为仍可参考上游文档。

产品效果概览见[飞书社区文档](https://larkcommunity.feishu.cn/docx/OaRIdFIRFoLM3xxTmKwcetHqn5e)。

---

## 开箱即用快速开始

**目标：** 把仓库克隆到 PC，安装一次，几分钟内在飞书里和 bot 对话。

### 方式 A — 让 AI Coding Agent 帮你配置（推荐）

1. 将本仓库克隆到本机。
2. 用 **Cursor**（或其他 AI coding agent）打开项目目录。
3. 对 agent 说：**「请按 AGENTS.md 帮我完成 lark-cursor-bridge 的开箱即用配置」**。
4. Agent 会分步引导你提供飞书 **App ID**、**App Secret**、**Cursor API Key**，并完成安装、构建与首次启动。

面向 AI Agent 的完整操作手册：**[AGENTS.md](./AGENTS.md)**。

### 方式 B — 手动配置（Cursor，推荐）

#### 1. 部署前准备

| 要求 | 说明 |
|------|------|
| Node.js **≥ 20.12.0** | 终端执行 `node -v` 确认 |
| **Cursor User API Key** | [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) 创建 |
| **Cursor 桌面客户端** | SDK 依赖本地 runtime，需保持可用 |
| **飞书 Bot 应用** | 企业自建应用，开通机器人 + 长连接事件 |

设置 API Key（PowerShell，用户级，**重启终端**后生效）：

```powershell
[System.Environment]::SetEnvironmentVariable('CURSOR_API_KEY', 'cursor_...', 'User')
```

可选模型（默认 `composer-2.5`）：

```powershell
[System.Environment]::SetEnvironmentVariable('CURSOR_MODEL', 'composer-2.5', 'User')
```

#### 2. 从源码安装

```powershell
git clone <本仓库地址>
cd lark-cursor-bridge
npm install
npm run build
npm i -g .
```

> **Windows**：`@cursor/sdk` 依赖 `sqlite3` 原生模块。若 `npm install` 报 node-gyp / Python 错误，请安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含 C++ 工作负载）后重试。

#### 3. 首次前台运行

已有飞书应用时：

```powershell
lark-cursor-bridge run --app-id cli_xxxxxxxx --agent cursor
```

未传 `--app-secret` 或环境变量 `LARK_APP_SECRET` 时，会交互提示输入 **App Secret**（请勿在日志中泄露）。

或使用扫码向导（PersonalAgent）：

```powershell
lark-cursor-bridge run --agent cursor
```

首次成功会写入 `~/.lark-channel/config.json`。

#### 4. 在飞书中使用

1. 飞书 **私聊** bot。
2. 发送 `/cd D:\你的项目路径`（或 macOS/Linux 绝对路径）指定工作区。
3. 发送任务；回复以流式卡片展示。

#### 5. 后台常驻（可选）

前台联调正常后，`Ctrl-C` 停止，再注册服务：

```powershell
lark-cursor-bridge start --agent cursor --app-id cli_xxxxxxxx
lark-cursor-bridge status
```

详见下文 [后台运行](#后台运行) 与 [Windows 24/7 常驻部署](#windows-247-常驻部署)。

---

## 功能特性

- 在飞书私聊直接发消息，或在群里 `@bot`，把任务转给本机 **Cursor Agent** / Claude Code / Codex CLI。
- **流式卡片**：文本回复和工具调用实时更新在同一张卡片上。
- **会话延续**：每个聊天、话题或文档评论有自己的会话，不会互相串。
- **排队与消息合并**：短时间连续发送的消息会合并处理；任务运行中收到的普通消息会排队到下一轮，`/new`、`/cd`、`/ws use`、`/stop` 这类命令可以中断当前任务。
- **多工作空间**：用 `/cd` 切换当前项目，用 `/ws` 保存和复用常用项目目录。
- **图片 / 文件**：直接发给 bot，bridge 下载到本地后交给本机 agent 处理。
- **卡片按钮**：`/help`、`/ws list`、`/status` 返回可点击的交互卡片。

## 应用场景

- **移动办公**：手机飞书发需求，本机 Agent 改代码、跑命令、看日志。
- **个人助手**：默认仅创建者可用，私聊即可驱动本机开发环境。
- **团队协作**：通过 `/invite` 开放指定同事或工作群。
- **多 Agent 并行**：不同 profile 分别绑定 Cursor、Claude、Codex 与不同飞书应用。
- **7×24 常驻**：注册系统服务后，脱离终端窗口持续运行（Windows 见计划任务章节）。

## 部署要求

### 运行环境

- **Node.js** ≥ 20.12.0
- **操作系统**：macOS、Linux、Windows 10+
- **网络**：本机可访问飞书 Open API 与 WebSocket 长连接

### Agent 依赖（三选一，默认 Cursor）

| Agent | 要求 |
|-------|------|
| **Cursor（默认）** | `CURSOR_API_KEY` 环境变量；Cursor 桌面版运行中 |
| Claude Code | 本机安装并登录 `claude` CLI |
| Codex CLI | 本机安装并登录 `codex` CLI |

### 飞书 Bot 应用要求

在 [飞书开放平台](https://open.feishu.cn/app)（国际版 [Lark](https://open.larksuite.com/app)）创建 **企业自建应用**：

- 启用 **机器人**、**长连接（WebSocket）** 接收事件
- 事件订阅：`im.message.receive_v1`、卡片回调等
- 开通消息收发、**CardKit 流式卡片** 相关权限
- 记录 **App ID**（`cli_…`）与 **App Secret** 供 bridge 初始化

身份策略推荐 **bot-only**（仅 App ID + Secret）。bridge 初始化 profile 时会配置 `lark-cli config strict-mode bot`。

### 后台服务额外要求（Windows）

| 用户级环境变量 | 用途 |
|----------------|------|
| `CURSOR_API_KEY` | Cursor SDK 认证 |
| `LARK_APP_SECRET` | 非交互 `start` 必需 |
| `CURSOR_MODEL` | 可选，默认 `composer-2.5` |
| `CURSOR_MODEL_FAST` | 可选，设为 `1`/`true` 启用 Fast 模式；默认关闭 |

`start` 注册 daemon 前须 **全局安装** CLI（`npm i -g .`），勿用 `npx` 路径。

---

## 安装（npm 全局）

```bash
npm i -g lark-cursor-bridge
# 兼容旧命令名
# npm i -g lark-channel-bridge
```

## 首次启动

```bash
lark-cursor-bridge run
# 或指定 agent：--agent cursor | claude | codex
```

第一次运行会进入扫码向导（未传 `--app-id` 时）：

1. 终端渲染二维码。
2. 用飞书 App 扫码。
3. 选择或创建 PersonalAgent 应用。
4. 如果终端提示，选择本次要初始化的 agent。
5. 成功后配置写入 `~/.lark-channel/config.json`。

没有指定项目目录也可以启动。bridge 会创建一个 profile 托管的默认工作目录；启动后在飞书里发送 `/cd <path>` 切到实际项目。

如果已经有应用凭据，可以在初始化时传 `--app-id`；命令会提示输入 App Secret。

```bash
lark-cursor-bridge run --app-id cli_xxx --agent cursor
lark-cursor-bridge start --app-id cli_xxx --agent cursor
```

Lark 国际版应用可加 `--tenant lark`。

## 后台运行

`run` 适合首次配置和前台调试。确认 bot 能正常收发消息后，先用 `Ctrl-C` 停掉前台进程，再用系统服务常驻后台：

```bash
lark-cursor-bridge start
lark-cursor-bridge status
lark-cursor-bridge stop
```

服务层命令必须先全局安装，不能直接用 `npx`。daemon 的 launchd plist / systemd unit / Windows 任务会记录 bridge CLI 的路径；如果这个路径来自 npm 临时缓存，缓存清掉后 daemon 就起不来。`run` 用 `npx` 单次启动没问题。

服务层命令按 profile 注册，每个 profile 有独立服务：

```bash
lark-cursor-bridge start [--profile <name>]
lark-cursor-bridge stop [--profile <name>]
lark-cursor-bridge restart [--profile <name>]
lark-cursor-bridge status [--profile <name>]
lark-cursor-bridge unregister [--profile <name>]
```

平台映射：
- **macOS**：launchd 用户代理 `ai.lark-channel-bridge.bot.<profile>`
- **Linux**：systemd 用户单元 `lark-channel-bridge.bot.<profile>.service`
- **Windows**：Task Scheduler 任务 `LarkChannelBridge.Bot.<profile>`，launcher 是 `.cmd`

daemon 日志在 `~/.lark-channel/profiles/<profile>/logs/daemon/`。

### Windows 24/7 常驻部署

`run` 适合调试；确认飞书收发正常后，用 `start` 注册计划任务，Bridge 脱离终端窗口后台运行。

**前置条件（User 级环境变量，计划任务运行时读不到未烘焙的变量）：**

| 变量 | 用途 |
|------|------|
| `CURSOR_API_KEY` | Cursor SDK 认证 |
| `LARK_APP_SECRET` | 飞书 Bot Secret（非交互 `start` 必需） |
| `CURSOR_MODEL` | 可选，默认 `composer-2.5` |
| `CURSOR_MODEL_FAST` | 可选，设为 `1`/`true` 启用 Fast 模式；默认关闭 |

**全局安装（必须，`start` 会把 CLI 路径写入 launcher）：**

```powershell
cd <bridge-repo>
npm run build
npm i -g .
```

**注册并启动服务：**

```powershell
$env:LARK_APP_SECRET = [Environment]::GetEnvironmentVariable('LARK_APP_SECRET','User')
lark-cursor-bridge start --profile cursor --agent cursor --skip-check-lark-cli
lark-cursor-bridge status --profile cursor
```

**Windows 任务说明：**

- 主任务 `LarkChannelBridge.Bot.<profile>`：用户登录时启动；`launcher.cmd` 内含崩溃重启循环（进程退出后 5 秒自动重拉）
- 看门狗 `LarkChannelBridge.Watchdog.<profile>`：每 5 分钟检查主任务是否在跑，若已停止则自动 `/Run`
- Launcher 脚本：`~/.lark-channel/daemon/<profile>/launcher.cmd`
- 日志：`~/.lark-channel/profiles/<profile>/logs/daemon/daemon-stdout.log` 与 `daemon-stderr.log`

**24/7 运行约束：**

- 用户需至少登录一次 Windows（`ONLOGON` 触发）；锁屏期间 Bridge 可继续运行
- Cursor 客户端需保持打开（SDK 依赖本地 runtime）
- 电源选项设为「从不睡眠」；睡眠/休眠会断开网络与本地连接
- 若需重启后无人值守：配置 Windows 自动登录 + Cursor 开机自启

**日常运维：**

```powershell
lark-cursor-bridge status --profile cursor
lark-cursor-bridge restart --profile cursor
lark-cursor-bridge stop --profile cursor       # 停止并禁用自启
lark-cursor-bridge unregister --profile cursor # 卸载计划任务
```

**升级 bridge 后：** 重新执行 `npm i -g .` 和 `lark-cursor-bridge start`，以刷新 launcher 中的 node/CLI 路径。

**计划任务失败（拒绝访问）：** 公司策略可能禁用 Task Scheduler。`start` 会自动降级为 **「启动」文件夹 + 后台 launcher**（无需手动操作）。也可手动将 `launcher.cmd` 快捷方式放入：

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

**验证清单：**

1. 关闭所有运行 `run` 的终端 → 飞书仍可收发
2. 锁屏 10 分钟后解锁 → 飞书仍可收发
3. `taskkill /PID <bridge-pid> /F` 强杀 node 进程 → 5–10 秒内自动恢复（见 daemon-stderr.log 中的 `bridge exited, restart`）

### 多 profile：分别运行 Cursor、Claude 和 Codex

默认情况下，bridge 使用当前激活的 profile；可以通过 `profile use <name>` 切换。每个 profile 会维护独立的应用凭据、会话、工作目录和日志。只有在需要同时连接多个应用，或分别运行不同 agent 时，才需要创建多个 profile：

```bash
lark-cursor-bridge start --profile claude --agent claude
lark-cursor-bridge start --profile codex --agent codex
```

例如只重启 Codex bot：

```bash
lark-cursor-bridge restart --profile codex
lark-cursor-bridge status --profile codex
```

## 命令速查

### 宿主 CLI

```text
lark-cursor-bridge run [--profile <name>] [--agent cursor|claude|codex] [--workspace <path>] [-c <config>]
lark-cursor-bridge migrate [--profile <name>] [--agent cursor|claude|codex]
lark-cursor-bridge ps
lark-cursor-bridge kill <id|#>
lark-cursor-bridge --help
```

`profile use <name>` 会切换后续默认启动使用的 profile。需要同时跑多个 bot、连接多套应用，或做脚本化部署时，再使用这些 profile 管理命令：

```bash
lark-cursor-bridge profile create cursor --agent cursor
lark-cursor-bridge profile create codex --agent codex
lark-cursor-bridge profile list
lark-cursor-bridge profile use <name>
lark-cursor-bridge profile remove <name>
lark-cursor-bridge profile remove <name> --purge --yes
lark-cursor-bridge profile export <name> [--output ./profile.json] [--force]
lark-cursor-bridge profile export <name> --include-secrets --yes
```

`profile remove` 默认归档本地状态，也可以删除当前激活的 profile。若还剩其他 profile，会自动切到下一个；若这是最后一个 profile，会清空 root config，之后可以用同名重新创建。只有加 `--purge --yes` 才会永久删除。`profile export` 默认脱敏 app secret；只有加 `--include-secrets --yes` 才会导出敏感配置。

如果某个 profile 被建成了错误的 agent 类型，先 `stop` 或 `unregister --profile <name>` 清理对应后台服务，再 `profile remove <name>`，然后用正确的 `--agent` 重新创建。

### 飞书内斜杠命令

| 命令 | 作用 |
|---|---|
| `/new`, `/reset` | 清空当前会话 |
| `/cd <path>` | 切换工作目录并重置会话 |
| `/ws list` | 列出命名工作空间 |
| `/ws save <name>` | 把当前工作目录保存为命名工作空间 |
| `/ws use <name>` | 切换到命名工作空间 |
| `/ws remove <name>` | 删除命名工作空间 |
| `/resume` | 恢复同 agent、工作目录、权限模式兼容的历史会话 |
| `/status` | 查看 profile、agent、工作目录、会话、lark-cli 身份和运行状态 |
| `/config` | 调整展示偏好、访问控制和 lark-cli 身份策略 |
| `/invite user @某人` | 允许用户私聊使用 bot |
| `/invite admin @某人` | 添加访问控制管理员 |
| `/invite group` | 允许当前群使用 bot |
| `/invite all group` | 允许 bot 所在的所有群使用 |
| `/remove user @某人`, `/remove admin @某人`, `/remove group` | 移除访问控制条目 |
| `/stop` | 停止当前 run，也可点卡片停止按钮 |
| `/timeout [N\|off\|default]` | 设置或清除当前会话的 idle watchdog |
| `/ps` | 列出本机 bridge 进程 |
| `/exit <id\|#>` | 停止指定 bridge 进程 |
| `/reconnect` | 强制 WebSocket 重连 |
| `/doctor [描述]` | 执行低敏诊断 |
| `/help` | 帮助卡片 |

私聊不需要 @。群和话题群默认必须 `@bot`；`@all` 会被忽略。支持的云文档评论里 @bot 就会触发回复。

## lark-cli 身份策略

每个 profile 都使用当前 profile 的 lark-cli 目录：`~/.lark-channel/profiles/<profile>/lark-cli`。agent 子进程会收到指向这个目录的 `LARKSUITE_CLI_CONFIG_DIR`，所以一个 profile 里的个人授权不会共享给另一个 profile。

默认策略是 `bot-only`：lark-cli 使用应用 / bot 身份，不访问个人资源。当用户为了日历、邮箱、云盘等个人资源完成授权后，当前 profile 可以切到 `user-default`，保留应用身份，同时允许已授权的用户身份。owner/admin 可以在 `/config` 查看或切换这个策略；`/status` 会用 `lark-cli: app` 或 `lark-cli: user-ready` 展示当前摘要。

## 工作目录

每个 profile 都可以有一个默认工作目录：`workspaces.default`。新建 profile 时可以传 `--workspace <path>` 作为初始目录；没传时 bridge 会创建一个 profile 托管的默认工作目录。

下面只是 profile 里的字段片段，不要整段覆盖 `config.json`；请改对应 profile 下的 `workspaces` 字段。

```json
{
  "workspaces": {
    "default": "/Users/me/.lark-channel-workspaces/cursor/default"
  }
}
```

bridge 会检查所选目录存在、是目录，并且不是 `/`、Home 根、系统目录或临时目录根这类范围过大的位置。工作目录只是 agent run 的当前目录，不是文件系统 sandbox；agent 实际能访问哪些文件仍取决于本机 agent 进程及其权限模式。

## 权限模式

推荐给用户配置的是 `permissions.defaultAccess` 和 `permissions.maxAccess`。新 profile 默认两项都是 `full`，以保持 bridge 的本地工具、授权流程、文件写入等能力完整可用。如需收紧权限，可以改成 `workspace` 或 `read-only`；收紧后本地工具执行、登录 / 授权流程、文件写入等能力可能受限。

下面只是 profile 里的字段片段，不要整段覆盖 `config.json`；请改对应 profile 下的 `permissions` 字段。

```json
{
  "permissions": {
    "defaultAccess": "full",
    "maxAccess": "full"
  }
}
```

模式映射：

| Bridge access | Claude permission mode | Codex mode |
|---|---|---|
| `full` | `bypassPermissions` | `danger-full-access` |
| `workspace` | `acceptEdits` | `workspace-write` |
| `read-only` | `plan` | `read-only` |

旧版 `sandbox` 字段仍可读取。bridge 保存 profile 后，会把该设置迁移为 canonical `permissions`。

## 数据目录

| 路径 | 内容 |
|---|---|
| `~/.lark-channel/config.json` | root config，包含 profiles 和 active profile |
| `~/.lark-channel/active-profile` | 最近选择的 profile |
| `~/.lark-channel/profiles/<profile>/sessions.json` | 会话状态 |
| `~/.lark-channel/profiles/<profile>/sessions.json.catalog.json` | agent-aware 会话索引 |
| `~/.lark-channel/profiles/<profile>/workspaces.json` | 当前和命名工作空间绑定 |
| `~/.lark-channel/profiles/<profile>/secrets.enc` | profile 本地加密 secret |
| `~/.lark-channel/profiles/<profile>/lark-cli/` | 当前 profile 的 lark-cli 目录 |
| `~/.lark-channel/profiles/<profile>/media/` | 附件缓存 |
| `~/.lark-channel/profiles/<profile>/logs/` | 结构化运行日志 |
| `~/.lark-channel/registry/processes.json` | 本机进程注册表 |
| `~/.lark-channel/registry/locks/` | profile lock 和 app lock |

设置 `LARK_CHANNEL_HOME=/path/to/state` 可以迁移整棵本地状态目录。`LARK_CHANNEL_LOG_DAYS` 可以调整日志保留天数。

## 访问控制

**聊天访问默认是私有的：开箱即用时，只有"你"能在私聊和群聊里用这个 bot。** 这里的"你" = 创建 / 拥有这个飞书应用的人（也就是扫码把 bot 建起来的那位）。bot 会自动从飞书查出谁是应用 owner，所以**一个人用聊天入口完全不用配置**——你私聊它、在任意群里 @它都正常工作，其他人的聊天消息会被静默忽略（bot 不会回"你没权限"，免得暴露自己的存在）。云文档评论按文档权限生效，见下文。

想让别的同事或某些群也能用，就把他们加进下面三类名单：

| 名单 | 控制谁 | 加入 | 移除 |
|------|--------|------|------|
| **允许私聊的用户** | 谁可以私聊 bot | `/invite user @某人` | `/remove user @某人` |
| **响应的群** | bot 在哪些群里对**群内所有人**响应 | `/invite group`（当前群）/ `/invite all group`（bot 所在的全部群） | `/remove group`（当前群） |
| **管理员** | 谁能改设置、并能在任意群用 bot | `/invite admin @某人` | `/remove admin @某人` |

> `/invite`、`/remove` 这些命令只有**你（创建者）和管理员**能发。命令里 @ 的是**对方**（不是 @ bot），bot 会自动把 @ 解析成对应的人，你不用手动去找 ID。

### 两种"畅通无阻"的身份

- **你（创建者）**：不受任何名单限制——私聊、任意群、所有命令都能用，而且**永远锁不死自己**：哪怕名单配乱了，回到 bot 私聊发 `/config` 总能进来。在飞书后台把应用 owner 转给别人后，bot 也会自动跟着切换。
- **管理员**：能私聊、能用 `/config` 等管理命令，而且**不受"响应的群"名单限制**——无论群在不在名单里，bot 都会回他们。适合给一起维护 bot 的同事。

### 几种常见配置

- **只给自己用** → 什么都不用做，默认就是。
- **让某个同事能私聊 bot** → `/invite user @他`
- **让某个工作群里所有人都能用** → 在那个群里发 `/invite group`
- **第一次配，想把 bot 已经在的群一次性全开放** → 发 `/invite all group` 一键拉取 bot 所在的全部群加入名单，之后再用 `/remove group` 删掉不想要的
- **再拉个人一起当管理员** → `/invite admin @他`

### 还需要知道的

- 改完**下一条消息**就生效，不用重启。
- **群里默认要先 @bot 才会回**（私聊不用 @）。这是另一个独立开关（`/config` →"群里需要 @ bot"），和上面的名单是两回事。
- 陌生人发消息一律静默丢弃，不会有任何回复。唯一的例外：有人在一个还没开放的群里 @bot，bot 会回一句友好提示，告诉他可以让管理员发 `/invite group` 开放这个群。
- 云文档评论按文档权限生效：能在支持的文档里评论并 @bot 的人可以触发回复。

### 高级：直接改配置文件

不想在飞书里点的话，`/invite`、`/config` 背后写的是 `~/.lark-channel/config.json` 中对应 profile 的 `access` 字段。空白名单表示这个名单没人，不表示所有人都能用。下面只是 profile 里的字段片段，不要整段覆盖 `config.json`：

```json
{
  "schemaVersion": 2,
  "profiles": {
    "cursor": {
      "agentKind": "cursor",
      "access": {
        "allowedUsers": ["ou_xxxxxxxxxxxxx"],
        "allowedChats": ["oc_xxxxxxxxxxxxx"],
        "admins": ["ou_xxxxxxxxxxxxx"],
        "requireMentionInGroup": true
      }
    }
  }
}
```

`allowedUsers` / `admins` 填用户 `open_id`，`allowedChats` 填群 `chat_id`。手动找 ID 最简单的办法：让对方给 bot 发条消息（群里就 @ 它一下），然后看当前 profile 的日志：

```bash
grep '"event":"enter"' ~/.lark-channel/profiles/<profile>/logs/bridge-$(date +%Y%m%d).jsonl | tail -5
```

每行都带 `chatId`（群 / 私聊 ID）和 `senderId`（用户 `open_id`）。手改完后**重启 bridge**，或在允许的 admin 上下文里发 `/reconnect` 让它生效。日常调整还是 `/invite` / `/config` 更省事，直接改文件主要用于部署脚本预填。

## 云文档评论

云文档评论不再需要单独绑定工作目录或维护文档白名单。支持的文档评论里 @bot 后，bridge 会在同一个评论线程里回复。评论运行复用文档级 session key；没有记录过文档 cwd 时回退到用户 home 目录。

## 常见问题

**bot 没反应 / agent 不回复**：检查 `CURSOR_API_KEY` 或本机 `claude` / `codex` CLI 是否就绪；当前会话工作目录是否存在。发 `/status` 看当前状态；`/new` 重开会话往往就好。

**Cursor 相关**：确保 Cursor 桌面客户端已打开；SDK 使用本地 runtime。

**agent 子进程假死（卡片停在最后一帧不动）**：支持 idle 探活。agent 一段时间没输出就会被 SIGTERM kill，卡片末尾会标出自动终止原因。默认关闭。开启方式：`/config` 设全局值（分钟），或 `/timeout 10` 只对当前会话生效；`/timeout off` 关掉当前会话的探活；`/timeout default` 清掉会话覆盖，回退到全局设置。

**图片发过去 agent 说看不到**：升级到最新版，0.1.0 之前的版本有文件名去重 bug。

## 测试与 CI

本地检查：

```bash
pnpm test
pnpm typecheck
pnpm build
```

`pnpm test` 包含 unit、integration 和 process-level adapter 测试。CI 在 macOS、Ubuntu、Windows 上执行 `pnpm install --frozen-lockfile`、`pnpm test`、`pnpm typecheck` 和 `pnpm build`。

## 可选：遥测（Telemetry）

默认情况下 bridge **不上报任何数据**：没有指标、没有日志离开你的机器，也不引入任何遥测依赖。下面这个钩子在你主动开启前完全是空操作。

想接自己的监控时，用环境变量指向一个 default export（或导出 `createAdapter`）`AdapterFactory` 的模块：

```bash
LARK_CHANNEL_TELEMETRY_MODULE=your-telemetry-package lark-cursor-bridge start
```

该模块会收到每一条 `log.*` 事件，以及错误 / 指标钩子，转发到任何你想要的地方。接口从包根导出：

```ts
import type { AdapterFactory, TelemetryAdapter, TelemetryEvent } from 'lark-cursor-bridge';

const createAdapter: AdapterFactory = (meta) => ({
  emit(event) {/* 上报事件 */},
  recordError(err, ctx) {/* 上报异常 */},
  recordMetric(name, value, tags) {/* 上报指标 */},
  flush(timeoutMs) {/* 冲刷缓冲事件 */},
});
export default createAdapter;
```

模块不存在、工厂函数不合法、或者 adapter 抛错，都会降级为空操作——遥测永远不会阻止 bridge 启动，也不会打断日志。

## 许可与致谢

[MIT](./LICENSE)

基于 [**lark-coding-agent-bridge**](https://github.com/zarazhangrui/lark-coding-agent-bridge)（作者 [**zarazhangrui**](https://github.com/zarazhangrui)）优化扩展。

<img src="./assets/feedback-group-qr.png" alt="飞书反馈群二维码" width="360">
