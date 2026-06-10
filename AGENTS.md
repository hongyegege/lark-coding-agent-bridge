# AI Agent 配置指引（开箱即用）

本文档面向 **AI Coding Agent**（Cursor、Claude Code、Codex 等）。当用户把本仓库克隆到本机并请求「帮我配置 / 开箱即用」时，请按本文档分步引导并完成初始化。

> 面向人类的完整说明见 [README.zh.md](./README.zh.md)（中文）与 [README.md](./README.md)（英文）。

---

## 你的角色

1. **检查环境**：确认 Node.js、依赖安装、Cursor API Key、飞书 Bot 凭据是否就绪。
2. **向用户收集缺失信息**：App ID、App Secret、API Key 等（见下文清单）。
3. **在本机项目目录执行命令**：安装、构建、启动 bridge。
4. **验证**：引导用户在飞书私聊 bot 发送 `/status`，确认联通。
5. **不要输出或提交密钥**：App Secret、API Key 只用于本地配置，勿写入 git、勿在群聊复述。

默认 agent 为 **Cursor**（`--agent cursor`）。用户明确要求时再改用 `claude` 或 `codex`。

---

## 开始前：向用户说明需要什么

用简洁中文告诉用户，要完成开箱即用，需要准备：

| 项目 | 说明 | 如何获取 |
|------|------|----------|
| **Node.js ≥ 20.12.0** | 运行 bridge | [nodejs.org](https://nodejs.org/) |
| **飞书 Bot App ID** | 形如 `cli_xxxxxxxx` | 飞书开放平台 → 企业自建应用 |
| **飞书 Bot App Secret** | 应用密钥 | 同上，「凭证与基础信息」 |
| **Cursor User API Key** | 形如 `cursor_...` | [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) |
| **Cursor 客户端** | 本地 SDK runtime | 安装并保持 Cursor 桌面版可用 |
| **（可选）项目路径** | agent 工作目录 | 用户本机代码仓库路径 |

若用户尚未创建飞书应用，先引导完成 **「飞书 Bot 应用创建」**（下一节），再回来继续。

---

## 飞书 Bot 应用创建（引导用户操作）

在 [飞书开放平台](https://open.feishu.cn/app)（国际版用 [Lark](https://open.larksuite.com/app)）创建 **企业自建应用**，并完成：

### 能力与权限

- 启用 **机器人** 能力
- 启用 **长连接（WebSocket）** 接收事件（勿仅用 webhook 请求地址）
- 事件订阅：`im.message.receive_v1`、卡片回调等（bridge 首次连接时会校验）
- 消息与 **CardKit 流式卡片** 相关权限

### 身份策略（推荐 bot-only）

本 fork 默认 **仅 Bot 身份**（App ID + Secret），无需用户 OAuth 即可收发 IM 消息。bridge 初始化 profile 时会配置 `lark-cli config strict-mode bot`。

### 记录凭据

让用户从「凭证与基础信息」复制：

- **App ID** → 供 `--app-id` 使用
- **App Secret** → 供 `--app-secret` 或环境变量 `LARK_APP_SECRET` 使用

国际版 Lark 应用在启动时加 `--tenant lark`。

---

## 环境变量（Agent 应帮用户设置）

### Cursor（默认）

**Windows PowerShell（用户级，重启终端后生效）：**

```powershell
[System.Environment]::SetEnvironmentVariable('CURSOR_API_KEY', 'cursor_...', 'User')
# 可选
[System.Environment]::SetEnvironmentVariable('CURSOR_MODEL', 'composer-2.5', 'User')
```

**macOS / Linux：**

```bash
# 写入 ~/.bashrc 或 ~/.zshrc
export CURSOR_API_KEY='cursor_...'
export CURSOR_MODEL='composer-2.5'   # 可选
```

设置后 **新开终端** 再执行 bridge 命令。

### 飞书 Secret（后台服务 / 非交互启动）

Windows 计划任务等非交互场景需要预先设置：

```powershell
[System.Environment]::SetEnvironmentVariable('LARK_APP_SECRET', 'your_app_secret', 'User')
```

---

## 分步执行清单（Agent 在本机仓库根目录操作）

按顺序执行；某步失败则诊断后再继续。

### 步骤 1：确认 Node 版本

```bash
node -v
```

要求 `v20.12.0` 或更高。

### 步骤 2：安装依赖并构建

```bash
cd <仓库根目录>
npm install
npm run build
```

> **Windows 注意**：`@cursor/sdk` 依赖 `sqlite3` 原生模块。若 `npm install` 报 node-gyp 错误，请安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含「使用 C++ 的桌面开发」）后重试。

### 步骤 3：全局安装 CLI（推荐，后台服务必需）

```bash
npm i -g .
```

安装后可用 `lark-cursor-bridge`（兼容旧名 `lark-channel-bridge`）。

### 步骤 4：首次前台启动（联调）

向用户索取 App ID；App Secret 优先交互输入，勿在日志中 echo：

```bash
lark-cursor-bridge run --app-id <APP_ID> --agent cursor
```

或一次性传入（仅本机临时环境）：

```bash
# PowerShell
$env:LARK_APP_SECRET = '<secret>'
lark-cursor-bridge run --app-id <APP_ID> --app-secret $env:LARK_APP_SECRET --agent cursor
```

**PersonalAgent 扫码模式**（用户无现成 app 时）：

```bash
lark-cursor-bridge run --agent cursor
```

终端会出现二维码，用户用飞书 App 扫码并按提示创建/绑定应用。

首次成功会在 `~/.lark-channel/config.json` 写入 profile。

### 步骤 5：在飞书中验证

引导用户：

1. 在飞书 **私聊** 该 bot
2. 发送 `/cd <本机项目绝对路径>` 切换工作区
3. 发送一条简单任务（如「列出当前目录文件」）
4. 发送 `/status` 查看 profile、agent、工作目录、运行状态

### 步骤 6：（可选）注册后台常驻

确认前台收发正常后，用户按 `Ctrl-C` 停掉前台进程，再：

```powershell
# Windows 示例
lark-cursor-bridge start --profile cursor --agent cursor --app-id <APP_ID> --skip-check-lark-cli
lark-cursor-bridge status --profile cursor
```

`start` **必须** 使用全局安装的 CLI，不要用 `npx`（daemon 会记录 CLI 路径）。

---

## 常见问题（Agent 自行排查）

| 现象 | 处理 |
|------|------|
| `Cursor API Key 未配置` | 检查 `CURSOR_API_KEY` 用户环境变量，重启终端 |
| `@cursor/sdk 不可用` | 重新 `npm install` 并 `npm run build` |
| bot 无回复 | 发 `/status`；检查 WebSocket/长连接、应用是否发布 |
| `lark-channel context detected but not bound` | 请用户重启 bridge 或运行 preflight/doctor，勿自行 bind 或读 config 密钥 |
| 工作目录无效 | 用户发送 `/cd <存在的目录路径>` |
| Windows 后台启动失败 | 确认 `LARK_APP_SECRET` 已设为 User 环境变量；见 README 计划任务章节 |

---

## 安全与权限提醒（告知用户即可）

- 默认 **仅应用创建者** 可在私聊和群聊使用 bot；其他人消息会被静默忽略。
- 开放同事或群：`/invite user @某人`、`/invite group`（详见 README 访问控制章节）。
- 新 profile 默认权限为 `full`（本地 agent 完整能力）；生产环境可在 `/config` 或 profile 配置中收紧。

---

## 命令速查（初始化阶段）

```text
lark-cursor-bridge run [--app-id <id>] [--app-secret <secret>] [--agent cursor|claude|codex]
lark-cursor-bridge start [--profile <name>] [--agent cursor]
lark-cursor-bridge status [--profile <name>]
lark-cursor-bridge stop [--profile <name>]
lark-cursor-bridge profile list
lark-cursor-bridge --help
```

飞书内：`/help`、`/status`、`/cd <path>`、`/new`、`/stop`。

---

## 完成标准

当以下均满足时，可告知用户「开箱即用配置完成」：

- [ ] `npm run build` 成功
- [ ] `lark-cursor-bridge run` 前台无报错，WebSocket 已连接
- [ ] 飞书私聊 bot 能收到流式卡片回复
- [ ] `/status` 显示 agent 为 cursor、工作目录正确
- [ ] （若需要 24/7）`lark-cursor-bridge status` 显示后台服务运行中
