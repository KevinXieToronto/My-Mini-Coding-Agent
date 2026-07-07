import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { StoredSession } from './types';

/**
 * Where sessions live: ~/.coding-agent/sessions by default, overridable via
 * CODING_AGENT_HOME (handy for tests and for pinning sessions to a project).
 * Home, not the project dir, so `--continue` finds your last chat even after
 * you `cd` around inside the repo.
 */
function sessionsDir(): string {
  const home = process.env['CODING_AGENT_HOME'];
  return home !== undefined
    ? join(home, 'sessions')
    : join(homedir(), '.coding-agent', 'sessions');
}

/** Write (or overwrite) one session as pretty JSON. Creates the dir on demand. */
export function saveSession(session: StoredSession, dir = sessionsDir()): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${session.id}.json`), JSON.stringify(session, null, 2));
}

/** Load one session by id. Missing or unreadable → undefined (not a throw). */
export function loadSession(id: string, dir = sessionsDir()): StoredSession | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')) as StoredSession;
  } catch {
    return undefined;
  }
}

/**
 * Every saved session, newest first. A missing directory yields [] — running
 * with no history is normal, not an error (same posture as discoverSkills and
 * loadMcpConfig). A single corrupt file is skipped, not fatal to the listing.
 */
export function listSessions(dir = sessionsDir()): StoredSession[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith('.json'));
  } catch {
    return [];
  }
  const sessions: StoredSession[] = [];
  for (const file of files) {
    try {
      sessions.push(JSON.parse(readFileSync(join(dir, file), 'utf8')) as StoredSession);
    } catch {
      // skip a half-written or hand-edited file rather than crash the list
    }
  }
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The most recent session for a working directory — backs --continue. */
export function latestSession(cwd: string, dir = sessionsDir()): StoredSession | undefined {
  return listSessions(dir).find((session) => session.cwd === cwd);
}
