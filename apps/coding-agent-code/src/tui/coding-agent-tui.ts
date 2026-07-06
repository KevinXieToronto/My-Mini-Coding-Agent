import {
  connectMcpServer,
  createAgentHarness,
  loadHarnessOptionsFromEnv,
  loadMcpConfig,
} from '@kevin.xie.toronto/coding-agent-sdk';
import type {
  AgentEvents,
  AgentHarness,
  AgentHarnessOptions,
  McpConnection,
} from '@kevin.xie.toronto/coding-agent-sdk';
import chalk from 'chalk';

import { Editor } from '#tui/editor';
import { Screen } from '#tui/screen';
import type { Key } from '#tui/screen';
import { Transcript, renderTranscript } from '#tui/transcript';

/** Read-only tools never need approval. */
const AUTO_APPROVED = new Set(['read_file', 'list_dir']);
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const DOUBLE_CTRL_C_MS = 1500;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Connect every server in mcp.json and register its tools onto the harness,
 * reporting each result through `onLine` (a transcript notice in the TUI, a
 * console line in one-shot mode). Returns the connections so callers close them.
 */
async function registerMcpServers(
  harness: AgentHarness,
  onLine: (line: string) => void,
): Promise<{ connections: McpConnection[]; toolCount: number }> {
  const { mcpServers } = loadMcpConfig();
  const connections: McpConnection[] = [];
  let toolCount = 0;
  for (const [name, config] of Object.entries(mcpServers)) {
    try {
      const connection = await connectMcpServer(name, config);
      for (const tool of connection.tools) harness.registerTool(tool);
      connections.push(connection);
      toolCount += connection.tools.length;
      onLine(`⧉ mcp: ${name} — ${connection.tools.length} tool(s)`);
    } catch (error) {
      onLine(`⧉ mcp: ${name} failed — ${message(error)}`);
    }
  }
  return { connections, toolCount };
}

/** A pending on-screen permission prompt, waiting on a keystroke. */
interface Approval {
  name: string;
  preview: string;
  resolve: (approved: boolean) => void;
}

class CodingAgentTui {
  private readonly screen: Screen;
  private readonly harness: AgentHarness;
  private readonly transcript = new Transcript();
  private readonly editor = new Editor();
  private readonly sessionApproved = new Set<string>();
  private readonly mcpConnections: McpConnection[] = [];

  private mcpToolCount = 0;
  private running = false;
  private controller: AbortController | undefined;
  private approval: Approval | undefined;
  private spinnerTimer: ReturnType<typeof setInterval> | undefined;
  private spinnerFrame = 0;
  private lastSigint = 0;
  private renderQueued = false;
  private resolveDone: (() => void) | undefined;

  constructor(private readonly options: AgentHarnessOptions) {
    this.harness = createAgentHarness(options, this.events());
    this.screen = new Screen(this.handleKey, this.scheduleRender);
  }

  /** Enter the alternate screen, connect MCP, and run until the user quits. */
  async start(): Promise<void> {
    const done = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
    this.screen.start();
    this.transcript.addNotice('coding-agent — type a task · /exit to quit · Ctrl-C to cancel');
    this.scheduleRender();

    const { connections, toolCount } = await registerMcpServers(this.harness, (line) => {
      this.transcript.addNotice(line);
      this.scheduleRender();
    });
    this.mcpConnections.push(...connections);
    this.mcpToolCount = toolCount;
    this.scheduleRender();

    await done;
  }

  // --- harness events → transcript / spinner ---------------------------------

  private events(): AgentEvents {
    return {
      onTextDelta: (delta) => {
        this.transcript.appendAssistant(delta);
        this.scheduleRender();
      },
      onText: () => {
        this.transcript.endAssistant();
        this.scheduleRender();
      },
      onToolCall: (name, args) => {
        this.transcript.addTool(name, args);
        this.scheduleRender();
      },
      onToolResult: (_name, result) => {
        this.transcript.completeTool(result);
        this.scheduleRender();
      },
      onCompaction: (before, after) => {
        this.transcript.addNotice(`⧉ compacted context: ${before} → ${after} messages`);
        this.scheduleRender();
      },
      canUseTool: (name, args) => this.requestApproval(name, args),
    };
  }

