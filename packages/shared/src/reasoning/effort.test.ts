import { describe, expect, it } from 'vitest';

import {
  REASONING_EFFORTS,
  REASONING_EFFORT_OVERRIDES,
  ReasoningEffortOverrideSchema,
  ReasoningEffortSchema,
} from './effort';

describe('ReasoningEffort', () => {
  it('lists the four base efforts in escalating order', () => {
    expect(REASONING_EFFORTS).toEqual(['off', 'low', 'medium', 'high']);
  });

  it('parses each base effort and rejects an unknown value', () => {
    for (const effort of REASONING_EFFORTS) {
      expect(ReasoningEffortSchema.parse(effort)).toBe(effort);
    }
    expect(ReasoningEffortSchema.safeParse('xhigh').success).toBe(false);
    expect(ReasoningEffortSchema.safeParse('inherit').success).toBe(false);
  });

  it('adds inherit on the override enum and keeps the base values', () => {
    expect(REASONING_EFFORT_OVERRIDES).toEqual(['inherit', 'off', 'low', 'medium', 'high']);
    expect(ReasoningEffortOverrideSchema.parse('inherit')).toBe('inherit');
    expect(ReasoningEffortOverrideSchema.safeParse('nope').success).toBe(false);
  });
});
