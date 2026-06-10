import { execFile } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { log } from '../../core/logger';

const execFileAsync = promisify(execFile);

export async function ensureCursorWorkspace(cwd: string): Promise<void> {
  await mkdir(cwd, { recursive: true, mode: 0o700 });

  const gitDir = join(cwd, '.git');
  let hasGit = true;
  try {
    await access(gitDir);
  } catch {
    hasGit = false;
  }

  if (!hasGit) {
    await execFileAsync('git', ['init'], { cwd, windowsHide: true });
    log.info('agent', 'cursor-workspace-git-init', { cwd });
  }

  const readme = join(cwd, 'README.md');
  try {
    await access(readme);
  } catch {
    await writeFile(
      readme,
      '# Lark Cursor Bridge Workspace\n\nThis directory is managed by lark-cursor-bridge.\n',
      'utf8',
    );
  }
}
