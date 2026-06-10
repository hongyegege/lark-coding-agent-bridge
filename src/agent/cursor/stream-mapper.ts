import type { SDKMessage } from '@cursor/sdk';
import type { AgentEvent } from '../types';

export function* mapSdkStreamEvent(event: SDKMessage): Generator<AgentEvent> {
  switch (event.type) {
    case 'assistant':
      for (const block of event.message.content) {
        if (block.type === 'text') {
          yield { type: 'text', delta: block.text };
        } else if (block.type === 'tool_use') {
          yield {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }
      }
      return;
    case 'thinking':
      yield { type: 'thinking', delta: event.text };
      return;
    case 'tool_call':
      if (event.status === 'running') {
        yield {
          type: 'tool_use',
          id: event.call_id,
          name: event.name,
          input: event.args ?? {},
        };
        return;
      }
      yield {
        type: 'tool_result',
        id: event.call_id,
        output: formatToolResult(event.result),
        isError: event.status === 'error',
      };
      return;
    default:
      return;
  }
}

function formatToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result === undefined) return '';
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}
