import { afterEach, describe, expect, it } from 'vitest';
import {
  isCursorFastModeEnabled,
  resolveCursorModelSelection,
} from '../../../src/agent/cursor/preflight.js';

describe('cursor model selection', () => {
  const prevModel = process.env.CURSOR_MODEL;
  const prevFast = process.env.CURSOR_MODEL_FAST;

  afterEach(() => {
    if (prevModel === undefined) delete process.env.CURSOR_MODEL;
    else process.env.CURSOR_MODEL = prevModel;
    if (prevFast === undefined) delete process.env.CURSOR_MODEL_FAST;
    else process.env.CURSOR_MODEL_FAST = prevFast;
  });

  it('disables fast mode by default', () => {
    delete process.env.CURSOR_MODEL_FAST;
    expect(resolveCursorModelSelection('composer-2.5')).toEqual({
      id: 'composer-2.5',
      params: [{ id: 'fast', value: 'false' }],
    });
  });

  it('normalizes legacy *-fast model ids and still disables fast', () => {
    delete process.env.CURSOR_MODEL_FAST;
    expect(resolveCursorModelSelection('composer-2.5-fast')).toEqual({
      id: 'composer-2.5',
      params: [{ id: 'fast', value: 'false' }],
    });
  });

  it('enables fast mode only when CURSOR_MODEL_FAST is set', () => {
    process.env.CURSOR_MODEL_FAST = 'true';
    expect(isCursorFastModeEnabled()).toBe(true);
    expect(resolveCursorModelSelection('gpt-5.5')).toEqual({
      id: 'gpt-5.5',
      params: [{ id: 'fast', value: 'true' }],
    });
  });
});
