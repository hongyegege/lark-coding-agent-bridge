# lark-cursor-bridge

A lightweight bot that bridges **Feishu / Lark** messenger with your local **Cursor Agent** (`@cursor/sdk` runtime). Claude Code and Codex CLI are also supported. Run one command, bind a Feishu Bot app, and drive your local coding agent from chat — read images, edit files, run commands.

[中文 README](./README.zh.md)

## About this project

This repository is an **optimized fork** of the upstream project [**lark-coding-agent-bridge**](https://github.com/zarazhangrui/lark-coding-agent-bridge) by [**zarazhangrui**](https://github.com/zarazhangrui).

| | Upstream | This fork |
|---|----------|-----------|
| **Default agent** | Claude Code / Codex | **Cursor Agent** |
| **CLI name** | `lark-channel-bridge` | `lark-cursor-bridge` (alias kept) |
| **Extra** | — | Cursor SDK integration, Windows 24/7 task scheduler + watchdog |

We thank the original author for the bridge architecture, Feishu card streaming, session model, and multi-profile design. Issues specific to this Cursor fork should be reported in **this** repository; upstream features may still apply.

For a product walkthrough, see the [Feishu community document](https://larkcommunity.feishu.cn/docx/OaRIdFIRFoLM3xxTmKwcetHqn5e).

---

## Out-of-the-box quick start

**Goal:** clone to your PC, install once, talk to the bot in Feishu within minutes.

### Option A — Let an AI coding agent configure it (recommended)

1. Clone this repo to your machine.
2. Open the folder in **Cursor** (or another AI coding agent).
3. Ask: *「请按 AGENTS.md 帮我完成 lark-cursor-bridge 的开箱即用配置」*.
4. The agent will walk you through Feishu App ID / Secret, Cursor API Key, install, build, and first run.

Step-by-step playbook for agents: **[AGENTS.md](./AGENTS.md)**.

### Option B — Manual setup (Cursor, recommended)

#### 1. Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js **≥ 20.12.0** | `node -v` |
| **Cursor User API Key** | [Dashboard → Integrations](https://cursor.com/dashboard/integrations) |
| **Cursor desktop app** | SDK uses the local runtime |
| **Feishu Bot app** | Enterprise self-built app with bot + WebSocket events |

Set the API key (PowerShell, user scope — restart terminal after):

```powershell
[System.Environment]::SetEnvironmentVariable('CURSOR_API_KEY', 'cursor_...', 'User')
```

Optional model (default `composer-2.5`):

```powershell
[System.Environment]::SetEnvironmentVariable('CURSOR_MODEL', 'composer-2.5', 'User')
```

#### 2. Install from source

```bash
git clone <this-repo-url>
cd lark-cursor-bridge
npm install
npm run build
npm i -g .
```

On **Windows**, if `npm install` fails on `sqlite3` / node-gyp, install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the C++ workload and retry.

#### 3. First foreground run

With an existing Feishu app:

```bash
lark-cursor-bridge run --app-id cli_xxxxxxxx --agent cursor
```

You will be prompted for **App Secret** if not passed via `--app-secret` or `LARK_APP_SECRET`.

Or use the QR wizard (PersonalAgent):

```bash
lark-cursor-bridge run --agent cursor
```

Config is written to `~/.lark-channel/config.json`.

#### 4. Use it in Feishu

1. DM the bot in Feishu.
2. Send `/cd /path/to/your/project` to set the workspace.
3. Send a task; replies stream on one card.

#### 5. Background service (optional)

After foreground works, stop with `Ctrl-C`, then:

```bash
lark-cursor-bridge start --agent cursor --app-id cli_xxxxxxxx
lark-cursor-bridge status
```

See [Background service](#background-service) and [Windows 24/7 deployment](#windows-247-deployment) below.

---

## What it does

- Forwards Feishu / Lark messages to local **Cursor Agent** / Claude Code / Codex CLI. DM directly, or `@bot` in a group.
- **Streaming card**: text replies and tool calls update on one Lark card in real time.
- **Session continuity**: each chat, topic, or document comment thread keeps its own session.
- **Queueing and batching**: rapid messages are merged; messages during a run queue for the next turn. Commands like `/new`, `/cd`, `/ws use`, `/stop` can interrupt the current task.
- **Multiple workspaces**: `/cd` switches project; `/ws` saves and reuses directories.
- **Images and files**: send to the bot; the bridge downloads locally for the agent.
- **Interactive cards**: `/help`, `/ws list`, `/status` return clickable cards.

## Use cases

- **Mobile coding**: review or fix code from Feishu on your phone while the agent runs on your PC.
- **Team bot**: one machine hosts the bridge; invite colleagues or groups via `/invite`.
- **Multi-agent**: separate profiles for Cursor, Claude, and Codex with different Feishu apps.
- **Always-on assistant**: register a OS service (launchd / systemd / Task Scheduler) for 24/7 operation.

## Prerequisites

- Node.js **≥ 20.12.0**
- **Cursor (default)**: `CURSOR_API_KEY` configured (see above)
- Or another local agent:
  - Claude Code: `claude` — https://docs.anthropic.com/en/docs/claude-code/quickstart
  - Codex CLI: `codex` — https://developers.openai.com/codex/cli
- A Feishu / Lark **Bot app** (enterprise self-built or PersonalAgent via QR wizard)

### Feishu bot app requirements

Create an app at [Feishu Open Platform](https://open.feishu.cn/app) (or [Lark](https://open.larksuite.com/app) for global tenants):

- Enable **bot** capability and **WebSocket (long connection)** for events
- Subscribe to `im.message.receive_v1` and card callbacks
- Enable messaging and **CardKit** / streaming card permissions
- Copy **App ID** (`cli_…`) and **App Secret** for bridge initialization

Recommended identity policy: **bot-only** (App ID + Secret; no user OAuth required for IM). The bridge configures `lark-cli config strict-mode bot` on profile bootstrap.

## Install (npm global)

```bash
npm i -g lark-cursor-bridge
# legacy alias:
# npm i -g lark-channel-bridge
```

## First run

```bash
lark-cursor-bridge run
# or: --agent cursor | claude | codex
```

First run opens a QR wizard (unless `--app-id` is provided):

1. QR code in terminal.
2. Scan with Feishu / Lark app.
3. Pick or create a PersonalAgent app.
4. Choose agent if prompted.
5. Config → `~/.lark-channel/config.json`.

No project path required upfront; send `/cd <path>` in Feishu after startup.

```bash
lark-cursor-bridge run --app-id cli_xxx
lark-cursor-bridge start --app-id cli_xxx --agent cursor
```

For Lark global apps: `--tenant lark`.

## Background service

Use `run` for first setup and debugging. After the bot sends/receives correctly, stop foreground (`Ctrl-C`), then use a **per-profile service**:

```bash
lark-cursor-bridge start
lark-cursor-bridge status
lark-cursor-bridge stop
```

**Install globally before service commands.** The daemon records the CLI path; `npx` cache paths break after cleanup. `run` via `npx` is fine for one-shot foreground use.

```bash
lark-cursor-bridge start [--profile <name>]
lark-cursor-bridge stop [--profile <name>]
lark-cursor-bridge restart [--profile <name>]
lark-cursor-bridge status [--profile <name>]
lark-cursor-bridge unregister [--profile <name>]
```

Platform mapping:

- **macOS**: launchd user agent `ai.lark-channel-bridge.bot.<profile>`
- **Linux**: systemd user unit `lark-channel-bridge.bot.<profile>.service`
- **Windows**: Task Scheduler `LarkChannelBridge.Bot.<profile>`, launcher `.cmd`

Daemon logs: `~/.lark-channel/profiles/<profile>/logs/daemon/`.

### Windows 24/7 deployment

After foreground validation, register a scheduled task so the bridge runs without a terminal.

**User-level env vars** (required for non-interactive `start`):

| Variable | Purpose |
|----------|---------|
| `CURSOR_API_KEY` | Cursor SDK auth |
| `LARK_APP_SECRET` | Feishu Bot secret |
| `CURSOR_MODEL` | Optional, default `composer-2.5` |

```powershell
cd <bridge-repo>
npm run build
npm i -g .

$env:LARK_APP_SECRET = [Environment]::GetEnvironmentVariable('LARK_APP_SECRET','User')
lark-cursor-bridge start --profile cursor --agent cursor --skip-check-lark-cli
lark-cursor-bridge status --profile cursor
```

- Main task `LarkChannelBridge.Bot.<profile>`: starts at logon; launcher restarts on crash (~5s)
- Watchdog `LarkChannelBridge.Watchdog.<profile>`: every 5 minutes, re-runs if stopped
- Launcher: `~/.lark-channel/daemon/<profile>/launcher.cmd`
- Logs: `~/.lark-channel/profiles/<profile>/logs/daemon/daemon-stdout.log`

**24/7 notes:** user must log in once; keep Cursor open; disable sleep; optional auto-login + Cursor startup.

```powershell
lark-cursor-bridge restart --profile cursor
lark-cursor-bridge stop --profile cursor
lark-cursor-bridge unregister --profile cursor
```

After upgrading: `npm i -g .` then `lark-cursor-bridge start` again.

If Task Scheduler is blocked by policy, `start` falls back to **Startup folder + background launcher**.

### Multiple profiles: Claude and Codex

Each profile keeps its own credentials, sessions, workspaces, and logs. Use `profile use <name>` to switch defaults. Create multiple profiles when connecting several apps or running agents in parallel:

```bash
lark-cursor-bridge start --profile claude --agent claude
lark-cursor-bridge start --profile codex --agent codex
lark-cursor-bridge restart --profile codex
lark-cursor-bridge status --profile codex
```

## Commands

### Host CLI

```text
lark-cursor-bridge run [--profile <name>] [--agent cursor|claude|codex] [--workspace <path>] [-c <config>]
lark-cursor-bridge migrate [--profile <name>] [--agent cursor|claude|codex]
lark-cursor-bridge ps
lark-cursor-bridge kill <id|#>
lark-cursor-bridge --help
```

Profile management:

```bash
lark-cursor-bridge profile create cursor --agent cursor
lark-cursor-bridge profile list
lark-cursor-bridge profile use <name>
lark-cursor-bridge profile remove <name>
lark-cursor-bridge profile remove <name> --purge --yes
lark-cursor-bridge profile export <name> [--output ./profile.json] [--force]
lark-cursor-bridge profile export <name> --include-secrets --yes
```

`profile remove` archives by default; `--purge --yes` deletes permanently. `profile export` redacts secrets unless `--include-secrets --yes`.

### Slash commands in Feishu / Lark

| Command | Effect |
|---|---|
| `/new`, `/reset` | Clear session |
| `/cd <path>` | Switch working directory |
| `/ws list` | List named workspaces |
| `/ws save <name>` | Save current directory |
| `/ws use <name>` | Switch to named workspace |
| `/ws remove <name>` | Delete named workspace |
| `/resume` | Resume compatible history |
| `/status` | Profile, agent, cwd, session, lark-cli identity |
| `/config` | Presentation, access, lark-cli identity policy |
| `/invite user @name` | Allow DM access |
| `/invite admin @name` | Add admin |
| `/invite group` | Allow current group |
| `/invite all group` | Allow all joined groups |
| `/remove user @name`, `/remove admin @name`, `/remove group` | Remove access |
| `/stop` | Stop current run |
| `/timeout [N\|off\|default]` | Idle watchdog |
| `/ps`, `/exit <id\|#>` | Process management |
| `/reconnect` | Force WebSocket reconnect |
| `/doctor [description]` | Diagnostics |
| `/help` | Help card |

DMs need no `@`. Groups require `@bot` by default. Cloud-doc comments run when the bot is mentioned.

## lark-cli identity policy

Each profile uses a **profile-local lark-cli directory** at `~/.lark-channel/profiles/<profile>/lark-cli`. The agent receives `LARKSUITE_CLI_CONFIG_DIR` for that path.

Default **bot-only**: lark-cli uses app/bot identity. After user OAuth for calendar/mail/drive, switch to `user-default` via `/config`. `/status` shows `lark-cli: app` or `lark-cli: user-ready`.

## Working directories

Set `workspaces.default` per profile, or pass `--workspace <path>` on create. Snippet only — edit the profile field, do not replace whole `config.json`:

```json
{
  "workspaces": {
    "default": "/Users/me/.lark-channel-workspaces/cursor/default"
  }
}
```

The bridge rejects overly broad paths (`/`, home root, system dirs). The cwd is not a filesystem sandbox; actual access depends on the agent permission mode.

## Permission modes

Recommended: `permissions.defaultAccess` and `permissions.maxAccess`. New profiles default both to `full`.

```json
{
  "permissions": {
    "defaultAccess": "full",
    "maxAccess": "full"
  }
}
```

| Bridge access | Claude | Codex |
|---|---|---|
| `full` | `bypassPermissions` | `danger-full-access` |
| `workspace` | `acceptEdits` | `workspace-write` |
| `read-only` | `plan` | `read-only` |

The legacy `sandbox` field is still readable; saves migrate to canonical `permissions`.

## Data directories

| Path | Content |
|---|---|
| `~/.lark-channel/config.json` | Root config, profiles, active profile |
| `~/.lark-channel/profiles/<profile>/sessions.json` | Session state |
| `~/.lark-channel/profiles/<profile>/workspaces.json` | Workspace bindings |
| `~/.lark-channel/profiles/<profile>/secrets.enc` | Encrypted secrets |
| `~/.lark-channel/profiles/<profile>/lark-cli/` | Profile-local lark-cli |
| `~/.lark-channel/profiles/<profile>/logs/` | Structured logs |

`LARK_CHANNEL_HOME` relocates all state. `LARK_CHANNEL_LOG_DAYS` sets log retention.

## Access control

**Chat access is private by default: out of the box, only *you* (the app owner) can use the bot in DMs and groups.** Others are silently ignored. Cloud-doc comments are document-scoped; see below.

| List | Controls | Add | Remove |
|------|----------|-----|--------|
| Allowed users | who can DM | `/invite user @them` | `/remove user @them` |
| Allowed chats | which groups answer for everyone | `/invite group` / `/invite all group` | `/remove group` |
| Admins | settings + any group | `/invite admin @them` | `/remove admin @them` |

Creator and admins bypass lists. Common setups:

- **Just me** → default, nothing to do.
- **Teammate DM** → `/invite user @them`
- **Open a work group** → `/invite group` in that group
- **First-time setup, onboard every group the bot is already in** → `/invite all group`

Changes apply on the next message. In groups you must `@` the bot (separate toggle in `/config`).

Advanced snippet for `access` in profile config:

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

Find IDs from logs: `grep '"event":"enter"' ~/.lark-channel/profiles/<profile>/logs/bridge-*.jsonl | tail -5`

## Cloud-doc comments

Cloud-doc comments are document-scoped: mention the bot in a supported document comment thread and the bridge replies there. No separate workspace binding or allowlist. Falls back to user home when no document cwd was recorded.

## FAQ

**Bot silent / agent never replies:** Check agent login (or `CURSOR_API_KEY`), cwd exists. Send `/status`; try `/new`.

**Card frozen:** Enable idle watchdog via `/config` or `/timeout 10`.

**Agent cannot see image:** Upgrade; pre-0.1.0 had a filename dedup bug.

**Cursor-specific:** Keep Cursor desktop running; SDK uses local runtime.

## Testing and CI

```bash
pnpm test
pnpm typecheck
pnpm build
```

CI runs on macOS, Ubuntu, and Windows.

## Optional telemetry

By default the bridge reports **nothing**. Opt in via `LARK_CHANNEL_TELEMETRY_MODULE=your-package lark-cursor-bridge start`.

## License

[MIT](./LICENSE)

## Acknowledgments

Built on [**lark-coding-agent-bridge**](https://github.com/zarazhangrui/lark-coding-agent-bridge) by [**zarazhangrui**](https://github.com/zarazhangrui).

<img src="./assets/feedback-group-qr.png" alt="Feedback group QR code" width="360">
