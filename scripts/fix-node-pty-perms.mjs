// Restores the executable bit on node-pty's prebuilt spawn-helper.
// pnpm's store drops +x on install, which breaks PTY spawning on
// macOS/Linux ("posix_spawnp failed"). No-op on Windows / when absent.
import { chmodSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

try {
  const prebuilds = join('node_modules', 'node-pty', 'prebuilds');
  for (const dir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, dir, 'spawn-helper');
    try {
      if ((statSync(helper).mode & 0o111) === 0) {
        chmodSync(helper, 0o755);
        console.log(`fixed +x on ${helper}`);
      }
    } catch {
      // helper missing for this platform — fine
    }
  }
} catch {
  // node-pty not installed yet — fine
}
process.exit(0);
