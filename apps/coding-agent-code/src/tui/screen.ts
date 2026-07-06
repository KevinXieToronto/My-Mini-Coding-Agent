import { emitKeypressEvents } from 'node:readline';

/** A decoded keypress. Mirrors Node's readline key object. */
export interface Key {
  name?: string; // 'return', 'backspace', 'left', 'c', … (control/named keys)
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string; // the raw bytes — for a printable key, the character itself
}

// ANSI control strings. The alternate buffer is a second, blank screen the
// terminal swaps to; leaving it restores the user's shell scrollback intact.
const ENTER_ALT = '\x1b[?1049h';
const LEAVE_ALT = '\x1b[?1049l';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

/**
 * Owns the raw terminal: alternate buffer, raw-mode stdin, keystroke decoding,
 * and a full-frame repaint. It knows nothing about agents — it moves bytes and
 * reports keys. Everything above it is pure state.
 */
export class Screen {
  private closed = false;

  constructor(
    private readonly onKey: (key: Key) => void,
    private readonly onResize: () => void,
  ) {}

  start(): void {
    process.stdout.write(ENTER_ALT + HIDE_CURSOR);
    emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', this.handleKeypress);
    process.stdout.on('resize', this.onResize);
  }

  get rows(): number {
    return process.stdout.rows ?? 24;
  }

  get columns(): number {
    return process.stdout.columns ?? 80;
  }

  /**
   * Paint one frame. `lines` are the body rows top-to-bottom; the cursor lands
   * at (cursorRow, cursorCol), both 1-based. We home the cursor, write each
   * line followed by "clear to end of line" (\x1b[K), then "clear below"
   * (\x1b[J) — so no stale characters survive from a previous, longer frame.
   */
  render(lines: string[], cursorRow: number, cursorCol: number): void {
    if (this.closed) return;
    let frame = '\x1b[H';
    for (const line of lines) frame += `${line}\x1b[K\r\n`;
    frame += '\x1b[J';
    frame += `\x1b[${cursorRow};${cursorCol}H`;
    process.stdout.write(frame);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    process.stdin.off('keypress', this.handleKeypress);
    process.stdout.off('resize', this.onResize);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write(SHOW_CURSOR + LEAVE_ALT);
  }

  private handleKeypress = (str: string | undefined, key: Key | undefined): void => {
    // Node always emits a key object; fall back to the raw string just in case.
    if (key === undefined) {
      if (str !== undefined) {
        this.onKey({ ctrl: false, meta: false, shift: false, sequence: str });
      }
      return;
    }
    this.onKey({ ...key, sequence: key.sequence ?? str ?? '' });
  };
}