  /** Turn the canUseTool callback into an on-screen prompt resolved by a key. */
  private requestApproval(name: string, args: string): Promise<boolean> {
    if (AUTO_APPROVED.has(name) || this.sessionApproved.has(name)) {
      return Promise.resolve(true);
    }
    const preview = args.length > 120 ? `${args.slice(0, 120)}…` : args;
    return new Promise<boolean>((resolve) => {
      this.approval = { name, preview, resolve };
      this.scheduleRender();
    });
  }

  // --- input routing ---------------------------------------------------------

  private handleKey = (key: Key): void => {
    if (key.ctrl && key.name === 'c') {
      this.handleCtrlC();
      return;
    }
    if (this.approval !== undefined) {
      this.handleApprovalKey(key);
      return;
    }
    if (this.running) return; // input is disabled while the agent works

    switch (key.name) {
      case 'return':
      case 'enter':
        this.submit();
        break;
      case 'backspace':
        this.editor.backspace();
        this.scheduleRender();
        break;
      case 'left':
        this.editor.left();
        this.scheduleRender();
        break;
      case 'right':
        this.editor.right();
        this.scheduleRender();
        break;
      case 'home':
        this.editor.home();
        this.scheduleRender();
        break;
      case 'end':
        this.editor.end();
        this.scheduleRender();
        break;
      default:
        if (isPrintable(key)) {
          this.editor.insert(key.sequence);
          this.scheduleRender();
        }
    }
  };

  private handleApprovalKey(key: Key): void {
    const answer = key.sequence.toLowerCase();
    if (answer === 'a') {
      this.sessionApproved.add(this.approval!.name);
      this.resolveApproval(true);
    } else if (answer === 'y') {
      this.resolveApproval(true);
    } else {
      // n, Enter, Esc, anything else → deny
      this.resolveApproval(false);
    }
  }

  private resolveApproval(approved: boolean): void {
    this.approval?.resolve(approved);
    this.approval = undefined;
    this.scheduleRender();
  }

  private submit(): void {
    const text = this.editor.value.trim();
    this.editor.clear();
    if (text === '') {
      this.scheduleRender();
      return;
    }
    if (text === '/exit' || text === '/quit' || text === 'exit') {
      this.quit();
      return;
    }
    this.transcript.addUser(text);
    void this.runTask(text);
  }

  private async runTask(text: string): Promise<void> {
    this.running = true;
    this.controller = new AbortController();
    this.startSpinner();
    this.scheduleRender();
    try {
      await this.harness.runTask(text, this.controller.signal);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        this.transcript.addNotice(chalk.red(`error: ${message(error)}`));
      }
    } finally {
      this.transcript.endAssistant();
      this.running = false;
      this.controller = undefined;
      this.stopSpinner();
      this.scheduleRender();
    }
  }

  private handleCtrlC(): void {
    if (this.running && this.controller !== undefined) {
      this.controller.abort();
      // If a permission prompt is open, resolving it lets the loop reach the
      // aborted signal — otherwise run() would sit awaiting canUseTool forever.
      this.approval?.resolve(false);
      this.approval = undefined;
      this.transcript.addNotice('(cancelled — Ctrl-C again at the prompt to quit)');
      this.scheduleRender();
      return;
    }
    const now = Date.now();
    if (now - this.lastSigint < DOUBLE_CTRL_C_MS) {
      this.quit();
      return;
    }
    this.lastSigint = now;
    this.transcript.addNotice('(press Ctrl-C again to quit)');
    this.scheduleRender();
  }

  private quit(): void {
    this.stopSpinner();
    this.screen.close();
    void Promise.allSettled(this.mcpConnections.map((c) => c.close())).then(() => {
      this.resolveDone?.();
    });
  }

  // --- rendering -------------------------------------------------------------

  private startSpinner(): void {
    this.spinnerFrame = 0;
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER.length;
      this.scheduleRender();
    }, 90);
  }

  private stopSpinner(): void {
    if (this.spinnerTimer !== undefined) clearInterval(this.spinnerTimer);
    this.spinnerTimer = undefined;
  }

  // Coalesce bursts of deltas into one repaint per tick.
  private scheduleRender = (): void => {
    if (this.renderQueued) return;
    this.renderQueued = true;
    setImmediate(() => {
      this.renderQueued = false;
      this.draw();
    });
  };

  private draw(): void {
    const width = this.screen.columns;
    const height = this.screen.rows;

    const body = renderTranscript(this.transcript.all, width);
    const status = this.renderStatus(width);
    const input = this.renderInput();

    // Reserve the bottom two rows for status + input; pin the transcript above.
    const viewport = Math.max(1, height - 2);
    const visible = body.slice(Math.max(0, body.length - viewport));
    const padding = Array<string>(Math.max(0, viewport - visible.length)).fill('');
    const lines = [...padding, ...visible, status, input];

    // Cursor sits on the input row (the last row) at the editor's position.
    const cursorRow = height;
    const cursorCol =
      this.approval !== undefined ? input.length + 1 : 2 + this.editor.cursor + 1;
    this.screen.render(lines, cursorRow, cursorCol);
  }

  private renderStatus(width: number): string {
    const state = this.running
      ? `${chalk.yellow(SPINNER[this.spinnerFrame] ?? '')} working…`
      : chalk.green('ready');
    const model = this.options.model ?? 'gpt-4o-mini';
    const mcp = this.mcpToolCount > 0 ? ` · ${this.mcpToolCount} mcp tools` : '';
    const line = `${state} · ${model}${mcp} · Ctrl-C to cancel`;
    return chalk.dim(line.slice(0, width));
  }

  private renderInput(): string {
    if (this.approval !== undefined) {
      return chalk.yellow(`allow ${this.approval.name}(${this.approval.preview})? [y/N/a=always] `);
    }
    return chalk.cyan('❯ ') + this.editor.value;
  }
}

