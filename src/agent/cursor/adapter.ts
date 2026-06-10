import type { Run, SDKAgent } from '@cursor/sdk';
import { log } from '../../core/logger';
import { buildBridgeSystemPrompt } from '../bridge-system-prompt';
import type { AgentAvailability } from '../preflight';
import {
  checkCursorAvailability,
  resolveCursorApiKey,
  resolveCursorModelSelection,
  type CursorModelSelection,
} from './preflight';
import { ensureCursorWorkspace } from './workspace';
import { mapSdkStreamEvent } from './stream-mapper';
import type {
  AgentAdapter,
  AgentBotIdentity,
  AgentEvent,
  AgentRun,
  AgentRunOptions,
} from '../types';

export interface CursorAdapterOptions {
  model?: string;
}

interface ActiveCursorRun {
  cancel: () => Promise<void>;
  waitForCompletion: () => Promise<void>;
}

interface CachedCursorAgent {
  agent: SDKAgent;
  cwd: string;
  lastUsedAt: number;
}

/** Reconnect local SDK agent after this idle gap to avoid stale HTTP/2 sessions. */
const CURSOR_IDLE_RECONNECT_MS = 3 * 60_000;
const CURSOR_RUN_RECONNECT_MAX_ATTEMPTS = 2;

export class CursorAdapter implements AgentAdapter {
  readonly id = 'cursor';
  readonly displayName = 'Cursor Agent';

  private readonly modelSelection: CursorModelSelection;
  private botIdentity: AgentBotIdentity | undefined;
  private activeRun: ActiveCursorRun | undefined;
  private readonly sessionAgents = new Map<string, CachedCursorAgent>();

  constructor(opts: CursorAdapterOptions = {}) {
    this.modelSelection = resolveCursorModelSelection(opts.model);
  }

  setBotIdentity(identity: AgentBotIdentity): void {
    this.botIdentity = identity;
  }

  async releaseSession(sessionId: string): Promise<void> {
    const cached = this.sessionAgents.get(sessionId);
    if (!cached) return;
    this.sessionAgents.delete(sessionId);
    try {
      await cached.agent[Symbol.asyncDispose]();
      log.info('agent', 'cursor-agent-released', { sessionId });
    } catch (err) {
      log.warn('agent', 'cursor-agent-release-failed', {
        sessionId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  touchSessionLastUsed(sessionId: string): void {
    const cached = this.sessionAgents.get(sessionId);
    if (cached) cached.lastUsedAt = Date.now();
  }

  async isAvailable(): Promise<boolean> {
    return (await this.checkAvailability()).ok;
  }

  async checkAvailability(): Promise<AgentAvailability> {
    return checkCursorAvailability();
  }

  async prepareRun(opts: AgentRunOptions): Promise<void> {
    if (opts.cwd) {
      await ensureCursorWorkspace(opts.cwd);
    }
  }

  async acquireAgentForRun(
    Agent: CursorAgentModule,
    CursorAgentError: CursorSdkErrorClass,
    input: {
      apiKey: string;
      cwd: string;
      sessionId?: string;
      modelSelection: { id: string };
    },
  ): Promise<SDKAgent> {
    if (input.sessionId) {
      const cached = this.sessionAgents.get(input.sessionId);
      if (cached && cached.cwd === input.cwd) {
        const idleMs = Date.now() - cached.lastUsedAt;
        if (idleMs < CURSOR_IDLE_RECONNECT_MS) {
          cached.lastUsedAt = Date.now();
          log.info('agent', 'cursor-agent-reuse', { sessionId: input.sessionId, idleMs });
          return cached.agent;
        }
        log.info('agent', 'cursor-agent-idle-refresh', {
          sessionId: input.sessionId,
          idleMs,
        });
        await this.releaseSession(input.sessionId);
      } else if (cached) {
        await this.releaseSession(input.sessionId);
      }
    }

    const agent = await createOrResumeAgentWithRetry(Agent, CursorAgentError, input);
    this.sessionAgents.set(agent.agentId, {
      agent,
      cwd: input.cwd,
      lastUsedAt: Date.now(),
    });
    log.info('agent', 'cursor-agent-acquired', {
      sessionId: agent.agentId,
      resumed: Boolean(input.sessionId),
    });
    return agent;
  }

  run(opts: AgentRunOptions): AgentRun {
    if (!opts.cwd) {
      throw new Error('cwd is required for CursorAdapter.run');
    }

    const apiKey = resolveCursorApiKey();
    if (!apiKey) {
      throw new Error('CURSOR_API_KEY is required for CursorAdapter.run');
    }

    const prompt = `${buildBridgeSystemPrompt(this.botIdentity)}\n\n${opts.prompt}`;
    const modelSelection = opts.model
      ? resolveCursorModelSelection(opts.model)
      : this.modelSelection;
    const adapter = this;
    let runFinished = false;
    let stopRequested = false;

    const events = createCursorEventStream({
      adapter,
      apiKey,
      modelSelection,
      cwd: opts.cwd,
      sessionId: opts.sessionId,
      prompt,
      onActiveRun: (active) => {
        adapter.activeRun = active;
      },
      onRunFinished: () => {
        runFinished = true;
        adapter.activeRun = undefined;
      },
      isStopRequested: () => stopRequested,
    });

    return {
      runId: opts.runId,
      events,
      async stop() {
        stopRequested = true;
        const active = adapter.activeRun;
        if (active) {
          log.info('agent', 'cursor-cancel', { runId: opts.runId });
          await active.cancel();
        }
      },
      waitForExit(timeoutMs: number): Promise<boolean> {
        if (runFinished) return Promise.resolve(true);
        return new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), timeoutMs);
          const poll = setInterval(() => {
            if (runFinished) {
              clearInterval(poll);
              clearTimeout(timer);
              resolve(true);
            }
          }, 50);
        });
      },
    };
  }
}

