import { describe, expect, it } from 'vitest';
import { buildWatchdogCmd, WATCHDOG_INTERVAL_MINUTES } from '../../../src/daemon/schtasks-watchdog';
import { windowsTaskName } from '../../../src/daemon/paths';

describe('schtasks watchdog', () => {
  it('builds a cmd that starts main task when not running', () => {
    const profile = 'cursor';
    const cmd = buildWatchdogCmd({
      profile,
      channelHome: 'C:\\Users\\me\\.lark-channel',
      mainTaskName: windowsTaskName(profile),
    });
    expect(cmd).toContain('schtasks /Query');
    expect(cmd).toContain(windowsTaskName(profile));
    expect(cmd).toContain('schtasks /Run');
    expect(WATCHDOG_INTERVAL_MINUTES).toBe(5);
  });
});