/** Printable = a single character that isn't a control/meta combo. */
function isPrintable(key: Key): boolean {
  return key.sequence.length === 1 && !key.ctrl && !key.meta && key.sequence >= ' ';
}

/** One-shot / non-interactive mode: stream to stdout, no full-screen UI. */
async function runOneShot(options: AgentHarnessOptions, prompt: string): Promise<void> {
  let streaming = false;
  const harness = createAgentHarness(options, {
    onTextDelta: (delta) => {
      if (!streaming) {
        process.stdout.write('\n');
        streaming = true;
      }
      process.stdout.write(delta);
    },
    onText: () => {
      if (streaming) {
        process.stdout.write('\n');
        streaming = false;
      }
    },
    onToolCall: (name, args) => {
      const preview = args.length > 120 ? `${args.slice(0, 120)}…` : args;
      console.log(chalk.dim(`  ⏺ ${name}(${preview})`));
    },
    onToolResult: (_name, result) => {
      console.log(chalk.dim(`    ↳ ${(result.split('\n')[0] ?? '').slice(0, 100)}`));
    },
    onCompaction: (before, after) => {
      console.log(chalk.dim(`  ⧉ compacted context: ${before} → ${after} messages`));
    },
    // Non-interactive: no one to ask. Trust the prompt. A real CLI would gate
    // this behind an explicit --yes / --dangerously-skip-permissions flag.
    canUseTool: () => true,
  });
  const { connections } = await registerMcpServers(harness, (line) =>
    console.log(chalk.dim(`  ${line}`)),
  );
  try {
    await harness.runTask(prompt);
  } finally {
    await Promise.allSettled(connections.map((c) => c.close()));
  }
}

export async function startTui(prompt?: string): Promise<void> {
  const loaded = loadHarnessOptionsFromEnv();
  if (!loaded.ok) {
    console.error(chalk.red(loaded.error));
    process.exit(1);
  }

  // A full-screen UI only makes sense on a real terminal. One-shot mode
  // (`coding-agent "fix the test"`) and piped stdin fall back to plain output.
  if (prompt !== undefined || !process.stdin.isTTY) {
    if (prompt === undefined) {
      console.error(chalk.red('no prompt given and stdin is not a TTY.'));
      process.exit(1);
    }
    await runOneShot(loaded.options, prompt);
    return;
  }

  await new CodingAgentTui(loaded.options).start();
}
