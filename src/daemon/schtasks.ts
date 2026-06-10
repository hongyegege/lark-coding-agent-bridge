import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  daemonLogDir,
  daemonStderrPath,
  daemonStdoutPath,
  daemonStopFlagPath,
  windowsLauncherCmdPath,
  windowsTaskName,
  windowsWatchdogCmdPath,
  windowsWatchdogTaskName,
} from './paths';
import * as watchdog from './schtasks-watchdog';
import * as startup from './schtasks-startup';
import { paths } from '../config/paths';

export interface LauncherInputs {
  /** Absolute path to node.exe. */
  nodePath: string;
  /** Absolute path to the bridge CLI entry. */
  bridgeEntryPath: string;
  /** PATH for the child process; baked into the .cmd via `set PATH=`. */
  envPath: string;
  /** Profile this service instance is pinned to. */
  profile: string;
  /** Root directory for config/profile state. */
  channelHome: string;
  /** Extra KEY=VALUE pairs baked into the launcher (Task Scheduler lacks full user env). */
  extraEnv?: Record<string, string>;
}

/**
 * Generate the .cmd wrapper script that the scheduled task actually invokes.
 *
 * schtasks `/TR` can accept a direct command, but we need stdout/stderr
 * redirection + a PATH override so child tools (lark-cli, claude) resolve
 * correctly when the daemon runs under Task Scheduler. A `.cmd` script
 * is the natural place for both.
 *
 * `@echo off` keeps the script's own commands out of the daemon log.
 * `>>` / `2>>` append (not truncate) so log history is preserved across
 * daemon restarts.
 */
/** Backoff between crash restarts in launcher.cmd (aligns with systemd RestartSec=5). */
export const DAEMON_RESTART_DELAY_SEC = 5;

function cmdSetEnv(name: string, value: string): string {
  // Escape embedded double-quotes for cmd.exe `set "NAME=VALUE"`.
  return `set "${name}=${value.replace(/"/g, '""')}"`;
}

export function buildLauncherCmd(inputs: LauncherInputs): string {
  const stderrLog = daemonStderrPath(inputs.profile);
  const stdoutLog = daemonStdoutPath(inputs.profile);
  const stopFlag = daemonStopFlagPath(inputs.profile);
  const extraLines = Object.entries(inputs.extraEnv ?? {})
    .filter(([, v]) => v.length > 0)
    .map(([k, v]) => cmdSetEnv(k, v));
  return [
    '@echo off',
    `set "LARK_CHANNEL_HOME=${inputs.channelHome}"`,
    `set "PATH=${inputs.envPath}"`,
    ...extraLines,
    'set "LARK_BRIDGE_DAEMON=1"',
    ':bridge_loop',
    `if exist "${stopFlag}" del "${stopFlag}" & exit /b 0`,
    `echo [%date% %time%] starting bridge >> "${stderrLog}"`,
    `"${inputs.nodePath}" "${inputs.bridgeEntryPath}" run --profile "${inputs.profile}" --skip-check-lark-cli >> "${stdoutLog}" 2>> "${stderrLog}"`,
    `echo [%date% %time%] bridge exited, restart in ${DAEMON_RESTART_DELAY_SEC}s >> "${stderrLog}"`,
    `timeout /t ${DAEMON_RESTART_DELAY_SEC} /nobreak >nul`,
    'goto bridge_loop',
    '',
  ].join('\r\n');
}

/** Read a User-scope env var (Task Scheduler often omits these at runtime). */
function readUserEnv(name: string): string | undefined {
  if (process.platform !== 'win32') return process.env[name];
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `[Environment]::GetEnvironmentVariable('${name}','User')`],
    { encoding: 'utf8' },
  );
  const v = r.stdout?.trim();
  return v || process.env[name]?.trim() || undefined;
}

function daemonExtraEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ['CURSOR_API_KEY', 'CURSOR_MODEL', 'LARK_APP_SECRET'] as const) {
    const v = readUserEnv(name);
    if (v) out[name] = v;
  }
  return out;
}

async function writeLauncherCmd(profile: string): Promise<void> {
  const bridgeEntryPath = process.argv[1];
  if (!bridgeEntryPath) {
    throw new Error('cannot determine bridge entry path (process.argv[1] is empty)');
  }
  const content = buildLauncherCmd({
    nodePath: process.execPath,
    bridgeEntryPath,
    envPath: process.env.PATH ?? '',
    profile,
    channelHome: paths.rootDir,
    extraEnv: daemonExtraEnv(),
  });
  const cmdPath = windowsLauncherCmdPath(profile);
  await mkdir(dirname(cmdPath), { recursive: true });
  await mkdir(daemonLogDir(profile), { recursive: true });
  await writeFile(cmdPath, content, 'utf8');
}

