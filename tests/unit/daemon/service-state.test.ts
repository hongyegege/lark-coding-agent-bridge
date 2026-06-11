import { describe, expect, it } from 'vitest';
import { buildDisabledStateCheckCmd } from '../../../src/daemon/service-state';
import { buildLaunchHiddenVbs, buildStartupCmd } from '../../../src/daemon/schtasks-startup';
import { buildLauncherCmd } from '../../../src/daemon/schtasks';

describe('Windows daemon service state and hidden launch', () => {
  it('buildDisabledStateCheckCmd exits when service.state is disabled', () => {
    const cmd = buildDisabledStateCheckCmd('C:\\home\\.lark-channel\\daemon\\cursor\\service.state');
    expect(cmd).toContain('findstr /B /C:"disabled"');
    expect(cmd).toContain('exit /b 0');
  });

  it('buildLaunchHiddenVbs runs launcher with hidden window', () => {
    const vbs = buildLaunchHiddenVbs('C:\\home\\launcher.cmd');
    expect(vbs).toContain('WScript.Shell');
    expect(vbs).toContain('launcher.cmd');
    expect(vbs).toContain(', 0, False');
  });

  it('buildStartupCmd checks disabled state and uses wscript', () => {
    const cmd = buildStartupCmd({
      vbsPath: 'C:\\home\\launch-hidden.vbs',
      statePath: 'C:\\home\\service.state',
    });
    expect(cmd).toContain('findstr /B /C:"disabled"');
    expect(cmd).toContain('wscript.exe //B //Nologo');
    expect(cmd).not.toContain('start "" /MIN');
  });

  it('buildLauncherCmd checks disabled state in bridge_loop', () => {
    const inputs = {
      nodePath: '/usr/local/bin/node',
      bridgeEntryPath: '/repo/bin/lark-cursor-bridge.mjs',
      envPath: '/usr/local/bin',
      profile: 'cursor',
      channelHome: '/tmp/lark-channel-home',
    };
    const cmd = buildLauncherCmd(inputs);
    expect(cmd).toContain('service.state');
    expect((cmd.match(/findstr \/B \/C:"disabled"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
