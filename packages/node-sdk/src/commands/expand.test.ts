import { describe, expect, it } from 'vitest';

import { parseCommandLine, substituteArgs } from './expand';

describe('substituteArgs', () => {
  it('replaces $ARGUMENTS with the whole argument string', () => {
    expect(substituteArgs('Review $ARGUMENTS now.', 'a.ts b.ts')).toBe('Review a.ts b.ts now.');
  });

  it('replaces positional $1 and $2', () => {
    expect(substituteArgs('$1 then $2', 'first second')).toBe('first then second');
  });

  it('leaves an unfilled placeholder untouched', () => {
    expect(substituteArgs('$3 is missing', 'only-one')).toBe('$3 is missing');
  });
});

describe('parseCommandLine', () => {
  it('splits a slash line into name and args', () => {
    expect(parseCommandLine('/review src/app.ts now')).toEqual({
      name: 'review',
      args: 'src/app.ts now',
    });
  });

  it('handles a bare command with no args', () => {
    expect(parseCommandLine('/help')).toEqual({ name: 'help', args: '' });
  });
});
