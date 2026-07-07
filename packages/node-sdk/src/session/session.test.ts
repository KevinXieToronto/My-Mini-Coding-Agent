import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { latestSession, listSessions, loadSession, saveSession } from './store';
import type { StoredSession } from './types';

function make(id: string, cwd: string, updatedAt: string): StoredSession {
  return {
    id,
    cwd,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    history: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: `hello from ${id}` },
    ],
  };
}

describe('session store', () => {
  it('round-trips a session through disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sess-'));
    const session = make('session_a', '/work', '2026-02-01T00:00:00.000Z');
    saveSession(session, dir);
    expect(loadSession('session_a', dir)).toEqual(session);
  });

  it('returns undefined / [] when nothing is there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sess-'));
    expect(loadSession('nope', dir)).toBeUndefined();
    expect(listSessions(join(dir, 'no-such-subdir'))).toEqual([]);
  });

  it('lists newest first and finds the latest for a cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sess-'));
    saveSession(make('older', '/work', '2026-02-01T00:00:00.000Z'), dir);
    saveSession(make('newer', '/work', '2026-03-01T00:00:00.000Z'), dir);
    saveSession(make('other', '/elsewhere', '2026-04-01T00:00:00.000Z'), dir);

    expect(listSessions(dir).map((s) => s.id)).toEqual(['other', 'newer', 'older']);
    expect(latestSession('/work', dir)?.id).toBe('newer');
  });
});
