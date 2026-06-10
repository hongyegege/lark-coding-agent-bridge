import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { paths } from '../config/paths';
import {
  daemonLogDir,
  daemonStderrPath,
  windowsTaskName,
  windowsWatchdogCmdPath,
  windowsWatchdogTaskName,
} from './paths';

/** Poll interval for the watchdog scheduled task (minutes). */
export const WATCHDOG_INTERVAL_MINUTES = 5;

export interface WatchdogInputs {
  profile: string;
  channelHome: string;
  mainTaskName: string;
}

/**
 * Generate watchdog.cmd — if the main bot task is not Running, trigger /Run.
 * The launcher loop handles in-process crash restarts; watchdog covers cases
 * where the entire scheduled task died (sleep/wake, external kill, etc.).
 */
export function buildWatchdogCmd(inputs: WatchdogInputs): string {
  const logPath = daemonStderrPath(inputs.profile);
  const mainTask = inputs.mainTaskName;
  return [
    '@echo off',
    `set "LARK_CHANNEL_HOME=${inputs.channelHome}"`,
    `schtasks /Query /TN "${mainTask}" /FO LIST /V 2>nul | findstr /I "Status: Running" >nul`,
    'if %ERRORLEVEL%==0 exit /b 0',
    `echo [%date% %time%] watchdog: main task not running, starting >> "${logPath}"`,
    `schtasks /Run /TN "${mainTask}" >> "${logPath}" 2>&1`,
    '',
  ].join('\r\n');
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

async function writeWatchdogCmd(profile: string): Promise<void> {
  const content = buildWatchdogCmd({
    profile,
    channelHome: paths.rootDir,
    mainTaskName: windowsTaskName(profile),
  });
  const cmdPath = windowsWatchdogCmdPath(profile);
  await mkdir(dirname(cmdPath), { recursive: true });
  await mkdir(daemonLogDir(profile), { recursive: true });
  await writeFile(cmdPath, content, 'utf8');
}

export function isWatchdogRegistered(profile: string): boolean {
  const r = spawnSync('schtasks', ['/Query', '/TN', windowsWatchdogTaskName(profile)], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return r.status === 0;
}

/** Create (or overwrite) the watchdog scheduled task. Runs every N minutes. */
export async function installWatchdogTask(profile: string): Promise<SchtasksResult> {
  await writeWatchdogCmd(profile);
  return runSchtasks([
    '/Create',
    '/F',
    '/SC',
    'MINUTE',
    '/MO',
    String(WATCHDOG_INTERVAL_MINUTES),
    '/RL',
    'LIMITED',
    '/TN',
    windowsWatchdogTaskName(profile),
    '/TR',
    `"${windowsWatchdogCmdPath(profile)}"`,
  ]);
}

export async function deleteWatchdogTask(profile: string): Promise<void> {
  if (isWatchdogRegistered(profile)) {
    runSchtasks(['/Delete', '/F', '/TN', windowsWatchdogTaskName(profile)]);
  }
  if (existsSync(windowsWatchdogCmdPath(profile))) {
    await rm(windowsWatchdogCmdPath(profile), { force: true });
  }
}
