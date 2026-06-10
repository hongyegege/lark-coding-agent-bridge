import { AgentPreflightError, type AgentAvailability } from '../preflight';

const CURSOR_DASHBOARD_URL = 'https://cursor.com/dashboard/integrations';

export function resolveCursorApiKey(): string | undefined {
  const key = process.env.CURSOR_API_KEY?.trim();
  return key || undefined;
}

export function resolveCursorModel(): string {
  return process.env.CURSOR_MODEL?.trim() || 'composer-2.5';
}

export interface CursorModelSelection {
  id: string;
  params?: Array<{ id: string; value: string }>;
}

/** True when CURSOR_MODEL_FAST is explicitly enabled (default: off). */
export function isCursorFastModeEnabled(): boolean {
  const raw = process.env.CURSOR_MODEL_FAST?.trim().toLowerCase();
  if (!raw) return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/**
 * Build a Cursor SDK model selection with Fast explicitly controlled.
 * Cursor defaults many models to the fast variant; bridge callers opt out by default.
 */
export function resolveCursorModelSelection(model?: string): CursorModelSelection {
  const raw = (model ?? resolveCursorModel()).trim();
  const id = raw.replace(/-fast$/i, '');
  return {
    id,
    params: [{ id: 'fast', value: isCursorFastModeEnabled() ? 'true' : 'false' }],
  };
}

export async function checkCursorAvailability(): Promise<AgentAvailability> {
  const apiKey = resolveCursorApiKey();
  if (!apiKey) {
    const diagnostic = {
      code: 'cursor-api-key-missing' as const,
      agentId: 'cursor' as const,
      agentName: 'Cursor Agent',
      command: 'CURSOR_API_KEY',
    };
    return {
      ok: false,
      diagnostic,
      error: new AgentPreflightError(
        diagnostic,
        `Cursor API Key 未配置。请在 ${CURSOR_DASHBOARD_URL} 创建 User API Key，并设置环境变量 CURSOR_API_KEY。`,
      ),
    };
  }

  try {
    await import('@cursor/sdk');
  } catch (err) {
    const diagnostic = {
      code: 'cursor-sdk-unavailable' as const,
      agentId: 'cursor' as const,
      agentName: 'Cursor Agent',
      command: '@cursor/sdk',
      stderrExcerpt: err instanceof Error ? err.message : String(err),
    };
    return {
      ok: false,
      diagnostic,
      error: new AgentPreflightError(diagnostic, '@cursor/sdk 不可用，请重新安装 lark-cursor-bridge。'),
    };
  }

  return { ok: true, version: `@cursor/sdk (${resolveCursorModel()})` };
}

export function formatCursorPreflightHint(): string {
  return [
    '✗ 未配置 Cursor API Key。',
    '',
    '1. 打开 Cursor Dashboard → Integrations 创建 User API Key',
    `   ${CURSOR_DASHBOARD_URL}`,
    '2. 设置用户环境变量（PowerShell）：',
    "   [System.Environment]::SetEnvironmentVariable('CURSOR_API_KEY', 'cursor_...', 'User')",
    '3. 重新打开终端后运行 bridge',
  ].join('\n');
}
