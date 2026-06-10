import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { isAlive } from '../runtime/registry';
import { daemonLauncherPidPath, daemonStopFlagPath, windowsLauncherCmdPath } from './paths';

/** Startup folder .cmd that launches the daemon launcher on user logon. */
export function startupCmdPath(profile: string): string {
  const startupDir = join(
    process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
  );
  return join(startupDir, `LarkChannelBridge.${profile}.cmd`);
}

/**
 * Fallback when schtasks is blocked: a tiny script in the Startup folder
 * that invokes the full launcher.cmd (with crash-restart loop).
 */
export function buildStartupCmd(launcherPath: string): string {
  return ['@echo off', `start "" /MIN "${launcherPath}"`, ''].join('\r\n');
}

export async function installStartupFallback(profile: string): Promise<void> {
  const launcherPath = windowsLauncherCmdPath(profile);
  if (!existsSync(launcherPath)) {
    throw new Error(`launcher.cmd 不存在: ${launcherPath}，请先运行 start 或手动 build launcher`);
  }
  const startupPath = startupCmdPath(profile);
  await mkdir(join(startupPath, '..'), { recursive: true });
  await writeFile(startupPath, buildStartupCmd(launcherPath), 'utf8');
}

export async function removeStartupFallback(profile: string): Promise<void> {
  const startupPath = startupCmdPath(profile);
  if (existsSync(startupPath)) {
    await rm(startupPath, { force: true });
  }
}

export function isStartupFallbackInstalled(profile: string): boolean {
  return existsSync(startupCmdPath(profile));
}

function readLauncherPidSync(profile: string): number | undefined {
  try {
    const pid = parseInt(readFileSync(daemonLauncherPidPath(profile), 'utf8').trim(), 10);
    return Number.isFinite(pid) ? pid : undefined;
  } catch {
    return undefined;
  }
}

/** Whether the detached launcher.cmd process is still alive. */
export function isLauncherRunning(profile: string): boolean {
  const pid = readLauncherPidSync(profile);
  return pid !== undefined && isAlive(pid);
}

async function writeLauncherPid(profile: string, pid: number): Promise<void> {
  const path = daemonLauncherPidPath(profile);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, String(pid), 'utf8');
}

async function clearLauncherPid(profile: string): Promise<void> {
  const path = daemonLauncherPidPath(profile);
  if (existsSync(path)) await rm(path, { force: true });
}

/** Start launcher.cmd detached from the current terminal (background daemon). */
export function startLauncherDetached(profile: string): void {
  if (isLauncherRunning(profile)) return;
  const launcherPath = windowsLauncherCmdPath(profile);
  const child = spawn('cmd.exe', ['/c', launcherPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  if (child.pid) void writeLauncherPid(profile, child.pid);
  child.unref();
}

/** Poll until launcher.cmd exits or timeout. */
export async function waitUntilLauncherStopped(profile: string, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isLauncherRunning(profile)) {
      await clearLauncherPid(profile);
      return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return !isLauncherRunning(profile);
}

/** Signal the launcher loop to exit on its next iteration. */
export async function requestLauncherStop(profile: string): Promise<void> {
  const flag = daemonStopFlagPath(profile);
  await mkdir(join(flag, '..'), { recursive: true });
  await writeFile(flag, '', 'utf8');
}
