import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveServiceProfile } from './service';

export interface ShortcutsInstallOptions {
  profile?: string;
}

function resolveDesktopDir(): string {
  if (process.platform === 'win32') {
    const r = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', '[Environment]::GetFolderPath("Desktop")'],
      { encoding: 'utf8' },
    );
    const desktop = r.stdout?.trim();
    if (desktop) return desktop;
  }
  return join(homedir(), 'Desktop');
}

export async function runShortcutsInstall(opts: ShortcutsInstallOptions = {}): Promise<void> {
  if (process.platform !== 'win32') {
    console.error('shortcuts install 目前仅支持 Windows。');
    console.error('请使用 `lark-cursor-bridge start` / `stop` 管理服务。');
    process.exit(1);
  }

  const profile = await resolveServiceProfile(opts.profile);
  const desktop = resolveDesktopDir();
  await mkdir(desktop, { recursive: true });

  const enablePath = join(desktop, '启用飞书 Bot.cmd');
  const disablePath = join(desktop, '停用飞书 Bot.cmd');

  const enableBody = [
    '@echo off',
    'chcp 65001 >nul',
    `lark-cursor-bridge start --profile ${profile}`,
    'pause',
    '',
  ].join('\r\n');

  const disableBody = [
    '@echo off',
    'chcp 65001 >nul',
    `lark-cursor-bridge stop --profile ${profile}`,
    'pause',
    '',
  ].join('\r\n');

  await writeFile(enablePath, enableBody, 'utf8');
  await writeFile(disablePath, disableBody, 'utf8');

  console.log('✓ 已在桌面创建快捷方式:');
  console.log(`  ${enablePath}`);
  console.log(`  ${disablePath}`);
  console.log('');
  console.log('  启用 → 无窗口后台运行 + 登录自启');
  console.log('  停用 → 停止 Bot 并取消自启（关闭 CMD 窗口不会再次弹出）');
}