interface SchtasksResult {
  ok: boolean;
  stderr: string;
  stdout: string;
}

function runSchtasks(args: string[]): SchtasksResult {
  const r = spawnSync('schtasks', args, { encoding: 'utf8' });
  return {
    ok: r.status === 0,
    stderr: r.stderr ?? '',
    stdout: r.stdout ?? '',
  };
}

/**
 * Create (or overwrite) the scheduled task. Trigger: ONLOGON.
 * `/RL LIMITED` runs as the current user without admin elevation.
 * `/F` overwrites if the task already exists.
 *
 * The /TR value is the .cmd wrapper path. Schtasks treats /TR as a command
 * line, so wrapping in quotes keeps spaces in the path intact.
 */
export async function installTask(profile: string): Promise<SchtasksResult> {
  await writeLauncherCmd(profile);
  const main = runSchtasks([
    '/Create',
    '/F',
    '/SC',
    'ONLOGON',
    '/RL',
    'LIMITED',
    '/TN',
    windowsTaskName(profile),
    '/TR',
    `"${windowsLauncherCmdPath(profile)}"`,
  ]);
  if (!main.ok) {
    // schtasks often fails on managed PCs (access denied, GPO). Fall back to Startup folder.
    await startup.installStartupFallback(profile);
    return {
      ok: true,
      stderr: main.stderr,
      stdout: 'fallback:startup-folder',
    };
  }
  return watchdog.installWatchdogTask(profile);
}

/** Start the task now (regardless of trigger). */
export function runTask(profile: string): SchtasksResult {
  return runSchtasks(['/Run', '/TN', windowsTaskName(profile)]);
}

/** End the running instance. Task stays registered for next logon. */
export function endTask(profile: string): SchtasksResult {
  return runSchtasks(['/End', '/TN', windowsTaskName(profile)]);
}

/** Disable autostart (task stays registered but ONLOGON trigger won't fire). */
export function disableTask(profile: string): SchtasksResult {
  return runSchtasks(['/Change', '/TN', windowsTaskName(profile), '/Disable']);
}

/** Re-enable autostart. Called from installTask is unnecessary — /Create /F
 * resets the enabled flag. Only needed if you Disabled and want it back. */
export function enableTask(profile: string): SchtasksResult {
  return runSchtasks(['/Change', '/TN', windowsTaskName(profile), '/Enable']);
}

/** End + disable. The cross-platform "stop = stay stopped" semantic. */
export function endAndDisable(profile: string): SchtasksResult {
  const ended = endTask(profile);
  // If the task wasn't running, /End fails; we still want to disable.
  const disabled = disableTask(profile);
  // Surface whichever signal is more informative — disable result wins
  // because the autostart prevention is the user-visible effect.
  return disabled.ok ? disabled : ended.ok ? disabled : ended;
}

/** Schtasks has no native restart — end, wait, run. */
export async function restartTask(profile: string): Promise<SchtasksResult> {
  endTask(profile); // best-effort; ignore if not running
  await waitUntilStopped(profile);
  return runTask(profile);
}

/**
 * `schtasks /Query` returns 0 iff the task is registered. We toss the
 * output (it's verbose); use describeTask for full state.
 */
export function isTaskRegistered(profile: string): boolean {
  const r = spawnSync('schtasks', ['/Query', '/TN', windowsTaskName(profile)], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return r.status === 0;
}

/**
 * Parse `/Query /V /FO LIST` output for the current run state. Looks for
 * `Status: Running` in the verbose listing. Other states include
 * "Ready" (registered, not currently running) and "Disabled".
 */
export function isTaskRunning(profile: string): boolean {
  const r = runSchtasks(['/Query', '/V', '/FO', 'LIST', '/TN', windowsTaskName(profile)]);
  if (!r.ok) return false;
  return /Status:\s+Running/i.test(r.stdout);
}

export function describeTask(profile: string): string {
  const r = runSchtasks(['/Query', '/V', '/FO', 'LIST', '/TN', windowsTaskName(profile)]);
  return r.stdout || r.stderr || '';
}

export async function waitUntilStopped(profile: string, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isTaskRunning(profile)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export async function deleteTask(profile: string): Promise<SchtasksResult> {
  await watchdog.deleteWatchdogTask(profile);
  await startup.removeStartupFallback(profile);
  const r = runSchtasks(['/Delete', '/F', '/TN', windowsTaskName(profile)]);
  // Remove the launcher script too; best-effort.
  if (existsSync(windowsLauncherCmdPath(profile))) {
    await rm(windowsLauncherCmdPath(profile), { force: true });
  }
  if (existsSync(windowsWatchdogCmdPath(profile))) {
    await rm(windowsWatchdogCmdPath(profile), { force: true });
  }
  return r;
}