interface CursorEventStreamInput {
  adapter: CursorAdapter;
  apiKey: string;
  modelSelection: CursorModelSelection;
  cwd: string;
  sessionId?: string;
  prompt: string;
  onActiveRun: (active: ActiveCursorRun) => void;
  onRunFinished: () => void;
  isStopRequested: () => boolean;
}

type CursorSdkErrorClass = typeof import('@cursor/sdk').CursorAgentError;
type CursorAgentModule = typeof import('@cursor/sdk').Agent;

const CURSOR_STARTUP_MAX_ATTEMPTS = 3;
const CURSOR_STARTUP_RETRY_BASE_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableCursorError(
  err: unknown,
  CursorAgentError: CursorSdkErrorClass,
): boolean {
  if (!(err instanceof CursorAgentError)) return false;
  if (err.isRetryable) return true;
  return /network request failed|timed out|timeout|econnreset|econnrefused|fetch failed/i.test(
    err.message,
  );
}

function formatCursorAgentError(err: InstanceType<CursorSdkErrorClass>): string {
  const parts = [err.message];
  const cause = err.cause;
  if (cause instanceof Error && cause.message && cause.message !== err.message) {
    parts.push(cause.message);
  } else if (typeof cause === 'string' && cause.trim()) {
    parts.push(cause.trim());
  }
  if (err.operation) parts.push(`operation=${err.operation}`);
  if (err.code) parts.push(`code=${err.code}`);
  return parts.join(' · ');
}

