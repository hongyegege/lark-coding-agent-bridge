import { describe, expect, it } from 'vitest';
import type { SDKAssistantMessage, SDKToolUseMessage } from '@cursor/sdk';
import { mapSdkStreamEvent } from '../../../src/agent/cursor/stream-mapper';

describe('cursor stream mapper', () => {
  it('maps assistant text blocks to AgentEvent text deltas', () => {
    const message: SDKAssistantMessage = {
      type: 'assistant',
      agent_id: 'agent-1',
      run_id: 'run-1',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hello ' },
          { type: 'text', text: 'world' },
        ],
      },
    };
    const events = [...mapSdkStreamEvent(message)];
    expect(events).toEqual([
      { type: 'text', delta: 'hello ' },
      { type: 'text', delta: 'world' },
    ]);
  });

  it('maps thinking messages', () => {
    const events = [
      ...mapSdkStreamEvent({
        type: 'thinking',
        agent_id: 'agent-1',
        run_id: 'run-1',
        text: 'planning...',
      }),
    ];
    expect(events).toEqual([{ type: 'thinking', delta: 'planning...' }]);
  });

  it('maps tool calls and tool results', () => {
    const running: SDKToolUseMessage = {
      type: 'tool_call',
      agent_id: 'agent-1',
      run_id: 'run-1',
      call_id: 'call-1',
      name: 'read_file',
      status: 'running',
      args: { path: 'README.md' },
    };
    expect([...mapSdkStreamEvent(running)]).toEqual([
      {
        type: 'tool_use',
        id: 'call-1',
        name: 'read_file',
        input: { path: 'README.md' },
      },
    ]);

    const completed: SDKToolUseMessage = {
      ...running,
      status: 'completed',
      result: 'ok',
    };
    expect([...mapSdkStreamEvent(completed)]).toEqual([
      { type: 'tool_result', id: 'call-1', output: 'ok', isError: false },
    ]);
  });
});
