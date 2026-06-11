import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { daemonServiceStatePath } from './paths';

export type ServiceState = 'enabled' | 'disabled';

export async function writeServiceState(
  profile: string,
  state: ServiceState,
): Promise<void> {
  const path = daemonServiceStatePath(profile);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${state}\n`, 'utf8');
}

export async function readServiceState(profile: string): Promise<ServiceState | undefined> {
  try {
    const content = (await readFile(daemonServiceStatePath(profile), 'utf8')).trim();
    if (content === 'enabled' || content === 'disabled') return content;
    return undefined;
  } catch {
    return undefined;
  }
}

/** Sync read for batch/cmd generation and quick checks. Missing file => not disabled. */
export function isServiceDisabledSync(profile: string): boolean {
  const path = daemonServiceStatePath(profile);
  if (!existsSync(path)) return false;
  try {
    return readFileSync(path, 'utf8').trim() === 'disabled';
  } catch {
    return false;
  }
}

/** cmd.exe one-liner: exit 0 if service.state contains a line starting with "disabled". */
export function buildDisabledStateCheckCmd(statePath: string): string {
  return `if exist "${statePath}" findstr /B /C:"disabled" "${statePath}" >nul 2>nul && exit /b 0`;
}