async function createOrResumeAgentWithRetry(
  Agent: CursorAgentModule,
  CursorAgentError: CursorSdkErrorClass,
  input: Pick<CursorEventStreamInput, 'apiKey' | 'cwd' | 'sessionId'> & {
    modelSelection: { id: string };
  },
): Promise<SDKAgent> {
  const agentOptions = {
    apiKey: input.apiKey,
    model: input.modelSelection,
    local: { cwd: input.cwd, settingSources: [] as const },
  };

  let lastErr: unknown;
  for (let attempt = 1; attempt <= CURSOR_STARTUP_MAX_ATTEMPTS; attempt++) {
    try {
      if (input.sessionId) {
        try {
          return await Agent.resume(input.sessionId, agentOptions);
        } catch (err) {
          const resumeNotFound =
            err instanceof CursorAgentError &&
            (err.name === 'AgentNotFoundError' || err.code === 'agent_not_found');
          if (!resumeNotFound && !isRetryableCursorError(err, CursorAgentError)) {
            throw err;
          }
          log.warn('agent', 'cursor-resume-fallback', {
            sessionId: input.sessionId,
            attempt,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return await Agent.create(agentOptions);
    } catch (err) {
      lastErr = err;
      if (!isRetryableCursorError(err, CursorAgentError) || attempt === CURSOR_STARTUP_MAX_ATTEMPTS) {
        throw err;
      }
      log.warn('agent', 'cursor-start-retry', {
        attempt,
        err: err instanceof Error ? err.message : String(err),
      });
      await sleep(CURSOR_STARTUP_RETRY_BASE_MS * attempt);
    }
  }
  throw lastErr;
}

function formatRunResultError(result: {
  status: string;
  result?: string;
  id: string;
}): string {
  const parts = [`Cursor Agent 运行结束，状态为 ${result.status}`];
  const detail = result.result?.trim();
  if (detail && detail !== result.status) {
    parts.push(detail);
  } else if (result.status === 'error') {
    parts.push(
      '本地 Cursor runtime 可能未响应或无法连接 Cursor 云端（API key exchange / HTTP2）。请确认 Cursor IDE 已打开、网络/VPN 正常，必要时重启 Cursor 与 bridge',
    );
  }
  parts.push(`runId=${result.id}`);
  return parts.join('：');
}

function isConnectAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /\[canceled\]|operation was aborted|aborted|econnreset|socket hang up/i.test(
    err.message,
  );
}

function isRecoverableRunFailure(err: unknown, resultStatus?: string): boolean {
  if (resultStatus === 'cancelled') return false;
  if (resultStatus === 'error') return true;
  if (err instanceof Error) {
    return (
      isConnectAbortError(err) ||
      /network request failed|timed out|timeout|econnreset|econnrefused|fetch failed/i.test(
        err.message,
      )
    );
  }
  return false;
}

async function sendWithRetry(
  agent: SDKAgent,
  prompt: string,
  modelSelection: { id: string },
  CursorAgentError: CursorSdkErrorClass,
  forceNewRun: boolean,
): Promise<Run> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= CURSOR_STARTUP_MAX_ATTEMPTS; attempt++) {
    try {
      return await agent.send(prompt, {
        model: modelSelection,
        ...(forceNewRun ? { local: { force: true } } : {}),
      });
    } catch (err) {
      lastErr = err;
      if (!isRetryableCursorError(err, CursorAgentError) || attempt === CURSOR_STARTUP_MAX_ATTEMPTS) {
        throw err;
      }
      log.warn('agent', 'cursor-send-retry', {
        attempt,
        err: err instanceof Error ? err.message : String(err),
      });
      await sleep(CURSOR_STARTUP_RETRY_BASE_MS * attempt);
    }
  }
  throw lastErr;
}

async function* createCursorEventStream(
  input: CursorEventStreamInput,
): AsyncGenerator<AgentEvent> {
  let agent: SDKAgent | undefined;
  let agentId: string | undefined;
  let CursorAgentError: typeof import('@cursor/sdk').CursorAgentError;
  try {
    ({ CursorAgentError } = await import('@cursor/sdk'));
  } catch (err) {
    yield {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      terminationReason: 'failed',
    };
    return;
  }

  const modelSelection = input.modelSelection;
  const modelId = modelSelection.id.trim();
  if (!modelId) {
    yield {
      type: 'error',
      message:
        'Cursor Agent 未配置模型。请设置环境变量 CURSOR_MODEL（例如 composer-2.5），或在 profile 中指定 model。',
      terminationReason: 'failed',
    };
    return;
  }

  try {
    const { Agent } = await import('@cursor/sdk');
    let resumeSessionId = input.sessionId;

    for (let runAttempt = 1; runAttempt <= CURSOR_RUN_RECONNECT_MAX_ATTEMPTS; runAttempt++) {
      if (runAttempt > 1 && agentId) {
        log.warn('agent', 'cursor-run-reconnect', {
          sessionId: agentId,
          attempt: runAttempt,
        });
        await input.adapter.releaseSession(agentId);
        resumeSessionId = agentId;
      }

      agent = await input.adapter.acquireAgentForRun(Agent, CursorAgentError, {
        apiKey: input.apiKey,
        cwd: input.cwd,
        sessionId: resumeSessionId,
        modelSelection,
      });

      agentId = agent.agentId;
      if (runAttempt === 1) {
        yield {
          type: 'system',
          sessionId: agentId,
          cwd: input.cwd,
          model: modelId,
        };
      }

      const forceNewRun = runAttempt > 1 || !resumeSessionId;
      let run: Run;
      try {
        run = await sendWithRetry(
          agent,
          input.prompt,
          modelSelection,
          CursorAgentError,
          forceNewRun,
        );
        log.info('agent', 'cursor-run-started', { agentId, runId: run.id, runAttempt });
      } catch (err) {
        if (
          runAttempt < CURSOR_RUN_RECONNECT_MAX_ATTEMPTS &&
          isRecoverableRunFailure(err)
        ) {
          log.warn('agent', 'cursor-send-reconnect', {
            attempt: runAttempt,
            err: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
        if (err instanceof CursorAgentError) {
          yield {
            type: 'error',
            message: `Cursor Agent 启动失败: ${formatCursorAgentError(err)}`,
            terminationReason: 'failed',
          };
          return;
        }
        throw err;
      }

      let cancelled = false;
      input.onActiveRun({
        cancel: async () => {
          if (cancelled) return;
          cancelled = true;
          if (run.supports('cancel')) {
            await run.cancel();
          }
        },
        waitForCompletion: async () => {
          await run.wait();
        },
      });

      let streamedAnyText = false;
      try {
        for await (const message of run.stream()) {
          if (input.isStopRequested()) break;
          for (const evt of mapSdkStreamEvent(message)) {
            if (evt.type === 'text' && evt.delta) streamedAnyText = true;
            yield evt;
          }
        }
      } catch (err) {
        if (!input.isStopRequested()) {
          const streamErrorMessage = isConnectAbortError(err)
            ? 'Cursor Agent 流式连接中断（SDK stall 或本地 runtime 无响应）'
            : err instanceof Error
              ? err.message
              : String(err);
          log.warn('agent', 'cursor-stream-interrupted', {
            attempt: runAttempt,
            runId: run.id,
            err: streamErrorMessage,
          });
          // Do not reconnect here — SDK stall often fires while the run still completes.
          // Fall through to run.wait() and only reconnect if wait also fails.
        }
      }

      let result: Awaited<ReturnType<Run['wait']>>;
      try {
        result = await run.wait();
      } catch (err) {
        if (
          runAttempt < CURSOR_RUN_RECONNECT_MAX_ATTEMPTS &&
          isRecoverableRunFailure(err)
        ) {
          log.warn('agent', 'cursor-wait-reconnect', {
            attempt: runAttempt,
            err: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
        if (err instanceof CursorAgentError) {
          yield {
            type: 'error',
            message: `Cursor Agent 运行失败: ${formatCursorAgentError(err)}`,
            terminationReason: input.isStopRequested() ? 'interrupted' : 'failed',
          };
          return;
        }
        throw err;
      }

      input.adapter.touchSessionLastUsed(agentId);

      if (input.isStopRequested()) {
        yield {
          type: 'done',
          sessionId: agentId,
          terminationReason: 'interrupted',
        };
        return;
      }

      if (result.status === 'error' || result.status === 'cancelled') {
        log.warn('agent', 'cursor-run-terminal', {
          agentId,
          runId: result.id,
          status: result.status,
          result: result.result,
          runAttempt,
        });
        if (
          runAttempt < CURSOR_RUN_RECONNECT_MAX_ATTEMPTS &&
          isRecoverableRunFailure(undefined, result.status)
        ) {
          log.warn('agent', 'cursor-result-reconnect', {
            attempt: runAttempt,
            runId: result.id,
          });
          continue;
        }
        yield {
          type: 'error',
          message: formatRunResultError(result),
          terminationReason: result.status === 'cancelled' ? 'interrupted' : 'failed',
        };
        return;
      }

      const finalText = result.result?.trim();
      if (!streamedAnyText && finalText) {
        yield { type: 'text', delta: finalText };
      }

      yield {
        type: 'done',
        sessionId: agentId,
        terminationReason: 'normal',
      };
      return;
    }
  } catch (err) {
    if (agentId) {
      await input.adapter.releaseSession(agentId);
    }
    if (err instanceof CursorAgentError) {
      yield {
        type: 'error',
        message: `Cursor Agent 错误: ${formatCursorAgentError(err)}`,
        terminationReason: 'failed',
      };
      return;
    }
    yield {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      terminationReason: 'failed',
    };
  } finally {
    input.onRunFinished();
  }
}
